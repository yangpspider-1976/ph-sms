import { NextResponse } from "next/server";
import { runRetention } from "@/server/jobs/retention";
import { isAuthorizedCron } from "@/server/security/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily retention — `npm run retention`, run by Vercel Cron. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const summary = await runRetention();
  return NextResponse.json({ ok: true, ...summary }, { headers: { "Cache-Control": "no-store" } });
}
