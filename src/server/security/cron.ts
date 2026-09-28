import "server-only";
import { env } from "@/server/env";
import { safeEqual } from "./crypto";

/**
 * Whether a request to `/api/cron/*` carries the scheduler's secret.
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` once that variable is
 * set, and the GitHub Actions schedule is configured to send the same. With no
 * secret configured nothing is authorized: an open endpoint would let anyone
 * run the retention job on demand.
 */
export function isAuthorizedCron(request: Request): boolean {
  if (!env.CRON_SECRET) return false;
  return safeEqual(request.headers.get("authorization") ?? "", `Bearer ${env.CRON_SECRET}`);
}
