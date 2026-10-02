import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { env } from "@/server/env";
import { drainDueJobs } from "./dispatch";

/** How long one request may keep dispatching after its response has gone. */
const BUDGET_MS = 60_000;

/** The shortest gap between two page-view drains on one server instance. */
const VISIT_INTERVAL_MS = 30_000;

let lastVisitDrain = 0;

/**
 * Dispatches whatever is due once the current response has been sent.
 *
 * Only when `DISPATCH_AFTER_RESPONSE` is on, which by default means on Vercel.
 * There is no worker process there, and without this a "send now" would wait
 * for the next scheduled drain. Elsewhere this does nothing and the worker picks
 * the job up.
 *
 * Nothing depends on it for correctness: jobs are claimed under the worker's
 * lease, so this can overlap a scheduled drain or another request's safely.
 */
export function dispatchAfterResponse(): void {
  if (!env.DISPATCH_AFTER_RESPONSE) return;
  after(async () => {
    await drainDueJobs(`inline-${randomUUID().slice(0, 8)}`, BUDGET_MS);
  });
}

/**
 * Dispatches due work after a signed-in page has been served.
 *
 * Scheduled sends and transient-failure retries have no "send now" to start
 * them, so they wait for the scheduled drain — and on Vercel Hobby that drain
 * is a GitHub Actions schedule that runs hours apart rather than every five
 * minutes. Draining on page views means they go out the next time anyone uses
 * the portal or the admin console, which in practice is someone checking on
 * the very campaign that is due.
 *
 * At most once per `VISIT_INTERVAL_MS` on each server instance, so a busy page
 * costs one claim query every half minute rather than one per request.
 */
export function dispatchDueOnVisit(): void {
  if (!env.DISPATCH_AFTER_RESPONSE) return;
  const now = Date.now();
  if (now - lastVisitDrain < VISIT_INTERVAL_MS) return;
  lastVisitDrain = now;
  after(async () => {
    await drainDueJobs(`visit-${randomUUID().slice(0, 8)}`, BUDGET_MS);
  });
}
