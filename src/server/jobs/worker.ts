import "@/server/load-env";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, client } from "@/server/db";
import { dispatchJobs } from "@/server/db/schema";
import { MOCK_DEFAULTS } from "@/server/config";
import { claimJob, dispatchCampaign } from "./dispatch";

/**
 * Durable worker.
 *
 * Work lives in the database, not in memory: jobs are claimed with a lease, so
 * restarting this process loses nothing and a schedule set days ago still runs.
 * Several workers can run at once — SKIP LOCKED means they take different jobs.
 *
 * Run it with `npm run worker`, alongside the web process.
 */

const WORKER_ID = `${process.pid}-${randomUUID().slice(0, 8)}`;
const IDLE_DELAY_MS = 1_000;

let running = true;

async function tick(): Promise<boolean> {
  const job = await claimJob(WORKER_ID, MOCK_DEFAULTS);
  if (!job) return false;

  try {
    const summary = await dispatchCampaign(job.campaignId);
    console.log(
      `[worker ${WORKER_ID}] campaign=${job.campaignId} attempted=${summary.attempted} ` +
        `accepted=${summary.accepted} rejected=${summary.rejected} unknown=${summary.unknown} ` +
        `excluded=${summary.excluded}${summary.paused ? ` paused=${summary.pauseReason}` : ""}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker ${WORKER_ID}] campaign=${job.campaignId} failed: ${message}`);

    // Release the lease so another attempt can pick it up, up to the limit.
    await db
      .update(dispatchJobs)
      .set({
        status: job.attempts >= MOCK_DEFAULTS.maxDispatchAttempts ? "FAILED" : "PENDING",
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(dispatchJobs.id, job.id));
  }
  return true;
}

async function main(): Promise<void> {
  console.log(`[worker ${WORKER_ID}] started, polling for due jobs`);

  while (running) {
    let didWork = false;
    try {
      didWork = await tick();
    } catch (err) {
      console.error(`[worker ${WORKER_ID}] loop error:`, err);
    }
    // Only idle when there was nothing to do, so a backlog drains promptly.
    if (!didWork) await new Promise((resolve) => setTimeout(resolve, IDLE_DELAY_MS));
  }

  await client.end({ timeout: 5 });
  console.log(`[worker ${WORKER_ID}] stopped`);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[worker ${WORKER_ID}] ${signal} received, finishing current job`);
    running = false;
  });
}

await main();
