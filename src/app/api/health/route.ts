import { NextResponse } from "next/server";
import { healthReport, ping } from "@/server/domain/health";

export const dynamic = "force-dynamic";

/**
 * Health endpoint.
 *
 * `/api/health` is liveness only — cheap enough for a load balancer to poll.
 * `/api/health?full=1` returns the operational checks the runbook lists, for a
 * monitoring system to scrape. It is unauthenticated but deliberately exposes
 * only counts and states, never customer data.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);

  if (url.searchParams.get("full") !== "1") {
    const alive = await ping();
    return NextResponse.json(
      { status: alive ? "ok" : "failing" },
      { status: alive ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const report = await healthReport();

  // Degraded is still a 200: it means someone should look, not that the service
  // is down. Paging on it would train operators to ignore the page.
  return NextResponse.json(report, {
    status: report.status === "failing" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
