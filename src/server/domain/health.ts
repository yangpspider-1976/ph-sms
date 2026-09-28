import "server-only";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  campaigns,
  dispatchJobs,
  messageItems,
  paymentEvents,
  providerEvents,
  wallets,
} from "@/server/db/schema";
import { env, liveReadinessGaps } from "@/server/env";
import { MOCK_DEFAULTS, liveConfigGaps } from "@/server/config";
import { rotationInProgress } from "@/server/security/crypto";

/**
 * Operational signals.
 *
 * These are the checks the runbook asks an operator to make every day, computed
 * once so they can be scraped or alerted on rather than eyeballed. Each one is
 * something that, left alone, quietly becomes a customer problem:
 *
 *   - a stalled worker means campaigns are accepted and money held but nothing
 *     is sent, with no error anywhere;
 *   - unresolved submissions are messages that may or may not have gone out;
 *   - quarantined receipts are delivery events we cannot match;
 *   - a frozen wallet means a customer cannot send and may not know why.
 */

export type HealthStatus = "ok" | "degraded" | "failing";

export type HealthReport = {
  status: HealthStatus;
  mode: string;
  checks: Array<{
    name: string;
    status: HealthStatus;
    value: number | string;
    detail: string;
  }>;
};

/** Liveness only: can we reach the database at all. */
export async function ping(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

/** A job overdue by this much means no worker is running. */
const WORKER_STALL_SECONDS = 120;

export async function healthReport(): Promise<HealthReport> {
  const checks: HealthReport["checks"] = [];

  const database = await ping();
  checks.push({
    name: "database",
    status: database ? "ok" : "failing",
    value: database ? "reachable" : "unreachable",
    detail: database ? "Connected." : "The database cannot be reached.",
  });

  if (!database) {
    return { status: "failing", mode: env.APP_MODE, checks };
  }

  /* --- Is the worker running? ------------------------------------------ */

  const overdue = (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(dispatchJobs)
      .where(
        and(
          eq(dispatchJobs.status, "PENDING"),
          lt(dispatchJobs.runAt, sql`now() - make_interval(secs => ${WORKER_STALL_SECONDS})`),
        ),
      )
  )[0]?.n ?? 0;

  checks.push({
    name: "dispatch_worker",
    status: overdue > 0 ? "failing" : "ok",
    value: overdue,
    detail:
      overdue > 0
        ? `${overdue} job(s) due more than ${WORKER_STALL_SECONDS}s ago and unclaimed. Is the worker running?`
        : "No overdue jobs.",
  });

  /* --- Things needing an operator --------------------------------------- */

  const unresolved = (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(messageItems)
      .where(eq(messageItems.submissionStatus, "UNKNOWN"))
  )[0]?.n ?? 0;

  checks.push({
    name: "unresolved_submissions",
    status: unresolved > 0 ? "degraded" : "ok",
    value: unresolved,
    detail:
      unresolved > 0
        ? `${unresolved} submission(s) unresolved; their cost stays held pending reconciliation.`
        : "None.",
  });

  const quarantined = (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(providerEvents)
      .where(eq(providerEvents.quarantined, true))
  )[0]?.n ?? 0;

  checks.push({
    name: "quarantined_delivery_events",
    status: quarantined > 0 ? "degraded" : "ok",
    value: quarantined,
    detail:
      quarantined > 0
        ? `${quarantined} delivery event(s) could not be matched to a message.`
        : "None.",
  });

  const paused = (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(eq(campaigns.status, "PAUSED_REVIEW"))
  )[0]?.n ?? 0;

  checks.push({
    name: "paused_campaigns",
    status: paused > 0 ? "degraded" : "ok",
    value: paused,
    detail:
      paused > 0
        ? `${paused} campaign(s) paused for review. They do not resume on their own.`
        : "None.",
  });

  const frozen = (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(wallets)
      .where(eq(wallets.sendingFrozen, true))
  )[0]?.n ?? 0;

  checks.push({
    name: "frozen_accounts",
    status: frozen > 0 ? "degraded" : "ok",
    value: frozen,
    detail: frozen > 0 ? `${frozen} account(s) cannot send.` : "None.",
  });

  const rejectedPayments = (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(paymentEvents)
      .where(
        and(
          sql`${paymentEvents.outcome} in ('MISMATCH','UNKNOWN_REFERENCE')`,
          gt(paymentEvents.receivedAt, sql`now() - interval '24 hours'`),
        ),
      )
  )[0]?.n ?? 0;

  checks.push({
    name: "rejected_payment_events_24h",
    status: rejectedPayments > 0 ? "degraded" : "ok",
    value: rejectedPayments,
    detail:
      rejectedPayments > 0
        ? `${rejectedPayments} payment event(s) rejected. Check merchant configuration, or investigate.`
        : "None.",
  });

  const failedJobs = (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(dispatchJobs)
      .where(eq(dispatchJobs.status, "FAILED"))
  )[0]?.n ?? 0;

  checks.push({
    name: "failed_jobs",
    status: failedJobs > 0 ? "degraded" : "ok",
    value: failedJobs,
    detail: failedJobs > 0 ? `${failedJobs} job(s) exhausted their retries.` : "None.",
  });

  /* --- Configuration ----------------------------------------------------- */

  if (rotationInProgress()) {
    checks.push({
      name: "key_rotation",
      status: "degraded",
      value: "in progress",
      detail:
        "A previous key is still configured. Run `npm run rotate-keys` until nothing remains, then remove it.",
    });
  }

  const gaps = [...liveReadinessGaps(), ...liveConfigGaps(MOCK_DEFAULTS)];
  checks.push({
    name: "live_readiness_gaps",
    // Outstanding gaps are expected outside LIVE, and a problem inside it.
    status: gaps.length > 0 && env.APP_MODE === "LIVE" ? "failing" : "ok",
    value: gaps.length,
    detail:
      gaps.length === 0 ? "None." : `${gaps.length} input(s) still required before live.`,
  });

  const worst = checks.some((c) => c.status === "failing")
    ? "failing"
    : checks.some((c) => c.status === "degraded")
      ? "degraded"
      : "ok";

  return { status: worst, mode: env.APP_MODE, checks };
}
