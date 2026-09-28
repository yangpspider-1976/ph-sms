import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db, resetDb } from "@/test/db";
import { createTenant, NUMBERS, type Tenant } from "@/test/fixtures";
import { contacts, suppressions } from "@/server/db/schema";
import { addSuppression, isSuppressedNumber } from "@/server/domain/suppression";
import { currentKeyVersion, encrypt, numberHash } from "@/server/security/crypto";
import { maskNormalized } from "@/server/domain/phone";
import { rotateKeys, rotationRemaining } from "./rotate-keys";

/**
 * Key rotation, rehearsed.
 *
 * The hazard being tested: rotating the suppression key without carrying the
 * old one forward makes every stored opt-out stop matching, silently. The
 * symptom is not an error — it is messaging someone who asked you to stop.
 *
 * `env` is mutated directly here because the crypto module reads it per call;
 * that is what lets a single process act as "before" and "after" the rotation.
 */

const ORIGINAL = {
  key: process.env.SUPPRESSION_HMAC_KEY,
  version: process.env.SUPPRESSION_HMAC_KEY_VERSION,
  previous: process.env.SUPPRESSION_HMAC_KEY_PREVIOUS,
  previousVersion: process.env.SUPPRESSION_HMAC_KEY_PREVIOUS_VERSION,
  dataKey: process.env.DATA_ENCRYPTION_KEY,
  dataPrevious: process.env.DATA_ENCRYPTION_KEY_PREVIOUS,
};

const OLD_KEY = Buffer.alloc(32, 1).toString("base64");
const NEW_KEY = Buffer.alloc(32, 2).toString("base64");

/** Reloads the env module so the new values take effect. */
async function applyEnv(vars: Record<string, string>): Promise<void> {
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
  const { resetEnvForTests } = await import("@/server/env");
  resetEnvForTests();
}

function useOldKeyOnly() {
  return applyEnv({
    SUPPRESSION_HMAC_KEY: OLD_KEY,
    SUPPRESSION_HMAC_KEY_VERSION: "1",
    SUPPRESSION_HMAC_KEY_PREVIOUS: "",
    SUPPRESSION_HMAC_KEY_PREVIOUS_VERSION: "",
    DATA_ENCRYPTION_KEY: OLD_KEY,
    DATA_ENCRYPTION_KEY_PREVIOUS: "",
  });
}

/** The correct rotation: new key live, old key still accepted. */
function useRotation() {
  return applyEnv({
    SUPPRESSION_HMAC_KEY: NEW_KEY,
    SUPPRESSION_HMAC_KEY_VERSION: "2",
    SUPPRESSION_HMAC_KEY_PREVIOUS: OLD_KEY,
    SUPPRESSION_HMAC_KEY_PREVIOUS_VERSION: "1",
    DATA_ENCRYPTION_KEY: NEW_KEY,
    DATA_ENCRYPTION_KEY_PREVIOUS: OLD_KEY,
  });
}

/** The dangerous rotation: new key live, old key discarded. */
function useNewKeyOnly() {
  return applyEnv({
    SUPPRESSION_HMAC_KEY: NEW_KEY,
    SUPPRESSION_HMAC_KEY_VERSION: "2",
    SUPPRESSION_HMAC_KEY_PREVIOUS: "",
    SUPPRESSION_HMAC_KEY_PREVIOUS_VERSION: "",
    DATA_ENCRYPTION_KEY: NEW_KEY,
    DATA_ENCRYPTION_KEY_PREVIOUS: "",
  });
}

let tenant: Tenant;

/** Records an opt-out and a matching contact, under whichever key is live. */
async function seedOptOut(normalized: string) {
  await db.transaction((tx) =>
    addSuppression(tx, {
      normalized,
      scope: "ORGANIZATION",
      organizationId: tenant.organizationId,
      reason: "Asked to stop",
      source: "OPERATOR_INTAKE",
    }),
  );
  // The plain number has to exist somewhere for the rotation to re-key the
  // opt-out; a contact row is the ordinary case.
  await db.insert(contacts).values({
    organizationId: tenant.organizationId,
    numberHash: numberHash(normalized),
    numberEncrypted: encrypt(normalized),
    numberMasked: maskNormalized(normalized),
    keyVersion: currentKeyVersion(),
  });
}

beforeEach(async () => {
  await resetDb();
  await useOldKeyOnly();
  tenant = await createTenant();
});

