import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { env } from "@/server/env";
import { drainDueJobs } from "./dispatch";

/** How long one request may keep dispatching after its response has gone. */
const BUDGET_MS = 60_000;

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
