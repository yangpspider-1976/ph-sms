import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { mobileVerifications, users } from "@/server/db/schema";
import { encrypt, numberHash, numberHashCandidates, sha256 } from "@/server/security/crypto";
import { maskNormalized, normalizePhone } from "./phone";
import { recordAudit } from "@/server/audit";
import type { SmsProvider } from "@/server/providers/sms";

/**
 * Optional mobile verification (AUTH-02).
 *
 * A verified number proves the user can receive SMS on it, which is what makes
 * a test send safe to allow: the platform will text an arbitrary body to that
 * number without an approver looking at it, so it must be a number the sender
 * owns rather than any number they can type.
 *
 * Verification is optional. Nothing about ordinary sending depends on it; a
 * user who declines simply cannot use the test-send shortcut.
 */

export const CODE_TTL_SECONDS = 10 * 60;
export const MAX_ATTEMPTS = 5;

export class MobileVerificationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_NUMBER"
      | "ALREADY_VERIFIED"
      | "NO_PENDING"
      | "EXPIRED"
      | "TOO_MANY_ATTEMPTS"
      | "WRONG_CODE"
      | "IN_USE",
  ) {
    super(message);
    this.name = "MobileVerificationError";
  }
}

/** Six digits, uniformly drawn. Short because a person retypes it from a text. */
function generateCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0]! % 1_000_000).padStart(6, "0");
}

export type StartResult = {
  mask: string;
  expiresAt: Date;
  /** Only populated when the provider is the mock, so demos can proceed. */
  demoCode?: string;
};

/**
 * Starts verification: normalizes, texts a code, stores only its hash.
 *
 * The code is never written anywhere readable. If the record leaks, it cannot
 * be used to complete a verification.
 */
export async function startMobileVerification(params: {
  userId: string;
  rawNumber: string;
  provider: SmsProvider;
  exposeDemoCode?: boolean;
}): Promise<StartResult> {
  const normalized = normalizePhone(params.rawNumber);
  if (!normalized.ok) {
    throw new MobileVerificationError(
      "Enter a Philippine mobile number, for example 0917 123 4567.",
      "INVALID_NUMBER",
    );
  }

  const hmac = numberHash(normalized.normalized);

  // One person, one number: otherwise two accounts could both claim to own the
  // same handset and each use it for unreviewed test sends.
  //
  // Matched against every key this number could be stored under, so a number
  // verified before a key rotation is still recognised as taken.
  const taken = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.mobileHmac, numberHashCandidates(normalized.normalized)))
    .limit(1);

  if (taken[0] && taken[0].id !== params.userId) {
    throw new MobileVerificationError(
      "That number is already verified on another account.",
      "IN_USE",
    );
  }

  const code = generateCode();
  const mask = maskNormalized(normalized.normalized);
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000);

  // Supersede any earlier challenge so only the newest code works.
  await db
    .update(mobileVerifications)
    .set({ consumedAt: new Date() })
    .where(and(eq(mobileVerifications.userId, params.userId), isNull(mobileVerifications.consumedAt)));

  await db.insert(mobileVerifications).values({
    userId: params.userId,
    phoneEncrypted: encrypt(normalized.normalized),
    phoneHmac: hmac,
    phoneMask: mask,
    codeHash: sha256(code),
    expiresAt,
  });

  await params.provider.submitMessage({
    stableKey: `verify:${params.userId}:${expiresAt.getTime()}`,
    normalizedNumber: normalized.normalized,
    sender: "VERIFY",
    content: `${code} is your verification code. It expires in 10 minutes.`,
  });

  await recordAudit({
    action: "auth.mobile_verification_started",
    actorUserId: params.userId,
    objectType: "user",
    objectId: params.userId,
    metadata: { mask },
  });

  return {
    mask,
    expiresAt,
    demoCode: params.exposeDemoCode ? code : undefined,
  };
}

/**
 * Confirms a code.
 *
 * Attempts are counted on the challenge itself and the challenge is burned once
 * the budget is spent, so guessing costs a new SMS each time rather than being
 * free.
 */
export async function confirmMobileVerification(params: {
  userId: string;
  code: string;
}): Promise<{ mask: string }> {
  // The outcome is returned from the transaction and only turned into an error
  // afterwards. Throwing inside the transaction would roll it back — including
  // the attempt counter — and the guess limit would silently do nothing.
  const outcome = await db.transaction(async (tx) => {
    const [pending] = await tx
      .select()
      .from(mobileVerifications)
      .where(
        and(eq(mobileVerifications.userId, params.userId), isNull(mobileVerifications.consumedAt)),
      )
      .orderBy(desc(mobileVerifications.createdAt))
      .limit(1)
      .for("update");

    if (!pending) {
      return {
        ok: false as const,
        code: "NO_PENDING" as const,
        message: "There is no verification in progress. Start again to get a new code.",
      };
    }

    if (pending.expiresAt.getTime() < Date.now()) {
      await tx
        .update(mobileVerifications)
        .set({ consumedAt: new Date() })
        .where(eq(mobileVerifications.id, pending.id));
      return {
        ok: false as const,
        code: "EXPIRED" as const,
        message: "That code has expired. Send a new one.",
      };
    }

    if (sha256(params.code.trim()) !== pending.codeHash) {
      const used = pending.attempts + 1;
      const left = MAX_ATTEMPTS - used;
      await tx
        .update(mobileVerifications)
        .set({
          attempts: used,
          // Burned as soon as the budget is spent, so the challenge is never
          // left alive after its last guess.
          consumedAt: left > 0 ? null : new Date(),
        })
        .where(eq(mobileVerifications.id, pending.id));

      return {
        ok: false as const,
        code: left > 0 ? ("WRONG_CODE" as const) : ("TOO_MANY_ATTEMPTS" as const),
        message:
          left > 0
            ? `That code did not match. ${left} attempt${left === 1 ? "" : "s"} left.`
            : "Too many incorrect codes. Send a new one.",
      };
    }

    await tx
      .update(mobileVerifications)
      .set({ consumedAt: new Date() })
      .where(eq(mobileVerifications.id, pending.id));

    await tx
      .update(users)
      .set({
        mobileEncrypted: pending.phoneEncrypted,
        mobileHmac: pending.phoneHmac,
        mobileMask: pending.phoneMask,
        mobileVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, params.userId));

    await recordAudit(
      {
        action: "auth.mobile_verified",
        actorUserId: params.userId,
        objectType: "user",
        objectId: params.userId,
        metadata: { mask: pending.phoneMask },
      },
      tx,
    );

    return { ok: true as const, mask: pending.phoneMask };
  });

  if (!outcome.ok) throw new MobileVerificationError(outcome.message, outcome.code);
  return { mask: outcome.mask };
}

/** Removes a verified number. The user keeps their account either way. */
export async function removeVerifiedMobile(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      mobileEncrypted: null,
      mobileHmac: null,
      mobileMask: null,
      mobileVerifiedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await recordAudit({
    action: "auth.mobile_removed",
    actorUserId: userId,
    objectType: "user",
    objectId: userId,
  });
}
