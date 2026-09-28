import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db, resetDb } from "@/test/db";
import { createTenant, NUMBERS, type Tenant } from "@/test/fixtures";
import { mobileVerifications, users } from "@/server/db/schema";
import { MockSmsProvider } from "@/server/providers/sms";
import { decrypt } from "@/server/security/crypto";
import {
  confirmMobileVerification,
  MAX_ATTEMPTS,
  MobileVerificationError,
  removeVerifiedMobile,
  startMobileVerification,
} from "./mobile-verification";

/**
 * AUTH-02. The number matters because a verified number is what authorises an
 * unreviewed test send, so "verified" has to mean the user actually holds the
 * handset.
 */

let tenant: Tenant;
const provider = new MockSmsProvider();

beforeEach(async () => {
  await resetDb();
  tenant = await createTenant();
});
afterAll(closeDb);

async function start(number = NUMBERS.ok(42)) {
  return startMobileVerification({
    userId: tenant.userId,
    rawNumber: number,
    provider,
    exposeDemoCode: true,
  });
}

describe("startMobileVerification", () => {
  it("texts a code and stores only its hash", async () => {
    const { demoCode, mask } = await start();

    expect(demoCode).toMatch(/^\d{6}$/);
    expect(mask).not.toContain("639170000042");

    const [row] = await db.select().from(mobileVerifications);
    // The code itself must not be recoverable from the record.
    expect(row!.codeHash).not.toBe(demoCode);
    expect(row!.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not write the number to the user until it is proven", async () => {
    await start();

    const [user] = await db.select().from(users).where(eq(users.id, tenant.userId));
    expect(user!.mobileVerifiedAt).toBeNull();
    expect(user!.mobileMask).toBeNull();
  });

  it("rejects a number that is not a Philippine mobile", async () => {
    await expect(start("0281234567")).rejects.toMatchObject({ code: "INVALID_NUMBER" });
  });

  it("refuses a number already verified by someone else", async () => {
    const { demoCode } = await start();
    await confirmMobileVerification({ userId: tenant.userId, code: demoCode! });

    const other = await createTenant();
    await expect(
      startMobileVerification({
        userId: other.userId,
        rawNumber: NUMBERS.ok(42),
        provider,
        exposeDemoCode: true,
      }),
    ).rejects.toMatchObject({ code: "IN_USE" });
  });

  it("lets the same user re-verify their own number", async () => {
    const first = await start();
    await confirmMobileVerification({ userId: tenant.userId, code: first.demoCode! });

    await expect(start()).resolves.toMatchObject({ mask: first.mask });
  });

  it("supersedes an earlier code, so only the newest one works", async () => {
    const first = await start();
    const second = await start();

    await expect(
      confirmMobileVerification({ userId: tenant.userId, code: first.demoCode! }),
    ).rejects.toBeInstanceOf(MobileVerificationError);

    await expect(
      confirmMobileVerification({ userId: tenant.userId, code: second.demoCode! }),
    ).resolves.toMatchObject({ mask: second.mask });
  });
});

describe("confirmMobileVerification", () => {
  it("records the number three ways once proven", async () => {
    const { demoCode } = await start();
    await confirmMobileVerification({ userId: tenant.userId, code: demoCode! });

    const [user] = await db.select().from(users).where(eq(users.id, tenant.userId));
    expect(user!.mobileVerifiedAt).toBeInstanceOf(Date);
    expect(decrypt(user!.mobileEncrypted!)).toBe(NUMBERS.ok(42));
    expect(user!.mobileHmac).toBeTruthy();
    expect(user!.mobileMask).toBeTruthy();
    // The stored mask must not be the whole number.
    expect(user!.mobileMask).not.toBe(NUMBERS.ok(42));
  });

  it("burns the challenge, so one code cannot verify twice", async () => {
    const { demoCode } = await start();
    await confirmMobileVerification({ userId: tenant.userId, code: demoCode! });

    await expect(
      confirmMobileVerification({ userId: tenant.userId, code: demoCode! }),
    ).rejects.toMatchObject({ code: "NO_PENDING" });
  });

  it("gives up after a fixed number of wrong codes", async () => {
    await start();

    for (let i = 0; i < MAX_ATTEMPTS - 1; i += 1) {
      await expect(
        confirmMobileVerification({ userId: tenant.userId, code: "000000" }),
      ).rejects.toMatchObject({ code: "WRONG_CODE" });
    }

    // The final guess exhausts the budget and burns the challenge with it.
    await expect(
      confirmMobileVerification({ userId: tenant.userId, code: "000000" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });

    // Six digits is only a million guesses; without this the code is no
    // protection at all. The challenge is dead after its last guess, so a
    // further attempt finds nothing to guess against.
    await expect(
      confirmMobileVerification({ userId: tenant.userId, code: "000000" }),
    ).rejects.toMatchObject({ code: "NO_PENDING" });
  });

  it("refuses an expired code", async () => {
    await start();
    await db.update(mobileVerifications).set({ expiresAt: new Date(Date.now() - 1000) });

    await expect(
      confirmMobileVerification({ userId: tenant.userId, code: "123456" }),
    ).rejects.toMatchObject({ code: "EXPIRED" });
  });

  it("reports how many attempts are left", async () => {
    await start();
    await expect(
      confirmMobileVerification({ userId: tenant.userId, code: "999999" }),
    ).rejects.toThrow(/4 attempts left/);
  });
});

describe("removeVerifiedMobile", () => {
  it("clears every stored form of the number", async () => {
    const { demoCode } = await start();
    await confirmMobileVerification({ userId: tenant.userId, code: demoCode! });

    await removeVerifiedMobile(tenant.userId);

    const [user] = await db.select().from(users).where(eq(users.id, tenant.userId));
    expect(user!.mobileEncrypted).toBeNull();
    expect(user!.mobileHmac).toBeNull();
    expect(user!.mobileMask).toBeNull();
    expect(user!.mobileVerifiedAt).toBeNull();
  });

  it("frees the number for another account", async () => {
    const { demoCode } = await start();
    await confirmMobileVerification({ userId: tenant.userId, code: demoCode! });
    await removeVerifiedMobile(tenant.userId);

    const other = await createTenant();
    await expect(
      startMobileVerification({
        userId: other.userId,
        rawNumber: NUMBERS.ok(42),
        provider,
        exposeDemoCode: true,
      }),
    ).resolves.toBeTruthy();
  });
});
