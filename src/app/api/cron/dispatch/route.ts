import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { drainDueJobs } from "@/server/jobs/dispatch";
import { isAuthorizedCron } from "@/server/security/cron";

export const dynamic = "force-dynamic";
/** Vercel Hobby's ceiling. The drain stops starting work well inside it. */
export const maxDuration = 300;

const BUDGET_MS = 240_000;

/**
 * Scheduled dispatch — what `npm run worker` does, for a host that cannot keep
 * a process running.
 *
 * Called by Vercel Cron and by `.github/workflows/dispatch.yml`. Jobs are
 * claimed under the worker's lease, so overlapping calls take different jobs
 * rather than colliding.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const ran = await drainDueJobs(`cron-${randomUUID().slice(0, 8)}`, BUDGET_MS);
  return NextResponse.json({ ok: true, ran }, { headers: { "Cache-Control": "no-store" } });
}
