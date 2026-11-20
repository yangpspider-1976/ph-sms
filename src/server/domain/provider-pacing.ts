import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { env } from "@/server/env";

/**
 * One database-backed admission clock per mode/provider, across every worker
 * and tenant. A denied admission never consumes a dispatch attempt or funds.
 * No slots are reserved in the future, so a process restart cannot build up a
 * backlog of reservations that all submit together when the process resumes.
 */
export async function tryProviderSlot(provider: string, perSecond: number): Promise<boolean> {
  if (!Number.isInteger(perSecond) || perSecond < 1 || perSecond > 1000) {
    throw new RangeError("Provider pace must be between 1 and 1000 submissions per second.");
  }
  const intervalMs = Math.ceil(1000 / perSecond);
  const key = `${env.APP_MODE}:${provider}`;
  const admitted = await db.execute<{ key: string }>(sql`
    insert into provider_pacing (key, next_allowed_at)
    values (${key}, clock_timestamp() + ${intervalMs} * interval '1 millisecond')
    on conflict (key) do update
      set next_allowed_at = clock_timestamp() + ${intervalMs} * interval '1 millisecond'
      where provider_pacing.next_allowed_at <= clock_timestamp()
    returning key
  `);
  return admitted.length > 0;
}

/** Called before PENDING -> SUBMITTING; respects a serverless run's deadline. */
export async function waitForProviderSlot(
  provider: string,
  perSecond: number,
  deadline?: number,
): Promise<boolean> {
  while (deadline === undefined || Date.now() < deadline) {
    if (await tryProviderSlot(provider, perSecond)) return true;
    const delay = Math.ceil(1000 / perSecond);
    if (deadline !== undefined && Date.now() + delay >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return false;
}
