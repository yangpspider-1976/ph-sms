import "@/server/load-env";
import { randomUUID } from "node:crypto";
import { client } from "@/server/db";
import { runNextJob } from "./dispatch";

/**
 * Durable worker.
 *
 * Work lives in the database, not in memory: jobs are claimed with a lease, so
 * restarting this process loses nothing and a schedule set days ago still runs.
 * Several workers can run at once — SKIP LOCKED means they take different jobs.
 *
 * Run it with `npm run worker`, alongside the web process. On Vercel, which
 * cannot host a long-running process, `/api/cron/dispatch` runs the same step.
 */

const WORKER_ID = `${process.pid}-${randomUUID().slice(0, 8)}`;
const IDLE_DELAY_MS = 1_000;

let running = true;

async function main(): Promise<void> {
  console.log(`[worker ${WORKER_ID}] started, polling for due jobs`);

  while (running) {
    let didWork = false;
    try {
      didWork = await runNextJob(WORKER_ID);
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
