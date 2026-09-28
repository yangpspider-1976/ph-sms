import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { rateLimitHits } from "@/server/db/schema";
import { sha256 } from "./crypto";

/**
 * Rate limiting (SEC-06).
 *
 * Counts are kept in PostgreSQL rather than in memory, because the app runs as
 * more than one process: an in-memory counter would give each worker its own
 * allowance and the limit would be whatever it is multiplied by the number of
 * instances.
 *
 * The subject is stored as a keyed hash — an IP address is personal data, and a
 * rate-limit table is not a reason to keep a log of who visited.
 *
 * This is a fixed window, which permits a burst at a boundary. That is an
 * accepted trade for something this simple; the limits below are set low enough
 * that a double-rate burst is still harmless.
 */

export type LimitName =
  | "login"
  | "signup"
  | "upload"
  | "preview"
  | "quote"
  | "test-send"
  | "dispatch"
  | "export"
  | "inquiry"
  | "mfa";

export type LimitRule = { max: number; windowSeconds: number; description: string };

/** Provisional values. Tune against real traffic before live. */
export const LIMITS: Record<LimitName, LimitRule> = {
  // Tight: this is the credential-guessing surface.
  login: { max: 10, windowSeconds: 300, description: "sign-in attempts" },
  mfa: { max: 10, windowSeconds: 300, description: "two-factor attempts" },
  signup: { max: 5, windowSeconds: 3600, description: "registrations" },
  upload: { max: 20, windowSeconds: 3600, description: "file uploads" },
  preview: { max: 60, windowSeconds: 300, description: "previews" },
  quote: { max: 60, windowSeconds: 300, description: "price checks" },
  // A test send costs real money and real delivery.
  "test-send": { max: 10, windowSeconds: 3600, description: "test sends" },
  dispatch: { max: 30, windowSeconds: 300, description: "campaign submissions" },
  export: { max: 20, windowSeconds: 3600, description: "exports" },
  inquiry: { max: 5, windowSeconds: 600, description: "inquiries" },
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  message: string;
};

/**
 * Records an attempt and reports whether it is allowed.
 *
 * Counts first, then decides — so a rejected attempt still counts against the
 * window. Otherwise an attacker at the limit could keep trying forever with
 * each attempt refused but never counted.
 *
 * Use this for RESOURCE limits, where every attempt costs something: a quote, an
 * export, an upload, a test send. For CREDENTIAL limits use `peekRateLimit` and
 * `recordRateLimitFailure` instead — counting a successful sign-in against the
 * limit punishes the legitimate user rather than the attacker.
 */
export async function checkRateLimit(
  name: LimitName,
  subject: string,
  rule: LimitRule = LIMITS[name],
): Promise<RateLimitResult> {
  const subjectHash = sha256(`${name}:${subject}`);
  const windowStart = new Date(Date.now() - rule.windowSeconds * 1000);

  await db.insert(rateLimitHits).values({ bucket: name, subjectHash });

  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rateLimitHits)
    .where(
      and(
        eq(rateLimitHits.bucket, name),
        eq(rateLimitHits.subjectHash, subjectHash),
        gte(rateLimitHits.createdAt, windowStart),
      ),
    );

  const used = rows[0]?.n ?? 0;
  const allowed = used <= rule.max;
  const minutes = Math.ceil(rule.windowSeconds / 60);

  return {
    allowed,
    remaining: Math.max(rule.max - used, 0),
    retryAfterSeconds: rule.windowSeconds,
    message: allowed
      ? ""
      : `Too many ${rule.description}. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
  };
}

/**
 * Reports whether a subject is currently over the limit, without recording.
 *
 * The other half of the credential-limit pair: check before doing the work,
 * then record only if the attempt turned out to be wrong. A limit that counts
 * successes locks out the person who typed their password correctly ten times,
 * which is the opposite of what it is for.
 */
export async function peekRateLimit(
  name: LimitName,
  subject: string,
  rule: LimitRule = LIMITS[name],
): Promise<RateLimitResult> {
  const subjectHash = sha256(`${name}:${subject}`);
  const windowStart = new Date(Date.now() - rule.windowSeconds * 1000);

  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rateLimitHits)
    .where(
      and(
        eq(rateLimitHits.bucket, name),
        eq(rateLimitHits.subjectHash, subjectHash),
        gte(rateLimitHits.createdAt, windowStart),
      ),
    );

  const used = rows[0]?.n ?? 0;
  const allowed = used < rule.max;
  const minutes = Math.ceil(rule.windowSeconds / 60);

  return {
    allowed,
    remaining: Math.max(rule.max - used, 0),
    retryAfterSeconds: rule.windowSeconds,
    message: allowed
      ? ""
      : `Too many ${rule.description}. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
  };
}

/** Records one failed attempt against a credential limit. */
export async function recordRateLimitFailure(
  name: LimitName,
  subject: string,
): Promise<void> {
  await db.insert(rateLimitHits).values({
    bucket: name,
    subjectHash: sha256(`${name}:${subject}`),
  });
}

/** Clears a subject's history, e.g. after a successful sign-in. */
export async function clearRateLimit(name: LimitName, subject: string): Promise<void> {
  await db
    .delete(rateLimitHits)
    .where(
      and(
        eq(rateLimitHits.bucket, name),
        eq(rateLimitHits.subjectHash, sha256(`${name}:${subject}`)),
      ),
    );
}

/** Retention: nothing here is useful once its window has passed. */
export async function purgeRateLimits(olderThanSeconds = 86_400): Promise<number> {
  const deleted = await db
    .delete(rateLimitHits)
    .where(gte(sql`now() - ${rateLimitHits.createdAt}`, sql`make_interval(secs => ${olderThanSeconds})`))
    .returning({ id: rateLimitHits.id });
  return deleted.length;
}
