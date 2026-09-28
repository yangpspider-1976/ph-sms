"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/context";
import { markAdminMfa } from "@/server/auth/session";
import { decrypt, encrypt, sha256 } from "@/server/security/crypto";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  totpUri,
  verifyTotp,
} from "@/server/auth/totp";
import { recordAudit } from "@/server/audit";
import {
  clearRateLimit,
  peekRateLimit,
  recordRateLimitFailure,
} from "@/server/security/rate-limit";

/**
 * Platform-admin second factor.
 *
 * `requirePlatformAdmin()` sends admins here when `APP_MODE=LIVE` and the
 * session has not been through MFA. Enrolment is therefore reachable *before*
 * MFA is satisfied — otherwise the first admin on a live deployment would be
 * redirected to a page they cannot reach, and nobody could ever administer the
 * platform.
 */

export type MfaSetup = { secret: string; uri: string };
export type MfaResult = { ok: boolean; message: string; recoveryCodes?: string[] };

/** Issues a candidate secret. Not stored until a code proves it works. */
export async function beginMfaEnrolmentAction(): Promise<MfaSetup> {
  const user = await requireUser();
  const secret = generateTotpSecret();
  return { secret, uri: totpUri(secret, user.email) };
}

const confirmSchema = z.object({
  secret: z.string().min(16),
  code: z.string().min(6).max(10),
});

/**
 * Confirms enrolment.
 *
 * The secret is only written once a generated code verifies against it, so an
 * admin cannot lock themselves out by enrolling a secret their authenticator
 * never received.
 */
export async function confirmMfaEnrolmentAction(formData: FormData): Promise<MfaResult> {
  const user = await requireUser();

  const parsed = confirmSchema.safeParse({
    secret: String(formData.get("secret") ?? ""),
    code: String(formData.get("code") ?? ""),
  });
  if (!parsed.success) return { ok: false, message: "Enter the 6-digit code from your app." };

  if (!verifyTotp(parsed.data.secret, parsed.data.code)) {
    return {
      ok: false,
      message: "That code did not match. Check your device's clock and try the current code.",
    };
  }

  const recoveryCodes = generateRecoveryCodes();

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        totpSecretEncrypted: encrypt(parsed.data.secret),
        totpRecoveryHashes: recoveryCodes.map((c) => sha256(c)),
        mfaEnrolledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await recordAudit(
      {
        action: "auth.mfa_enrolled",
        actorUserId: user.id,
        actorKind: user.isPlatformAdmin ? "PLATFORM_ADMIN" : "USER",
        objectType: "user",
        objectId: user.id,
      },
      tx,
    );
  });

  // Enrolling satisfies MFA for the session that did it.
  await markAdminMfa(user.sessionId);
  revalidatePath("/admin");

  return {
    ok: true,
    message: "Two-factor authentication is on. Save these recovery codes now — they are shown once.",
    recoveryCodes,
  };
}

/** Verifies a code (or a recovery code) for the current session. */
export async function verifyMfaAction(formData: FormData): Promise<MfaResult> {
  const user = await requireUser();
  const submitted = String(formData.get("code") ?? "").trim();
  if (!submitted) return { ok: false, message: "Enter your code." };

  // A 6-digit code is only a million guesses; without a limit an attacker
  // holding a stolen password could simply try them. Only wrong codes count —
  // an admin who verifies correctly every morning must not be locked out by
  // their own success.
  const limit = await peekRateLimit("mfa", user.id);
  if (!limit.allowed) return { ok: false, message: limit.message };

  const row = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!row?.totpSecretEncrypted) {
    return { ok: false, message: "This account is not enrolled yet." };
  }

  if (verifyTotp(decrypt(row.totpSecretEncrypted), submitted)) {
    await clearRateLimit("mfa", user.id);
    await markAdminMfa(user.sessionId);
    await recordAudit({
      action: "auth.mfa_verified",
      actorUserId: user.id,
      actorKind: "PLATFORM_ADMIN",
      objectType: "user",
      objectId: user.id,
    });
    revalidatePath("/admin");
    return { ok: true, message: "Verified." };
  }

  // Recovery codes are single use: a matching one is consumed, not just checked.
  const hashed = sha256(submitted.toUpperCase());
  const remaining = (row.totpRecoveryHashes ?? []).filter((h) => h !== hashed);

  if (remaining.length !== (row.totpRecoveryHashes ?? []).length) {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ totpRecoveryHashes: remaining, updatedAt: new Date() })
        .where(eq(users.id, user.id));
      await recordAudit(
        {
          action: "auth.mfa_recovery_used",
          actorUserId: user.id,
          actorKind: "PLATFORM_ADMIN",
          objectType: "user",
          objectId: user.id,
          metadata: { remaining: remaining.length },
        },
        tx,
      );
    });
    await clearRateLimit("mfa", user.id);
    await markAdminMfa(user.sessionId);
    revalidatePath("/admin");
    return {
      ok: true,
      message: `Recovery code accepted. ${remaining.length} remaining — re-enrol soon.`,
    };
  }

  await recordRateLimitFailure("mfa", user.id);
  await recordAudit({
    action: "auth.mfa_failed",
    actorUserId: user.id,
    actorKind: "PLATFORM_ADMIN",
    objectType: "user",
    objectId: user.id,
  });
  return { ok: false, message: "That code did not match." };
}
