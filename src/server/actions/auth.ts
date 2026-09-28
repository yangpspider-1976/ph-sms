"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { mailSink, memberships, organizations, users, wallets } from "@/server/db/schema";
import {
  createSession,
  destroySession,
  getSessionUser,
  hashPassword,
  verifyPassword,
} from "@/server/auth/session";
import { ACTIVE_ORG_COOKIE } from "@/server/auth/context";
import { newToken } from "@/server/security/crypto";
import { verificationTokens } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { sendMail } from "@/server/providers/mail";
import { demoFeaturesEnabled } from "@/server/env";
import {
  checkRateLimit,
  clearRateLimit,
  peekRateLimit,
  recordRateLimitFailure,
} from "@/server/security/rate-limit";
import { headers } from "next/headers";

export type ActionState = { error?: string; fieldErrors?: Record<string, string> } | null;

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) };
  }

  // Limited per address, and per client when the client can be identified, so
  // neither one account nor one attacker's connection can be hammered.
  //
  // Only FAILED attempts count. Counting a correct password against the limit
  // would lock out the person who signed in ten times today and do nothing at
  // all to the attacker, who is failing every time either way.
  const email = parsed.data.email.toLowerCase();
  const client = await clientKey();
  const subjects = [email, ...(client ? [client] : [])];
  for (const subject of subjects) {
    const limit = await peekRateLimit("login", subject);
    if (!limit.allowed) return { error: limit.message };
  }

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];

  // Same message and roughly the same work either way: a wrong password and an
  // unknown address must not be distinguishable from the outside.
  const okPassword = user
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : await verifyPassword(parsed.data.password, "$2b$12$" + "x".repeat(53));

  if (!user || !okPassword || user.disabledAt) {
    for (const subject of subjects) {
      await recordRateLimitFailure("login", subject);
    }
    return { error: "That email address and password do not match." };
  }

  // A correct password clears the counter, so ordinary typos never accumulate
  // towards a lockout once the person gets in.
  await clearRateLimit("login", email);

  await createSession(user.id);
  await recordAudit({
    action: "auth.login",
    actorUserId: user.id,
    actorKind: user.isPlatformAdmin ? "PLATFORM_ADMIN" : "USER",
    objectType: "user",
    objectId: user.id,
  });

  redirect(user.isPlatformAdmin ? "/admin" : "/app/dashboard");
}

const signupSchema = z.object({
  fullName: z.string().min(2, "Enter your name."),
  email: z.string().email("Enter a valid work email address."),
  password: z
    .string()
    .min(12, "Use at least 12 characters.")
    .max(200, "That password is too long."),
  company: z.string().min(2, "Enter your registered business name."),
  registrationId: z.string().min(2, "Enter your SEC or DTI registration number."),
  address: z.string().min(5, "Enter your business address."),
  industry: z.string().min(2, "Enter your industry."),
  websiteUrl: z.string().optional(),
  intendedUsage: z.string().min(20, "Describe what you intend to send, in a sentence or two."),
});

/**
 * Creates the user and their organization in PENDING_REVIEW. No sending is
 * possible until a platform admin approves the business and a sender identity
 * is approved.
 */
