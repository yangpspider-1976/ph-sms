import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { type DbOrTx } from "@/server/db";
import { quotaBuckets, quotaReservations } from "@/server/db/schema";
import { manilaDayKey, manilaMonthKey, type AppConfig } from "@/server/config";

/**
 * Destination quota.
 *
 * Buckets are keyed by the Asia/Manila calendar day and month, because that is
 * the day the customer means. Capacity is reserved when a campaign is accepted
 * (including a scheduled one), consumed at dispatch, and released if recipients
 * end up excluded or the campaign is cancelled. A retry of the same message
 * never consumes capacity twice — consumption is driven by the message item's
 * state transition, not by the attempt.
 */

export class QuotaError extends Error {
  constructor(
    message: string,
    readonly code: "DAILY_EXCEEDED" | "MONTHLY_EXCEEDED",
    readonly remaining: number,
  ) {
    super(message);
    this.name = "QuotaError";
  }
}

export type QuotaLimits = { daily: number; monthly: number };

export function limitsFor(
  config: AppConfig,
  overrides?: { daily?: number | null; monthly?: number | null },
): QuotaLimits {
  return {
    daily: overrides?.daily ?? config.dailyDestinationQuota,
    monthly: overrides?.monthly ?? config.monthlyDestinationQuota,
  };
}

async function lockOrCreateBucket(
  tx: DbOrTx,
  organizationId: string,
  period: "DAY" | "MONTH",
  periodKey: string,
  limitCount: number,
) {
  await tx
    .insert(quotaBuckets)
    .values({ organizationId, period, periodKey, limitCount })
    .onConflictDoNothing();

  const rows = await tx
    .select()
    .from(quotaBuckets)
    .where(
      and(
        eq(quotaBuckets.organizationId, organizationId),
        eq(quotaBuckets.period, period),
        eq(quotaBuckets.periodKey, periodKey),
      ),
    )
    .for("update");

  return rows[0]!;
}

/**
 * Reserves destination capacity for the period the campaign will run in.
 * Must be called inside the same transaction as the funds reservation.
 */
export async function reserveQuota(
  tx: DbOrTx,
  input: {
    organizationId: string;
    count: number;
    campaignId?: string | null;
    runAt: Date;
    limits: QuotaLimits;
  },
): Promise<{ reservationIds: string[] }> {
  if (input.count <= 0) return { reservationIds: [] };

  const dayKey = manilaDayKey(input.runAt);
  const monthKey = manilaMonthKey(input.runAt);
  const reservationIds: string[] = [];

  for (const [period, key, limit] of [
    ["DAY", dayKey, input.limits.daily],
    ["MONTH", monthKey, input.limits.monthly],
  ] as const) {
    const bucket = await lockOrCreateBucket(tx, input.organizationId, period, key, limit);
    // The configured limit can change between periods; the live limit wins.
    const effectiveLimit = limit;
    const used = bucket.reservedCount + bucket.consumedCount;
    const remaining = effectiveLimit - used;

    if (input.count > remaining) {
      throw new QuotaError(
        period === "DAY"
          ? `This send needs ${input.count} destinations but only ${Math.max(remaining, 0)} remain in today's limit (${effectiveLimit}).`
          : `This send needs ${input.count} destinations but only ${Math.max(remaining, 0)} remain in this month's limit (${effectiveLimit}).`,
        period === "DAY" ? "DAILY_EXCEEDED" : "MONTHLY_EXCEEDED",
        Math.max(remaining, 0),
      );
    }

    await tx
      .update(quotaBuckets)
      .set({
        reservedCount: bucket.reservedCount + input.count,
        limitCount: effectiveLimit,
        updatedAt: new Date(),
      })
      .where(eq(quotaBuckets.id, bucket.id));

    const inserted = await tx
      .insert(quotaReservations)
      .values({
        organizationId: input.organizationId,
        bucketId: bucket.id,
        campaignId: input.campaignId ?? null,
        amount: input.count,
        status: "ACTIVE",
      })
      .returning({ id: quotaReservations.id });

    reservationIds.push(inserted[0]!.id);
  }

  return { reservationIds };
}

