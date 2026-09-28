import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db, resetDb } from "@/test/db";
import { createTenant, NUMBERS, type Tenant } from "@/test/fixtures";
import {
  campaigns,
  dispatchJobs,
  messageItems,
  quotes,
  senderIdentities,
  organizations,
} from "@/server/db/schema";
import { MOCK_DEFAULTS } from "@/server/config";
import { issueQuote, QuoteError } from "./quote";
import { submitCampaign, SubmitError } from "./submit";
import { getWallet } from "./wallet";
import { addSuppression } from "./suppression";

const BODY = "Your reservation is confirmed. We look forward to seeing you tomorrow.";

async function quoteFor(
  tenant: Tenant,
  recipients: string[],
  overrides: Partial<Parameters<typeof issueQuote>[0]> = {},
) {
  return issueQuote({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    senderIdentityId: tenant.senderIdentityId,
    purpose: "INFORMATIONAL",
    body: BODY,
    rawRecipients: recipients,
    ...overrides,
  });
}

let tenant: Tenant;

beforeEach(async () => {
  await resetDb();
  tenant = await createTenant();
});
afterAll(closeDb);

describe("quoting", () => {
  it("prices a send from unique, eligible recipients", async () => {
    const quote = await quoteFor(tenant, [NUMBERS.ok(1), NUMBERS.ok(2), NUMBERS.ok(3)]);
    expect(quote.recipientCount).toBe(3);
    expect(quote.segmentsPerMessage).toBe(1);
    expect(quote.maxAuthorizedCostCentavos).toBe(3 * MOCK_DEFAULTS.unitPriceCentavos);
    expect(quote.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("counts invalid and duplicate entries as exclusions", async () => {
    const quote = await quoteFor(tenant, [
      NUMBERS.ok(1),
      "0917123456",           // too short
      "+12125551234",          // foreign
      NUMBERS.ok(1),           // duplicate
      NUMBERS.ok(2),
    ]);
    expect(quote.recipientCount).toBe(2);
    expect(quote.exclusions.invalid).toBe(2);
    expect(quote.exclusions.duplicate).toBe(1);
  });

  it("excludes opted-out recipients and records why", async () => {
    await db.transaction((tx) =>
      addSuppression(tx, {
        normalized: NUMBERS.ok(2),
        scope: "ORGANIZATION",
        organizationId: tenant.organizationId,
        reason: "Customer asked to stop",
        source: "OPERATOR_INTAKE",
      }),
    );

    const quote = await quoteFor(tenant, [NUMBERS.ok(1), NUMBERS.ok(2), NUMBERS.ok(3)]);
    expect(quote.recipientCount).toBe(2);
    expect(quote.exclusions.suppressed).toBe(1);
    expect(quote.recipients).not.toContain(NUMBERS.ok(2));
  });

  // Requirement 4: no eligible recipients blocks the send.
  it("refuses to quote when nothing eligible remains", async () => {
    await expect(quoteFor(tenant, ["not-a-number", "+12125551234"])).rejects.toMatchObject({
      code: "NO_ELIGIBLE_RECIPIENTS",
    });
  });

  // Requirement 13: promotional is inquiry-only, and the endpoint enforces it.
  it("refuses a promotional send outright", async () => {
    await expect(
      quoteFor(tenant, [NUMBERS.ok(1)], { purpose: "PROMOTIONAL" }),
    ).rejects.toMatchObject({ code: "PROMOTIONAL_INQUIRY_ONLY" });
  });

  // Requirement 13: the ceiling is applied before suppression, so opt-outs
  // cannot be used to slip a larger list under the limit.
  it("applies the self-service ceiling before suppression", async () => {
    const many = Array.from({ length: MOCK_DEFAULTS.selfServiceCeiling + 1 }, (_, i) =>
      NUMBERS.ok(i + 1),
    );
    await db.transaction((tx) =>
      addSuppression(tx, {
        normalized: NUMBERS.ok(1),
        scope: "ORGANIZATION",
        organizationId: tenant.organizationId,
        reason: "opted out",
        source: "OPERATOR_INTAKE",
      }),
    );

    // Without the ordering rule this would fall to exactly the ceiling and pass.
    await expect(quoteFor(tenant, many)).rejects.toMatchObject({
      code: "ABOVE_SELF_SERVICE_CEILING",
    });
  });

  it("rejects a sender identity belonging to another tenant", async () => {
    const other = await createTenant();
    await expect(
      quoteFor(tenant, [NUMBERS.ok(1)], { senderIdentityId: other.senderIdentityId }),
    ).rejects.toMatchObject({ code: "SENDER_NOT_ALLOWED" });
  });

  it("rejects a schedule beyond the allowed horizon", async () => {
    const tooFar = new Date(Date.now() + (MOCK_DEFAULTS.maxScheduleDays + 1) * 86_400_000);
    await expect(
      quoteFor(tenant, [NUMBERS.ok(1)], { scheduledAt: tooFar }),
    ).rejects.toMatchObject({ code: "SCHEDULE_INVALID" });
  });

  it("rejects a message with template variable syntax", async () => {
    await expect(
      quoteFor(tenant, [NUMBERS.ok(1)], { body: "Hi {{first_name}}" }),
    ).rejects.toMatchObject({ code: "MESSAGE_INVALID" });
  });
});

describe("submission", () => {
  it("holds funds, snapshots recipients and queues a durable job in one transaction", async () => {
    const quote = await quoteFor(tenant, [NUMBERS.ok(1), NUMBERS.ok(2)]);
    const result = await submitCampaign({
      quoteId: quote.id,
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      name: "Test campaign",
      idempotencyKey: "key-1",
    });

    expect(result.includedCount).toBe(2);
    expect(result.reservedCentavos).toBe(2 * MOCK_DEFAULTS.unitPriceCentavos);

    const wallet = await getWallet(tenant.organizationId);
    expect(wallet.heldCentavos).toBe(result.reservedCentavos);
    expect(wallet.postedBalanceCentavos).toBe(100_000);

    const items = await db
      .select()
      .from(messageItems)
      .where(eq(messageItems.campaignId, result.campaignId));
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.submissionStatus === "PENDING")).toBe(true);
    // The plain number is never stored in the clear.
    expect(items.every((i) => !i.numberEncrypted.includes("+639"))).toBe(true);
    expect(items[0]!.numberMasked).toMatch(/^\+63 \d{3} \*\*\* \d{4}$/);

    const jobs = await db
      .select()
      .from(dispatchJobs)
      .where(eq(dispatchJobs.campaignId, result.campaignId));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.status).toBe("PENDING");
  });

  // Requirement 4: a quote can only be used once, and only before it expires.
  it("refuses a quote that has already been used", async () => {
    const quote = await quoteFor(tenant, [NUMBERS.ok(1)]);
    await submitCampaign({
      quoteId: quote.id,
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      name: "First",
      idempotencyKey: "key-a",
    });

    await expect(
      submitCampaign({
        quoteId: quote.id,
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        name: "Second",
        idempotencyKey: "key-b",
      }),
    ).rejects.toMatchObject({ code: "QUOTE_INVALID" });
  });

  it("refuses an expired quote", async () => {
    const quote = await quoteFor(tenant, [NUMBERS.ok(1)]);
    await db
      .update(quotes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(quotes.id, quote.id));

    await expect(
      submitCampaign({
        quoteId: quote.id,
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        name: "Stale",
        idempotencyKey: "key-stale",
      }),
    ).rejects.toMatchObject({ code: "QUOTE_INVALID" });

    expect((await getWallet(tenant.organizationId)).heldCentavos).toBe(0);
  });

  it("refuses a quote issued to a different user", async () => {
    const quote = await quoteFor(tenant, [NUMBERS.ok(1)]);
    const other = await createTenant();
    await expect(
      submitCampaign({
        quoteId: quote.id,
        organizationId: tenant.organizationId,
        userId: other.userId,
        name: "Wrong user",
        idempotencyKey: "key-user",
      }),
    ).rejects.toMatchObject({ code: "QUOTE_INVALID" });
  });

  it("refuses a quote belonging to another organization", async () => {
    const other = await createTenant();
    const quote = await quoteFor(other, [NUMBERS.ok(1)]);
    await expect(
      submitCampaign({
        quoteId: quote.id,
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        name: "Cross tenant",
        idempotencyKey: "key-x",
      }),
    ).rejects.toMatchObject({ code: "QUOTE_INVALID" });
  });

  // Requirement 5.
  it("a repeated submit with the same key returns the first campaign, not a second", async () => {
    const quote = await quoteFor(tenant, [NUMBERS.ok(1), NUMBERS.ok(2)]);
    const input = {
      quoteId: quote.id,
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      name: "Double click",
      idempotencyKey: "double-click",
    };

    const first = await submitCampaign(input);
    const second = await submitCampaign(input);

    expect(second.campaignId).toBe(first.campaignId);
    expect(second.reused).toBe(true);

    const all = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.organizationId, tenant.organizationId));
    expect(all).toHaveLength(1);
    expect((await getWallet(tenant.organizationId)).heldCentavos).toBe(
      2 * MOCK_DEFAULTS.unitPriceCentavos,
    );
  });

  // Requirement 5: concurrent double submit.
  it("two concurrent submits with the same key create exactly one campaign", async () => {
    const quote = await quoteFor(tenant, [NUMBERS.ok(1), NUMBERS.ok(2)]);
    const input = {
      quoteId: quote.id,
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      name: "Race",
      idempotencyKey: "race-key",
    };

    const results = await Promise.allSettled([submitCampaign(input), submitCampaign(input)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const all = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.organizationId, tenant.organizationId));
    expect(all).toHaveLength(1);
    expect((await getWallet(tenant.organizationId)).heldCentavos).toBe(
      2 * MOCK_DEFAULTS.unitPriceCentavos,
    );
  });

  // Requirement 5: same key, different payload is a conflict.
  it("the same key with a different request is a conflict, not a second send", async () => {
    const first = await quoteFor(tenant, [NUMBERS.ok(1)]);
    const second = await quoteFor(tenant, [NUMBERS.ok(2)]);

    await submitCampaign({
      quoteId: first.id,
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      name: "One",
      idempotencyKey: "shared-key",
    });

    await expect(
      submitCampaign({
        quoteId: second.id,
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        name: "Two",
        idempotencyKey: "shared-key",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("refuses to submit more than the available balance", async () => {
    const poor = await createTenant({ fundingCentavos: 100 }); // 1 message only
    const quote = await quoteFor(poor, [NUMBERS.ok(1), NUMBERS.ok(2)]);

    await expect(
      submitCampaign({
        quoteId: quote.id,
        organizationId: poor.organizationId,
        userId: poor.userId,
        name: "Too expensive",
        idempotencyKey: "poor-key",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });

    // Nothing partial survives the failed transaction.
    expect((await getWallet(poor.organizationId)).heldCentavos).toBe(0);
    const all = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.organizationId, poor.organizationId));
    expect(all).toHaveLength(0);
    const jobs = await db.select().from(dispatchJobs);
    expect(jobs).toHaveLength(0);
  });

  // Requirement 7: state that changed between quoting and confirming is re-checked.
  it("refuses to submit when the sender was revoked after quoting", async () => {
    const quote = await quoteFor(tenant, [NUMBERS.ok(1)]);
    await db
      .update(senderIdentities)
      .set({ status: "REVOKED" })
      .where(eq(senderIdentities.id, tenant.senderIdentityId));

    await expect(
      submitCampaign({
        quoteId: quote.id,
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        name: "Revoked sender",
        idempotencyKey: "revoked-key",
      }),
    ).rejects.toMatchObject({ code: "SENDER_NOT_APPROVED" });
    expect((await getWallet(tenant.organizationId)).heldCentavos).toBe(0);
  });

  it("refuses to submit when the organization was suspended after quoting", async () => {
    const quote = await quoteFor(tenant, [NUMBERS.ok(1)]);
    await db
      .update(organizations)
      .set({ status: "SUSPENDED" })
      .where(eq(organizations.id, tenant.organizationId));

    await expect(
      submitCampaign({
        quoteId: quote.id,
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        name: "Suspended",
        idempotencyKey: "suspended-key",
      }),
    ).rejects.toMatchObject({ code: "ORG_NOT_ACTIVE" });
  });

  // Requirement 7: an opt-out arriving after the quote still takes effect.
  it("drops a recipient who opted out between quoting and confirming", async () => {
    const quote = await quoteFor(tenant, [NUMBERS.ok(1), NUMBERS.ok(2)]);
    await db.transaction((tx) =>
      addSuppression(tx, {
        normalized: NUMBERS.ok(2),
        scope: "ORGANIZATION",
        organizationId: tenant.organizationId,
        reason: "Opted out after quoting",
        source: "OPERATOR_INTAKE",
      }),
    );

    const result = await submitCampaign({
      quoteId: quote.id,
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      name: "Late opt-out",
      idempotencyKey: "late-optout",
    });

    expect(result.includedCount).toBe(1);
    // Only the recipient actually included is held for.
    expect(result.reservedCentavos).toBe(MOCK_DEFAULTS.unitPriceCentavos);
    expect((await getWallet(tenant.organizationId)).heldCentavos).toBe(
      MOCK_DEFAULTS.unitPriceCentavos,
    );
  });

  it("a scheduled campaign is stored as SCHEDULED with a future job", async () => {
    const runAt = new Date(Date.now() + 3_600_000);
    const quote = await quoteFor(tenant, [NUMBERS.ok(1)], { scheduledAt: runAt });
    const result = await submitCampaign({
      quoteId: quote.id,
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      name: "Scheduled",
      idempotencyKey: "sched-key",
    });

    const campaign = (
      await db.select().from(campaigns).where(eq(campaigns.id, result.campaignId))
    )[0];
    expect(campaign!.status).toBe("SCHEDULED");

    const job = (
      await db.select().from(dispatchJobs).where(eq(dispatchJobs.campaignId, result.campaignId))
    )[0];
    // The schedule lives in the database, so restarting the app cannot lose it.
    expect(job!.runAt.getTime()).toBeCloseTo(runAt.getTime(), -3);
    expect(job!.status).toBe("PENDING");
  });
});

describe("concurrent submissions across campaigns", () => {
  // Requirement 6, at the submission level rather than the wallet level.
  it("two competing sends cannot overspend the wallet", async () => {
    const tight = await createTenant({ fundingCentavos: 300 }); // 3 messages
    const a = await quoteFor(tight, [NUMBERS.ok(1), NUMBERS.ok(2)]);
    const b = await quoteFor(tight, [NUMBERS.ok(3), NUMBERS.ok(4)]);

    const results = await Promise.allSettled([
      submitCampaign({
        quoteId: a.id,
        organizationId: tight.organizationId,
        userId: tight.userId,
        name: "A",
        idempotencyKey: "overspend-a",
      }),
      submitCampaign({
        quoteId: b.id,
        organizationId: tight.organizationId,
        userId: tight.userId,
        name: "B",
        idempotencyKey: "overspend-b",
      }),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);

    const wallet = await getWallet(tight.organizationId);
    expect(wallet.heldCentavos).toBe(200);
    expect(wallet.availableCentavos).toBe(100);
    expect(wallet.availableCentavos).toBeGreaterThanOrEqual(0);
  });
});