export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData) as Record<string, string>);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const signupClient = await clientKey();
  if (signupClient) {
    const signupLimit = await checkRateLimit("signup", signupClient);
    if (!signupLimit.allowed) return { error: signupLimit.message };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing.length > 0) {
    return { error: "An account already exists for that email address. Sign in instead." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const { token, lookup } = newToken();

  await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({
        name: parsed.data.company,
        status: "PENDING_REVIEW",
        registrationId: parsed.data.registrationId,
        address: parsed.data.address,
        industry: parsed.data.industry,
        websiteUrl: parsed.data.websiteUrl || null,
        contactName: parsed.data.fullName,
        intendedUsage: parsed.data.intendedUsage,
      })
      .returning();

    const [user] = await tx
      .insert(users)
      .values({ email, passwordHash, fullName: parsed.data.fullName })
      .returning();

    await tx
      .insert(memberships)
      .values({ organizationId: org!.id, userId: user!.id, role: "OWNER" });
    await tx.insert(wallets).values({ organizationId: org!.id });

    await tx.insert(verificationTokens).values({
      id: lookup,
      kind: "EMAIL_VERIFY",
      userId: user!.id,
      email,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    });

    // Goes through the configured transport: the sink in mock mode, real SMTP
    // when one is set up. Nothing leaves the machine in mock mode.
    await sendMail(
      {
        to: email,
        subject: "Verify your email address",
        body: "Confirm your email address to continue setting up your account.",
        link: `/verify-email?token=${token}`,
      },
      tx,
    );

    await recordAudit(
      {
        action: "organization.signup",
        organizationId: org!.id,
        actorUserId: user!.id,
        objectType: "organization",
        objectId: org!.id,
        metadata: { company: parsed.data.company },
      },
      tx,
    );
  });

  redirect("/verify-email?sent=1");
}

/** Ends the session server-side — the row is deleted, not just the cookie. */
export async function logoutAction(): Promise<void> {
  const user = await getSessionUser();
  await destroySession();
  if (user) {
    await recordAudit({
      action: "auth.logout",
      actorUserId: user.id,
      actorKind: user.isPlatformAdmin ? "PLATFORM_ADMIN" : "USER",
      objectType: "user",
      objectId: user.id,
    });
  }
  redirect("/login");
}

/** Consumes an emailed verification token. Single use, time limited. */
export async function verifyEmailAction(token: string): Promise<{ ok: boolean; message: string }> {
  const { tokenLookup } = await import("@/server/security/crypto");
  const lookup = tokenLookup(token);

  const rows = await db
    .select()
    .from(verificationTokens)
    .where(and(eq(verificationTokens.id, lookup), eq(verificationTokens.kind, "EMAIL_VERIFY")))
    .limit(1);
  const record = rows[0];

  if (!record || record.consumedAt || record.expiresAt < new Date()) {
    return {
      ok: false,
      message: "That verification link has expired or has already been used. Request a new one.",
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, record.userId!));
    await tx
      .update(verificationTokens)
      .set({ consumedAt: new Date() })
      .where(eq(verificationTokens.id, lookup));
    await recordAudit(
      { action: "auth.email_verified", actorUserId: record.userId, objectType: "user" },
      tx,
    );
  });

  return { ok: true, message: "Your email address is verified." };
}

/** Switches the active organization, but only to one the user belongs to. */
export async function switchOrganizationAction(organizationId: string): Promise<void> {
  const { currentContext } = await import("@/server/auth/context");
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  if (!ctx.memberships.some((m) => m.organizationId === organizationId)) {
    // Not a member: ignore rather than switch.
    redirect("/app/dashboard");
  }
  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, organizationId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/app/dashboard");
}

/** Demo-only shortcut used by the seeded logins panel. Never available in LIVE. */
export async function demoLoginAction(email: string): Promise<void> {
  if (!demoFeaturesEnabled()) redirect("/login");
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user) redirect("/login");
  await createSession(user.id);
  redirect(user.isPlatformAdmin ? "/admin" : "/app/dashboard");
}

/**
 * Identifies the caller for rate limiting, or null when it cannot.
 *
 * Returns null rather than a shared placeholder on purpose. Bucketing every
 * unidentifiable request under one key does not limit per client — it limits
 * the whole platform, so ten failed sign-ins anywhere would lock out everyone.
 * A deployment that wants this limit has to pass `x-forwarded-for` from its
 * proxy; without it the per-account limit below still applies, which is the one
 * that actually defends a specific account.
 */
async function clientKey(): Promise<string | null> {
  const hdrs = await headers();
  const forwarded = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && forwarded.length > 0 ? forwarded : null;
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
