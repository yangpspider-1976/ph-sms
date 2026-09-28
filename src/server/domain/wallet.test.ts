import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db, resetDb } from "@/test/db";
import { ledgerEntries, organizations, wallets } from "@/server/db/schema";
import {
  captureFromReservation,
  debitWallet,
  getWallet,
  postPurchase,
  releaseReservation,
  reserveFunds,
  WalletError,
  ensureWallet,
} from "./wallet";

async function newOrgWithFunds(centavos: number): Promise<string> {
  const [org] = await db
    .insert(organizations)
    .values({ name: "Test Org", status: "ACTIVE" })
    .returning({ id: organizations.id });
  await ensureWallet(org!.id);
  if (centavos > 0) {
    await db.transaction((tx) =>
      postPurchase(tx, {
        organizationId: org!.id,
        amountCentavos: centavos,
        operationRef: `seed:${org!.id}`,
      }),
    );
  }
  return org!.id;
}

beforeEach(resetDb);
afterAll(closeDb);

describe("holds and available balance", () => {
  it("a hold reduces available funds without touching the posted balance", async () => {
    const org = await newOrgWithFunds(100_000);

    await db.transaction((tx) =>
      reserveFunds(tx, {
        organizationId: org,
        amountCentavos: 30_000,
        operationRef: "res:1",
      }),
    );

    const w = await getWallet(org);
    expect(w.postedBalanceCentavos).toBe(100_000);
    expect(w.heldCentavos).toBe(30_000);
    expect(w.availableCentavos).toBe(70_000);
  });

  it("refuses a hold larger than available funds", async () => {
    const org = await newOrgWithFunds(5_000);
    await expect(
      db.transaction((tx) =>
        reserveFunds(tx, {
          organizationId: org,
          amountCentavos: 5_001,
          operationRef: "res:over",
        }),
      ),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    expect((await getWallet(org)).heldCentavos).toBe(0);
  });

  it("capture releases the hold and posts the charge together", async () => {
    const org = await newOrgWithFunds(100_000);
    const { reservationId } = await db.transaction((tx) =>
      reserveFunds(tx, { organizationId: org, amountCentavos: 10_000, operationRef: "res:2" }),
    );

    await db.transaction((tx) =>
      captureFromReservation(tx, {
        reservationId,
        amountCentavos: 6_000,
        operationRef: "cap:2",
      }),
    );

    const w = await getWallet(org);
    expect(w.postedBalanceCentavos).toBe(94_000);
    expect(w.heldCentavos).toBe(4_000);
    expect(w.availableCentavos).toBe(90_000);
  });

  it("release returns unused hold to available funds", async () => {
    const org = await newOrgWithFunds(50_000);
    const { reservationId } = await db.transaction((tx) =>
      reserveFunds(tx, { organizationId: org, amountCentavos: 20_000, operationRef: "res:3" }),
    );
    await db.transaction((tx) =>
      releaseReservation(tx, { reservationId, operationRef: "rel:3" }),
    );

    const w = await getWallet(org);
    expect(w.postedBalanceCentavos).toBe(50_000);
    expect(w.heldCentavos).toBe(0);
    expect(w.availableCentavos).toBe(50_000);
  });

  it("cannot capture more than the reservation still holds", async () => {
    const org = await newOrgWithFunds(50_000);
    const { reservationId } = await db.transaction((tx) =>
      reserveFunds(tx, { organizationId: org, amountCentavos: 1_000, operationRef: "res:4" }),
    );
    await expect(
      db.transaction((tx) =>
        captureFromReservation(tx, {
          reservationId,
          amountCentavos: 1_001,
          operationRef: "cap:4",
        }),
      ),
    ).rejects.toBeInstanceOf(WalletError);
  });
});

describe("concurrency", () => {
  // Requirement 6: two competing sends cannot overspend the wallet.
  it("two simultaneous holds for the full balance: exactly one succeeds", async () => {
    const org = await newOrgWithFunds(10_000);

    const attempt = (ref: string) =>
      db
        .transaction((tx) =>
          reserveFunds(tx, {
            organizationId: org,
            amountCentavos: 10_000,
            operationRef: ref,
          }),
        )
        .then(
          () => "ok" as const,
          (e) => e as WalletError,
        );

    const [a, b] = await Promise.all([attempt("race:a"), attempt("race:b")]);
    const results = [a, b];
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(
      results.filter((r) => r !== "ok" && (r as WalletError).code === "INSUFFICIENT_FUNDS"),
    ).toHaveLength(1);

    const w = await getWallet(org);
    expect(w.heldCentavos).toBe(10_000);
    expect(w.availableCentavos).toBe(0);
  });

  it("many concurrent holds never drive available funds negative", async () => {
    const org = await newOrgWithFunds(10_000);
    const attempts = Array.from({ length: 12 }, (_, i) =>
      db
        .transaction((tx) =>
          reserveFunds(tx, {
            organizationId: org,
            amountCentavos: 1_000,
            operationRef: `many:${i}`,
          }),
        )
        .then(
          () => true,
          () => false,
        ),
    );
    const results = await Promise.all(attempts);

    expect(results.filter(Boolean)).toHaveLength(10);
    const w = await getWallet(org);
    expect(w.heldCentavos).toBe(10_000);
    expect(w.availableCentavos).toBe(0);
  });

  it("a failed transaction leaves no partial hold behind", async () => {
    const org = await newOrgWithFunds(10_000);
    await expect(
      db.transaction(async (tx) => {
        await reserveFunds(tx, {
          organizationId: org,
          amountCentavos: 4_000,
          operationRef: "rollback:1",
        });
        throw new Error("simulated failure after reserving");
      }),
    ).rejects.toThrow("simulated failure");

    const w = await getWallet(org);
    expect(w.heldCentavos).toBe(0);
    expect(w.availableCentavos).toBe(10_000);
    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.operationRef, "rollback:1"));
    expect(entries).toHaveLength(0);
  });
});