/** Moves reserved capacity to consumed at dispatch time. */
export async function consumeQuota(
  tx: DbOrTx,
  input: { campaignId: string; count: number },
): Promise<void> {
  if (input.count <= 0) return;
  const rows = await tx
    .select()
    .from(quotaReservations)
    .where(
      and(
        eq(quotaReservations.campaignId, input.campaignId),
        eq(quotaReservations.status, "ACTIVE"),
      ),
    )
    .for("update");

  for (const reservation of rows) {
    const room = reservation.amount - reservation.consumed;
    const take = Math.min(room, input.count);
    if (take <= 0) continue;

    const bucket = (
      await tx
        .select()
        .from(quotaBuckets)
        .where(eq(quotaBuckets.id, reservation.bucketId))
        .for("update")
    )[0]!;

    await tx
      .update(quotaBuckets)
      .set({
        reservedCount: Math.max(bucket.reservedCount - take, 0),
        consumedCount: bucket.consumedCount + take,
        updatedAt: new Date(),
      })
      .where(eq(quotaBuckets.id, bucket.id));

    await tx
      .update(quotaReservations)
      .set({ consumed: reservation.consumed + take })
      .where(eq(quotaReservations.id, reservation.id));
  }
}

/** Returns unused capacity when recipients are excluded or a campaign is cancelled. */
export async function releaseQuota(
  tx: DbOrTx,
  input: { campaignId: string; count?: number },
): Promise<number> {
  const rows = await tx
    .select()
    .from(quotaReservations)
    .where(
      and(
        eq(quotaReservations.campaignId, input.campaignId),
        eq(quotaReservations.status, "ACTIVE"),
      ),
    )
    .for("update");

  let released = 0;
  for (const reservation of rows) {
    const outstanding = reservation.amount - reservation.consumed;
    const give = input.count === undefined ? outstanding : Math.min(outstanding, input.count);
    if (give <= 0) continue;

    const bucket = (
      await tx
        .select()
        .from(quotaBuckets)
        .where(eq(quotaBuckets.id, reservation.bucketId))
        .for("update")
    )[0]!;

    await tx
      .update(quotaBuckets)
      .set({
        reservedCount: Math.max(bucket.reservedCount - give, 0),
        updatedAt: new Date(),
      })
      .where(eq(quotaBuckets.id, bucket.id));

    await tx
      .update(quotaReservations)
      .set({
        amount: reservation.amount - give,
        status: reservation.amount - give <= reservation.consumed ? "RELEASED" : "ACTIVE",
      })
      .where(eq(quotaReservations.id, reservation.id));

    released += give;
  }
  return released;
}

/** Closes out a campaign's quota reservations once no dispatch work remains. */
export async function closeQuota(tx: DbOrTx, campaignId: string): Promise<void> {
  await releaseQuota(tx, { campaignId });
  await tx
    .update(quotaReservations)
    .set({ status: "RELEASED" })
    .where(
      and(
        eq(quotaReservations.campaignId, campaignId),
        inArray(quotaReservations.status, ["ACTIVE"]),
      ),
    );
}

export type QuotaUsage = {
  daily: { used: number; limit: number; remaining: number };
  monthly: { used: number; limit: number; remaining: number };
};

export async function quotaUsage(
  tx: DbOrTx,
  organizationId: string,
  limits: QuotaLimits,
  at: Date = new Date(),
): Promise<QuotaUsage> {
  const keys = [manilaDayKey(at), manilaMonthKey(at)];
  const rows = await tx
    .select()
    .from(quotaBuckets)
    .where(
      and(
        eq(quotaBuckets.organizationId, organizationId),
        inArray(quotaBuckets.periodKey, keys),
      ),
    );

  const day = rows.find((r) => r.period === "DAY");
  const month = rows.find((r) => r.period === "MONTH");
  const usedDay = (day?.reservedCount ?? 0) + (day?.consumedCount ?? 0);
  const usedMonth = (month?.reservedCount ?? 0) + (month?.consumedCount ?? 0);

  return {
    daily: {
      used: usedDay,
      limit: limits.daily,
      remaining: Math.max(limits.daily - usedDay, 0),
    },
    monthly: {
      used: usedMonth,
      limit: limits.monthly,
      remaining: Math.max(limits.monthly - usedMonth, 0),
    },
  };
}