afterEach(async () => {
  await applyEnv({
    SUPPRESSION_HMAC_KEY: ORIGINAL.key ?? "",
    SUPPRESSION_HMAC_KEY_VERSION: ORIGINAL.version ?? "1",
    SUPPRESSION_HMAC_KEY_PREVIOUS: ORIGINAL.previous ?? "",
    SUPPRESSION_HMAC_KEY_PREVIOUS_VERSION: ORIGINAL.previousVersion ?? "",
    DATA_ENCRYPTION_KEY: ORIGINAL.dataKey ?? "",
    DATA_ENCRYPTION_KEY_PREVIOUS: ORIGINAL.dataPrevious ?? "",
  });
});

afterAll(closeDb);

describe("the hazard", () => {
  // This is the failure the runbook warns about, demonstrated rather than
  // asserted in prose.
  it("rotating WITHOUT the previous key stops an opt-out matching", async () => {
    await seedOptOut(NUMBERS.ok(1));
    expect(await isSuppressedNumber(db, tenant.organizationId, NUMBERS.ok(1))).toBe(true);

    await useNewKeyOnly();

    // No error, no warning — the opt-out simply stops being found.
    expect(await isSuppressedNumber(db, tenant.organizationId, NUMBERS.ok(1))).toBe(false);
  });
});

describe("the safe rotation", () => {
  it("keeps opt-outs matching while both keys are configured", async () => {
    await seedOptOut(NUMBERS.ok(1));
    await seedOptOut(NUMBERS.ok(2));

    await useRotation();

    // Still found, under the old key, before anything is re-keyed.
    expect(await isSuppressedNumber(db, tenant.organizationId, NUMBERS.ok(1))).toBe(true);
    expect(await isSuppressedNumber(db, tenant.organizationId, NUMBERS.ok(2))).toBe(true);
  });

  it("re-keys stored rows onto the new key", async () => {
    await seedOptOut(NUMBERS.ok(1));
    await seedOptOut(NUMBERS.ok(2));

    await useRotation();
    const summary = await rotateKeys();

    expect(summary.contacts).toBe(2);
    expect(summary.suppressions).toBe(2);

    const rows = await db
      .select()
      .from(suppressions)
      .where(eq(suppressions.organizationId, tenant.organizationId));
    expect(rows.every((r) => r.keyVersion === 2)).toBe(true);
    expect(rows.every((r) => r.numberHash.startsWith("2:"))).toBe(true);

    expect(await rotationRemaining()).toBe(0);
  });

  it("opt-outs still match after the old key is removed", async () => {
    await seedOptOut(NUMBERS.ok(1));
    await seedOptOut(NUMBERS.ok(2));

    await useRotation();
    await rotateKeys();

    // The whole point: retire the old key and nothing breaks.
    await useNewKeyOnly();

    expect(await isSuppressedNumber(db, tenant.organizationId, NUMBERS.ok(1))).toBe(true);
    expect(await isSuppressedNumber(db, tenant.organizationId, NUMBERS.ok(2))).toBe(true);
    // A number that never opted out is still not suppressed.
    expect(await isSuppressedNumber(db, tenant.organizationId, NUMBERS.ok(9))).toBe(false);
  });

  it("re-encrypts contact numbers so they read under the new key alone", async () => {
    await seedOptOut(NUMBERS.ok(1));

    await useRotation();
    await rotateKeys();
    await useNewKeyOnly();

    const { decrypt } = await import("@/server/security/crypto");
    const row = (
      await db.select().from(contacts).where(eq(contacts.organizationId, tenant.organizationId))
    )[0]!;
    expect(decrypt(row.numberEncrypted)).toBe(NUMBERS.ok(1));
    expect(row.keyVersion).toBe(2);
  });

  it("is safe to run twice", async () => {
    await seedOptOut(NUMBERS.ok(1));

    await useRotation();
    await rotateKeys();
    const second = await rotateKeys();

    // Nothing left to move on the second pass.
    expect(second.contacts).toBe(0);
    expect(second.suppressions).toBe(0);
    expect(await rotationRemaining()).toBe(0);
  });

  it("reports an opt-out it cannot re-key instead of losing it quietly", async () => {
    // An opt-out whose number appears nowhere else: nothing to recover the
    // plain value from, so it can only match while the old key is kept.
    await db.transaction((tx) =>
      addSuppression(tx, {
        normalized: NUMBERS.ok(5),
        scope: "ORGANIZATION",
        organizationId: tenant.organizationId,
        reason: "Asked to stop",
        source: "OPERATOR_INTAKE",
      }),
    );

    await useRotation();
    await rotateKeys();

    // Still matches, because the previous key is still configured.
    expect(await isSuppressedNumber(db, tenant.organizationId, NUMBERS.ok(5))).toBe(true);
    // And the operator is told not to retire the old key yet.
    expect(await rotationRemaining()).toBeGreaterThan(0);
  });
});
