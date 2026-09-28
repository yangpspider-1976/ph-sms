import "server-only";
import { cookies, headers } from "next/headers";
import { and, eq, gt, lt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { memberships, organizations, sessions, users } from "@/server/db/schema";
import { newToken, tokenLookup } from "@/server/security/crypto";
import type { OrgRole } from "@/server/db/schema";

export const SESSION_COOKIE = "ph_sms_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const BCRYPT_ROUNDS = 12;

/** Password hashing uses bcrypt from a maintained library, never a hand-rolled scheme. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  emailVerifiedAt: Date | null;
  isPlatformAdmin: boolean;
  adminMfaAt: Date | null;
  sessionId: string;
};

export type OrgContext = {
  organizationId: string;
  organizationName: string;
  organizationStatus: (typeof organizations.$inferSelect)["status"];
  role: OrgRole;
};

/**
 * Creates a session. The cookie carries an opaque random token; only its
 * SHA-256 is stored, so a database leak does not yield usable session cookies.
 */
export async function createSession(userId: string): Promise<string> {
  const { token, lookup } = newToken();
  const hdrs = await headers();
  await db.insert(sessions).values({
    id: lookup,
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: hdrs.get("user-agent")?.slice(0, 500) ?? null,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, tokenLookup(token)));
  store.delete(SESSION_COOKIE);
}

/** Current user, or null. Expired sessions are treated as absent. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      sessionId: sessions.id,
      adminMfaAt: sessions.adminMfaAt,
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      emailVerifiedAt: users.emailVerifiedAt,
      isPlatformAdmin: users.isPlatformAdmin,
      disabledAt: users.disabledAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, tokenLookup(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row || row.disabledAt) return null;

  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    emailVerifiedAt: row.emailVerifiedAt,
    isPlatformAdmin: row.isPlatformAdmin,
    adminMfaAt: row.adminMfaAt,
    sessionId: row.sessionId,
  };
}

/**
 * Organizations the user actually belongs to. Authorized scope always comes
 * from here — a request-supplied organization_id is never trusted.
 */
export async function getMemberships(userId: string): Promise<OrgContext[]> {
  const rows = await db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationStatus: organizations.status,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, userId));
  return rows;
}

/** Marks the current session as having completed admin MFA. */
export async function markAdminMfa(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ adminMfaAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

export async function purgeExpiredSessions(): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return deleted.length;
}