describe("ledger integrity", () => {
  it("rejects a repeated operation reference instead of spending twice", async () => {
    const org = await newOrgWithFunds(10_000);
    await db.transaction((tx) =>
      reserveFunds(tx, { organizationId: org, amountCentavos: 1_000, operationRef: "dup:1" }),
    );
    await expect(
      db.transaction((tx) =>
        reserveFunds(tx, {
          organizationId: org,
          amountCentavos: 1_000,
          operationRef: "dup:1",
        }),
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_OPERATION" });

    expect((await getWallet(org)).heldCentavos).toBe(1_000);
  });

  it("records every movement and never rewrites history", async () => {
    const org = await newOrgWithFunds(10_000);
    const { reservationId } = await db.transaction((tx) =>
      reserveFunds(tx, { organizationId: org, amountCentavos: 2_000, operationRef: "h:1" }),
    );
    await db.transaction((tx) =>
      captureFromReservation(tx, {
        reservationId,
        amountCentavos: 1_500,
        operationRef: "h:2",
      }),
    );
    await db.transaction((tx) =>
      releaseReservation(tx, { reservationId, operationRef: "h:3" }),
    );

    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.organizationId, org))
      .orderBy(ledgerEntries.createdAt);

    expect(entries.map((e) => e.type)).toEqual([
      "PURCHASE",
      "RESERVE",
      "CHARGE",
      "RELEASE",
    ]);
    // The running balance recorded on each entry matches the wallet.
    const w = await getWallet(org);
    expect(entries.at(-1)!.postedBalanceAfter).toBe(w.postedBalanceCentavos);
    expect(entries.at(-1)!.heldAfter).toBe(w.heldCentavos);
  });
});

describe("admin adjustments and chargebacks", () => {
  it("an admin cannot adjust the balance below funds already held", async () => {
    const org = await newOrgWithFunds(10_000);
    await db.transaction((tx) =>
      reserveFunds(tx, { organizationId: org, amountCentavos: 8_000, operationRef: "adj:hold" }),
    );

    await expect(
      db.transaction((tx) =>
        debitWallet(tx, {
          organizationId: org,
          amountCentavos: 5_000,
          operationRef: "adj:1",
          reason: "correction",
        }),
      ),
    ).rejects.toMatchObject({ code: "BELOW_HELD" });

    expect((await getWallet(org)).postedBalanceCentavos).toBe(10_000);
  });

  it("a chargeback beyond remaining funds records debt and freezes sending", async () => {
    const org = await newOrgWithFunds(3_000);
    const result = await db.transaction((tx) =>
      debitWallet(tx, {
        organizationId: org,
        amountCentavos: 5_000,
        operationRef: "cb:1",
        reason: "chargeback",
        allowDebt: true,
      }),
    );

    expect(result.debtCentavos).toBe(2_000);
    expect(result.frozen).toBe(true);

    const w = await getWallet(org);
    expect(w.postedBalanceCentavos).toBe(0);
    expect(w.debtCentavos).toBe(2_000);
    expect(w.sendingFrozen).toBe(true);

    // A frozen wallet refuses new holds rather than quietly allowing a send.
    await expect(
      db.transaction((tx) =>
        reserveFunds(tx, {
          organizationId: org,
          amountCentavos: 1,
          operationRef: "cb:after",
        }),
      ),
    ).rejects.toMatchObject({ code: "SENDING_FROZEN" });
  });

  it("a later top-up clears the debt before adding credit", async () => {
    const org = await newOrgWithFunds(0);
    await db.transaction((tx) =>
      debitWallet(tx, {
        organizationId: org,
        amountCentavos: 2_000,
        operationRef: "cb:2",
        reason: "chargeback",
        allowDebt: true,
      }),
    );
    await db.transaction((tx) =>
      postPurchase(tx, {
        organizationId: org,
        amountCentavos: 5_000,
        operationRef: "topup:1",
      }),
    );

    const w = await getWallet(org);
    expect(w.debtCentavos).toBe(0);
    expect(w.postedBalanceCentavos).toBe(3_000);
    expect(w.sendingFrozen).toBe(false);
  });
});

describe("wallet isolation", () => {
  it("holds on one organization do not affect another", async () => {
    const a = await newOrgWithFunds(10_000);
    const b = await newOrgWithFunds(10_000);
    await db.transaction((tx) =>
      reserveFunds(tx, { organizationId: a, amountCentavos: 9_000, operationRef: "iso:a" }),
    );

    expect((await getWallet(a)).availableCentavos).toBe(1_000);
    expect((await getWallet(b)).availableCentavos).toBe(10_000);

    const rows = await db.select().from(wallets).where(eq(wallets.organizationId, b));
    expect(rows[0]!.heldCentavos).toBe(0);
  });
});
