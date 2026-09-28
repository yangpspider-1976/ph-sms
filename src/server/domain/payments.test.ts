import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db, resetDb } from "@/test/db";
import { createTenant, type Tenant } from "@/test/fixtures";
import { payments, paymentEvents } from "@/server/db/schema";
import { MockPaymentProvider, findPackage } from "@/server/providers/payments";
import { hmacHex } from "@/server/security/crypto";
import { getWallet, reserveFunds } from "./wallet";
import { ingestPaymentEvent, reconcilePayment, startCheckout } from "./payments";

/**
 * Requirement 9: forged, duplicated and out-of-order payment events, and events
 * with the wrong amount or currency, must never grant extra credit.
 */

const SECRET = "mock-payment-secret";
const PKG = findPackage("demo-1000")!;

function event(payload: Record<string, unknown>, opts: { signed?: boolean } = {}) {
  const body = JSON.stringify(payload);
  return {
    body,
    headers: {
      "x-mock-payment-signature": opts.signed === false ? "00".repeat(32) : hmacHex(SECRET, body),
    },
  };
}

function paidPayload(reference: string, overrides: Record<string, unknown> = {}) {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2, 10)}`,
    reference,
    type: "PAID",
    amountCentavos: PKG.amountCentavos,
    currency: "PHP",
    merchantId: "demo-merchant",
    environment: "demo",
    packageCode: PKG.code,
    ...overrides,
  };
}

let tenant: Tenant;
let provider: MockPaymentProvider;

async function checkout() {
  return startCheckout({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    packageCode: PKG.code,
    provider,
  });
}

beforeEach(async () => {
  await resetDb();
  // Start with no funding so credit movements are unambiguous.
  tenant = await createTenant({ fundingCentavos: 0 });
  provider = new MockPaymentProvider();
});
afterAll(closeDb);

describe("checkout", () => {
  it("records a pending payment with a snapshot of the package", async () => {
    const started = await checkout();
    const row = (await db.select().from(payments).where(eq(payments.id, started.paymentId)))[0]!;

    expect(row.status).toBe("PENDING");
    expect(row.amountCentavos).toBe(PKG.amountCentavos);
    expect(row.packageSnapshot).toMatchObject({ code: PKG.code });
    // Nothing is credited just for starting a checkout.
    expect((await getWallet(tenant.organizationId)).postedBalanceCentavos).toBe(0);
  });

  it("a browser returning from the gateway grants nothing by itself", async () => {
    const started = await checkout();
    // The redirect target is a page; no code path credits from it.
    expect(started.redirectUrl).toContain(started.reference);
    expect((await getWallet(tenant.organizationId)).postedBalanceCentavos).toBe(0);
  });
});

describe("authenticating events", () => {
  it("refuses a forged signature and stores nothing", async () => {
    const started = await checkout();
    const { body, headers } = event(paidPayload(started.reference), { signed: false });

    const outcome = await ingestPaymentEvent(body, headers, provider);
    expect(outcome.status).toBe("REJECTED");

    expect(await db.select().from(paymentEvents)).toHaveLength(0);
    expect((await getWallet(tenant.organizationId)).postedBalanceCentavos).toBe(0);
  });

  it("refuses a malformed payload", async () => {
    const body = "{not json";
    const outcome = await ingestPaymentEvent(
      body,
      { "x-mock-payment-signature": hmacHex(SECRET, body) },
      provider,
    );
    expect(outcome.status).toBe("REJECTED");
  });

  it("credits the wallet on a verified PAID event", async () => {
    const started = await checkout();
    const { body, headers } = event(paidPayload(started.reference));

    const outcome = await ingestPaymentEvent(body, headers, provider);
    expect(outcome).toMatchObject({ status: "CREDITED", creditCentavos: PKG.creditCentavos });

    const wallet = await getWallet(tenant.organizationId);
    expect(wallet.postedBalanceCentavos).toBe(PKG.creditCentavos);

    const row = (await db.select().from(payments).where(eq(payments.id, started.paymentId)))[0]!;
    expect(row.status).toBe("PAID");
    expect(row.postedAt).not.toBeNull();
  });
});

describe("duplicate and replayed events", () => {
  it("the same event id credits once", async () => {
    const started = await checkout();
    const { body, headers } = event(paidPayload(started.reference));

    expect((await ingestPaymentEvent(body, headers, provider)).status).toBe("CREDITED");
    expect((await ingestPaymentEvent(body, headers, provider)).status).toBe("DUPLICATE");
    expect((await ingestPaymentEvent(body, headers, provider)).status).toBe("DUPLICATE");

    expect((await getWallet(tenant.organizationId)).postedBalanceCentavos).toBe(
      PKG.creditCentavos,
    );
  });

  // Two DIFFERENT events for one payment: the event-id index does not catch
  // this, so the payment's own status has to.
  it("a second, different PAID event for the same payment credits nothing", async () => {
    const started = await checkout();

    const first = event(paidPayload(started.reference, { eventId: "evt-first" }));
    const second = event(paidPayload(started.reference, { eventId: "evt-second" }));

    expect((await ingestPaymentEvent(first.body, first.headers, provider)).status).toBe(
      "CREDITED",
    );
    expect((await ingestPaymentEvent(second.body, second.headers, provider)).status).toBe(
      "ALREADY_SETTLED",
    );

    expect((await getWallet(tenant.organizationId)).postedBalanceCentavos).toBe(
      PKG.creditCentavos,
    );
  });

  it("an out-of-order FAILED after PAID does not remove the credit", async () => {
    const started = await checkout();
    const paid = event(paidPayload(started.reference, { eventId: "evt-p" }));
    await ingestPaymentEvent(paid.body, paid.headers, provider);

    const failed = event(paidPayload(started.reference, { eventId: "evt-f", type: "FAILED" }));
    await ingestPaymentEvent(failed.body, failed.headers, provider);

    expect((await getWallet(tenant.organizationId)).postedBalanceCentavos).toBe(
      PKG.creditCentavos,
    );
    const row = (await db.select().from(payments).where(eq(payments.id, started.paymentId)))[0]!;
    expect(row.status).toBe("PAID");
  });
});

describe("mismatched events", () => {
  it("rejects a larger amount than was charged at checkout", async () => {
    const started = await checkout();
    const { body, headers } = event(
      paidPayload(started.reference, { amountCentavos: PKG.amountCentavos * 10 }),
    );

    const outcome = await ingestPaymentEvent(body, headers, provider);
    expect(outcome.status).toBe("MISMATCH");
    expect((await getWallet(tenant.organizationId)).postedBalanceCentavos).toBe(0);
  });

  it("rejects the wrong currency", async () => {
    const started = await checkout();
    const { body, headers } = event(paidPayload(started.reference, { currency: "USD" }));
    expect((await ingestPaymentEvent(body, headers, provider)).status).toBe("MISMATCH");
    expect((await getWallet(tenant.organizationId)).postedBalanceCentavos).toBe(0);
  });

  it("rejects a different merchant or environment", async () => {
    const a = await checkout();
    const wrongMerchant = event(paidPayload(a.reference, { merchantId: "someone-else" }));
    expect((await ingestPaymentEvent(wrongMerchant.body, wrongMerchant.headers, provider)).status).toBe(
      "MISMATCH",
    );

    const b = await checkout();
    const wrongEnv = event(paidPayload(b.reference, { environment: "production" }));
    expect((await ingestPaymentEvent(wrongEnv.body, wrongEnv.headers, provider)).status).toBe(
      "MISMATCH",
    );

    expect((await getWallet(tenant.organizationId)).postedBalanceCentavos).toBe(0);
  });

  it("rejects a package that was not the one purchased", async () => {
    const started = await checkout();
    const { body, headers } = event(paidPayload(started.reference, { packageCode: "demo-500" }));
    expect((await ingestPaymentEvent(body, headers, provider)).status).toBe("MISMATCH");
    expect((await getWallet(tenant.organizationId)).postedBalanceCentavos).toBe(0);
  });

  it("credits nothing for a reference we never issued", async () => {
    const { body, headers } = event(paidPayload("pay_never_existed"));
    expect((await ingestPaymentEvent(body, headers, provider)).status).toBe("UNKNOWN_REFERENCE");
    expect((await getWallet(tenant.organizationId)).postedBalanceCentavos).toBe(0);
  });
});

describe("refunds and chargebacks", () => {
  it("a chargeback takes the credit back", async () => {
    const started = await checkout();
    const paid = event(paidPayload(started.reference, { eventId: "evt-paid" }));
    await ingestPaymentEvent(paid.body, paid.headers, provider);

    const back = event(
      paidPayload(started.reference, { eventId: "evt-cb", type: "CHARGEBACK" }),
    );
    await ingestPaymentEvent(back.body, back.headers, provider);

    const wallet = await getWallet(tenant.organizationId);
    expect(wallet.postedBalanceCentavos).toBe(0);
    expect(wallet.debtCentavos).toBe(0);
  });

  it("a chargeback beyond the remaining balance records debt and freezes sending", async () => {
    const started = await checkout();
    const paid = event(paidPayload(started.reference, { eventId: "evt-paid2" }));
    await ingestPaymentEvent(paid.body, paid.headers, provider);

    // Spend 90,000 of the 100,000 credited, so the chargeback cannot be covered.
    const { captureFromReservation } = await import("./wallet");
    const held = await db.transaction((tx) =>
      reserveFunds(tx, {
        organizationId: tenant.organizationId,
        amountCentavos: 90_000,
        operationRef: "spend-most",
      }),
    );
    await db.transaction((tx) =>
      captureFromReservation(tx, {
        reservationId: held.reservationId,
        amountCentavos: 90_000,
        operationRef: "capture-most",
      }),
    );

    const back = event(
      paidPayload(started.reference, { eventId: "evt-cb2", type: "CHARGEBACK" }),
    );
    await ingestPaymentEvent(back.body, back.headers, provider);

    const wallet = await getWallet(tenant.organizationId);
    expect(wallet.postedBalanceCentavos).toBe(0);
    // 10,000 was left, so a 100,000 chargeback leaves 90,000 owed.
    // The shortfall is recorded, not hidden.
    expect(wallet.debtCentavos).toBe(90_000);
    expect(wallet.sendingFrozen).toBe(true);
  });
});

describe("reconciliation", () => {
  it("credits a payment whose event never arrived", async () => {
    const started = await checkout();
    provider.recordDemoCharge({
      externalEventId: "recon-1",
      reference: started.reference,
      type: "PAID",
      amountCentavos: PKG.amountCentavos,
      currency: "PHP",
      merchantId: "demo-merchant",
      environment: "demo",
      packageCode: PKG.code,
      occurredAt: new Date(),
    });

    const outcome = await reconcilePayment(started.reference, provider);
    expect(outcome.status).toBe("CREDITED");
    expect((await getWallet(tenant.organizationId)).postedBalanceCentavos).toBe(
      PKG.creditCentavos,
    );
  });

  it("does not double-credit a payment whose event did arrive", async () => {
    const started = await checkout();
    const paid = event(paidPayload(started.reference, { eventId: "evt-both" }));
    await ingestPaymentEvent(paid.body, paid.headers, provider);

    provider.recordDemoCharge({
      externalEventId: "recon-2",
      reference: started.reference,
      type: "PAID",
      amountCentavos: PKG.amountCentavos,
      currency: "PHP",
      merchantId: "demo-merchant",
      environment: "demo",
      packageCode: PKG.code,
      occurredAt: new Date(),
    });

    expect((await reconcilePayment(started.reference, provider)).status).toBe("ALREADY_SETTLED");
    expect((await getWallet(tenant.organizationId)).postedBalanceCentavos).toBe(
      PKG.creditCentavos,
    );
  });
});

describe("tenant isolation", () => {
  it("an event for one tenant's payment never credits another", async () => {
    const other = await createTenant({ fundingCentavos: 0 });
    const started = await checkout();

    const { body, headers } = event(
      paidPayload(started.reference, { organizationId: other.organizationId }),
    );
    await ingestPaymentEvent(body, headers, provider);

    expect((await getWallet(tenant.organizationId)).postedBalanceCentavos).toBe(
      PKG.creditCentavos,
    );
    // The claimed tenant in the payload is ignored entirely.
    expect((await getWallet(other.organizationId)).postedBalanceCentavos).toBe(0);
  });
});
