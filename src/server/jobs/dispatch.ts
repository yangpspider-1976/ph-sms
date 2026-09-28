import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import {
  campaigns,
  dispatchAttempts,
  dispatchJobs,
  messageItems,
  organizations,
  reservations,
  senderIdentities,
} from "@/server/db/schema";
import { MOCK_DEFAULTS, type AppConfig } from "@/server/config";
import { decrypt } from "@/server/security/crypto";
import { captureFromReservation, releaseReservation } from "@/server/domain/wallet";
import { consumeQuota, releaseQuota } from "@/server/domain/quota";
import { isSuppressedNumber } from "@/server/domain/suppression";
import { getSmsProvider, type SmsProvider } from "@/server/providers/sms";
import { recordAudit } from "@/server/audit";

/**
 * Campaign dispatch.
 *
 * Two rules shape everything here:
 *
 *  1. Re-check immediately before each submission. Authorization, sender
 *     approval and opt-outs can all change between scheduling and sending.
 *
 *  2. An UNKNOWN result is not a failure. The provider may well have sent the
 *     message. It is recorded as UNKNOWN, the hold stays put, and it is only
 *     resolved by querying the provider — or left for an operator. It is never
 *     blindly re-sent, because a local database cannot promise exactly-once
 *     delivery through someone else's system.
 */

export type DispatchSummary = {
  campaignId: string;
  attempted: number;
  accepted: number;
  rejected: number;
  unknown: number;
  excluded: number;
  paused: boolean;
  pauseReason?: string;
};

/** Claims one due job using a lease, so two workers cannot take the same one. */
export async function claimJob(
  workerId: string,
  config: AppConfig = MOCK_DEFAULTS,
): Promise<typeof dispatchJobs.$inferSelect | null> {
  // The lease deadline is computed by the database rather than passed in, so it
  // uses the database clock and needs no timestamp parameter binding.
  const leaseSeconds = config.dispatchLeaseSeconds;

  // SKIP LOCKED is what makes several workers safe: a row another worker holds
  // is passed over rather than waited on.
  const rows = await db.execute<{ id: string }>(sql`
    with claimed as (
      select ${dispatchJobs.id} as id
      from ${dispatchJobs}
      where ${dispatchJobs.status} in ('PENDING', 'CLAIMED')
        and ${dispatchJobs.runAt} <= now()
        and (${dispatchJobs.leaseExpiresAt} is null or ${dispatchJobs.leaseExpiresAt} < now())
      order by ${dispatchJobs.runAt}
      for update skip locked
      limit 1
    )
    update ${dispatchJobs}
    set status = 'CLAIMED',
        lease_owner = ${workerId},
        lease_expires_at = now() + make_interval(secs => ${leaseSeconds}),
        attempts = ${dispatchJobs.attempts} + 1,
        updated_at = now()
    from claimed
    where ${dispatchJobs.id} = claimed.id
    returning ${dispatchJobs.id} as id
  `);

  const claimedId = rows[0]?.id;
  if (!claimedId) return null;

  const job = (
    await db.select().from(dispatchJobs).where(eq(dispatchJobs.id, claimedId)).limit(1)
  )[0];
  return job ?? null;
}

/**
 * Claims one due job and dispatches it. Returns false when nothing was due.
 *
 * Shared by the long-running worker and the serverless drain, so a failed
 * dispatch releases its lease the same way whichever of them picked it up.
 */
export async function runNextJob(
  workerId: string,
  options: { deadline?: number } = {},
): Promise<boolean> {
  const job = await claimJob(workerId, MOCK_DEFAULTS);
  if (!job) return false;

  try {
    const summary = await dispatchCampaign(job.campaignId, { deadline: options.deadline });
    console.log(
      `[worker ${workerId}] campaign=${job.campaignId} attempted=${summary.attempted} ` +
        `accepted=${summary.accepted} rejected=${summary.rejected} unknown=${summary.unknown} ` +
        `excluded=${summary.excluded}${summary.paused ? ` paused=${summary.pauseReason}` : ""}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker ${workerId}] campaign=${job.campaignId} failed: ${message}`);

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

/**
 * Runs due jobs until none are left or `budgetMs` has passed, and returns how
 * many it ran.
 *
 * For hosts that cannot keep `npm run worker` running. The budget is checked
 * between jobs and between messages, so a run with a platform time limit stops
 * cleanly inside it instead of being killed partway through a submission.
 */
export async function drainDueJobs(workerId: string, budgetMs: number): Promise<number> {
  const deadline = Date.now() + budgetMs;
  let ran = 0;
  while (Date.now() < deadline && (await runNextJob(workerId, { deadline }))) ran += 1;
  return ran;
}

/**
 * Runs one campaign's dispatch.
 *
 * Each message is its own transaction: one bad recipient cannot roll back the
 * ones already accepted, and a crash mid-campaign leaves the finished items
 * finished.
 */
export async function dispatchCampaign(
  campaignId: string,
  options: { provider?: SmsProvider; config?: AppConfig; deadline?: number } = {},
): Promise<DispatchSummary> {
  const config = options.config ?? MOCK_DEFAULTS;
  const provider = options.provider ?? getSmsProvider();

  const summary: DispatchSummary = {
    campaignId,
    attempted: 0,
    accepted: 0,
    rejected: 0,
    unknown: 0,
    excluded: 0,
    paused: false,
  };

  const campaign = (
    await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1)
  )[0];
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  if (campaign.status === "CANCELLED" || campaign.status === "FINISHED") {
    return summary;
  }

  // Defence in depth. Submission withholds the dispatch job for a held
  // campaign, so the worker never reaches this — but any future caller
  // invoking dispatch directly must not be able to send past an approval.
  if (campaign.status === "PENDING_APPROVAL") {
    return { ...summary, paused: true, pauseReason: "Awaiting approval" };
  }

  /* --- Authorization re-check for the campaign as a whole ---------------- */

  const blocker = await campaignBlocker(db, campaign);
  if (blocker) {
    await pauseCampaign(campaignId, blocker);
    return { ...summary, paused: true, pauseReason: blocker };
  }

  await db
    .update(campaigns)
    .set({ status: "PROCESSING", startedAt: campaign.startedAt ?? new Date() })
    .where(and(eq(campaigns.id, campaignId), inArray(campaigns.status, ["QUEUED", "SCHEDULED"])));

  const pending = await db
    .select()
    .from(messageItems)
    .where(
      and(
        eq(messageItems.campaignId, campaignId),
        inArray(messageItems.submissionStatus, ["PENDING"]),
      ),
    );

  const reservation = (
    await db
      .select()
      .from(reservations)
      .where(and(eq(reservations.campaignId, campaignId), eq(reservations.status, "ACTIVE")))
      .limit(1)
  )[0];

  for (const item of pending) {
    // Out of time: stop between messages, never inside one. A run killed after
    // PENDING -> SUBMITTING strands that message for an operator; stopping here
    // leaves the rest PENDING, and the job is claimed again once its lease lapses.
    if (options.deadline !== undefined && Date.now() >= options.deadline) break;

    // A stop issued while we were working takes effect from here on.
    const current = (
      await db
        .select({ status: campaigns.status })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1)
    )[0];
    if (current?.status === "CANCELLED" || current?.status === "PAUSED_REVIEW") break;

    // Opt-outs are re-checked per message, immediately before submitting.
    // Checked from the plain number rather than the stored hash: during a key
    // rotation the hash written at submit time may be under a different key
    // from the suppression row, and a miss here means messaging someone who
    // asked to stop.
    const normalized = decrypt(item.numberEncrypted);
    if (await isSuppressedNumber(db, campaign.organizationId, normalized)) {
      await excludeItem(item.id, campaignId, reservation?.id, item.costCentavos, "SUPPRESSED");
      summary.excluded += 1;
      continue;
    }

    // Compare-and-set: only this worker moves PENDING -> SUBMITTING.
    const taken = await db
      .update(messageItems)
      .set({ submissionStatus: "SUBMITTING", updatedAt: new Date() })
      .where(
        and(eq(messageItems.id, item.id), eq(messageItems.submissionStatus, "PENDING")),
      )
      .returning({ id: messageItems.id });
    if (taken.length === 0) continue;

    summary.attempted += 1;

    let outcome;
    try {
      outcome = await provider.submitMessage({
        stableKey: item.stableKey,
        normalizedNumber: normalized,
        sender: campaign.senderValueSnapshot,
        content: campaign.body,
      });
    } catch (err) {
      // A thrown transport error is indistinguishable from a timeout: the
      // provider may already have the message. UNKNOWN, not failed.
      outcome = {
        outcome: "UNKNOWN" as const,
        code: "TRANSPORT_ERROR",
        message: err instanceof Error ? err.message : String(err),
        latencyMs: 0,
      };
    }

    await db.transaction(async (tx) => {
      await tx.insert(dispatchAttempts).values({
        messageItemId: item.id,
        attemptNo: item.attempts + 1,
        outcome: outcome.outcome,
        errorCategory: "category" in outcome ? outcome.category : null,
        errorCode: "code" in outcome ? outcome.code : null,
        latencyMs: outcome.latencyMs,
        correlationId: item.stableKey,
      });

      if (outcome.outcome === "ACCEPTED") {
        await tx
          .update(messageItems)
          .set({
            submissionStatus: "ACCEPTED",
            partnerReference: outcome.reference,
            submittedAt: new Date(),
            acceptedAt: new Date(),
            attempts: item.attempts + 1,
            charged: true,
            updatedAt: new Date(),
          })
          .where(eq(messageItems.id, item.id));

        // Charged on confirmed acceptance, not on delivery.
        if (reservation) {
          await captureFromReservation(tx, {
            reservationId: reservation.id,
            amountCentavos: item.costCentavos,
            operationRef: `capture:${item.stableKey}`,
            campaignId,
            reason: "Accepted by provider",
          });
        }
        await consumeQuota(tx, { campaignId, count: 1 });
        summary.accepted += 1;
        return;
      }

      if (outcome.outcome === "REJECTED") {
        const retryable = outcome.category === "TRANSIENT";
        await tx
          .update(messageItems)
          .set({
            // A transient pre-acceptance failure goes back to PENDING for a
            // bounded retry; nothing was submitted, so that is safe.
            submissionStatus:
              retryable && item.attempts + 1 < config.maxDispatchAttempts
                ? "PENDING"
                : "REJECTED",
            errorCategory: outcome.category,
            errorCode: outcome.code,
            attempts: item.attempts + 1,
            submittedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(messageItems.id, item.id));

        if (!retryable || item.attempts + 1 >= config.maxDispatchAttempts) {
          // Nothing was sent, so the hold goes back and the quota is returned.
          if (reservation) {
            await releaseReservation(tx, {
              reservationId: reservation.id,
              amountCentavos: item.costCentavos,
              operationRef: `release:rejected:${item.stableKey}`,
              reason: outcome.code,
            });
          }
          await releaseQuota(tx, { campaignId, count: 1 });
          summary.rejected += 1;
        }
        return;
      }

      // UNKNOWN: the hold stays. No refund, no retry, no claim either way.
      await tx
        .update(messageItems)
        .set({
          submissionStatus: "UNKNOWN",
          errorCode: outcome.code,
          errorCategory: "TRANSIENT",
          attempts: item.attempts + 1,
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(messageItems.id, item.id));
      summary.unknown += 1;
    });
  }

  await reconcileUnknown(campaignId, provider);
  await finishIfDone(campaignId);
  return summary;
}

/**
 * Tries to settle UNKNOWN submissions by asking the provider.
 *
 * Only ever a query — never a re-send. If the provider cannot be queried, the
 * items stay UNKNOWN and their holds stay put for an operator to reconcile.
 */
export async function reconcileUnknown(
  campaignId: string,
  provider: SmsProvider = getSmsProvider(),
): Promise<number> {
  if (!provider.capabilities.supportsQuery || !provider.querySubmission) return 0;

  const unknowns = await db
    .select()
    .from(messageItems)
    .where(
      and(
        eq(messageItems.campaignId, campaignId),
        eq(messageItems.submissionStatus, "UNKNOWN"),
      ),
    );

  const reservation = (
    await db
      .select()
      .from(reservations)
      .where(and(eq(reservations.campaignId, campaignId), eq(reservations.status, "ACTIVE")))
      .limit(1)
  )[0];

  let resolved = 0;
  for (const item of unknowns) {
    const result = await provider.querySubmission(item.stableKey);
    if (!result || result.outcome !== "ACCEPTED") continue;

    await db.transaction(async (tx) => {
      const moved = await tx
        .update(messageItems)
        .set({
          submissionStatus: "ACCEPTED",
          partnerReference: result.reference,
          acceptedAt: new Date(),
          charged: true,
          updatedAt: new Date(),
        })
        .where(
          and(eq(messageItems.id, item.id), eq(messageItems.submissionStatus, "UNKNOWN")),
        )
        .returning({ id: messageItems.id });
      if (moved.length === 0) return;

      // Charged exactly once: the unique operation reference makes a repeated
      // reconciliation a no-op rather than a second charge.
      if (reservation) {
        await captureFromReservation(tx, {
          reservationId: reservation.id,
          amountCentavos: item.costCentavos,
          operationRef: `capture:${item.stableKey}`,
          campaignId,
          reason: "Resolved by reconciliation",
        });
      }
      await consumeQuota(tx, { campaignId, count: 1 });
      resolved += 1;
    });
  }
  return resolved;
}

/** Anything that must stop a campaign before it submits another message. */
async function campaignBlocker(
  tx: DbOrTx,
  campaign: typeof campaigns.$inferSelect,
): Promise<string | null> {
  const org = (
    await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, campaign.organizationId))
      .limit(1)
  )[0];
  if (!org || org.status !== "ACTIVE") {
    return `Organization is ${org?.status ?? "missing"}`;
  }

  const sender = (
    await tx
      .select()
      .from(senderIdentities)
      .where(eq(senderIdentities.id, campaign.senderIdentityId))
      .limit(1)
  )[0];
  if (!sender || sender.status !== "APPROVED") {
    return `Sender identity is ${sender?.status ?? "missing"}`;
  }

  return null;
}

/**
 * Holds a campaign for review. There is no automatic resume: whatever changed
 * (a suspension, a revoked sender, a policy change) needs a human decision.
 */
export async function pauseCampaign(campaignId: string, reason: string): Promise<void> {
  await db
    .update(campaigns)
    .set({ status: "PAUSED_REVIEW", pausedReason: reason, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  await db
    .update(dispatchJobs)
    .set({ status: "PAUSED", leaseOwner: null, leaseExpiresAt: null, lastError: reason })
    .where(eq(dispatchJobs.campaignId, campaignId));

  await recordAudit({
    action: "campaign.paused",
    actorKind: "SYSTEM",
    objectType: "campaign",
    objectId: campaignId,
    metadata: { reason },
  });
}

async function excludeItem(
  itemId: string,
  campaignId: string,
  reservationId: string | undefined,
  costCentavos: number,
  reason: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const moved = await tx
      .update(messageItems)
      .set({
        submissionStatus: "EXCLUDED",
        excludedReason: reason,
        updatedAt: new Date(),
      })
      .where(and(eq(messageItems.id, itemId), eq(messageItems.submissionStatus, "PENDING")))
      .returning({ id: messageItems.id });
    if (moved.length === 0) return;

    if (reservationId) {
      await releaseReservation(tx, {
        reservationId,
        amountCentavos: costCentavos,
        operationRef: `release:excluded:${itemId}`,
        reason,
      });
    }
    await releaseQuota(tx, { campaignId, count: 1 });
  });
}

/**
 * Marks the campaign finished when no dispatch work remains.
 *
 * FINISHED means exactly that — not that everything was delivered. UNKNOWN
 * items keep a campaign open, because they are genuinely unresolved.
 */
export async function finishIfDone(campaignId: string): Promise<boolean> {
  const rows = await db
    .select({
      outstanding: sql<number>`count(*) filter (where ${messageItems.submissionStatus} in ('PENDING','SUBMITTING','UNKNOWN'))::int`,
    })
    .from(messageItems)
    .where(eq(messageItems.campaignId, campaignId));

  if ((rows[0]?.outstanding ?? 0) > 0) return false;

  await db.transaction(async (tx) => {
    await tx
      .update(campaigns)
      .set({ status: "FINISHED", finishedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(campaigns.id, campaignId), inArray(campaigns.status, ["PROCESSING", "QUEUED"])));

    await tx
      .update(dispatchJobs)
      .set({ status: "DONE", leaseOwner: null, leaseExpiresAt: null })
      .where(eq(dispatchJobs.campaignId, campaignId));

    // Any capacity and funds not used are returned.
    await releaseQuota(tx, { campaignId });
    const active = await tx
      .select()
      .from(reservations)
      .where(and(eq(reservations.campaignId, campaignId), eq(reservations.status, "ACTIVE")));
    for (const reservation of active) {
      await releaseReservation(tx, {
        reservationId: reservation.id,
        operationRef: `release:finish:${reservation.id}`,
        reason: "Campaign finished",
      });
    }
  });
  return true;
}

/**
 * Stops a campaign. Only items that have not passed the provider boundary can
 * actually be prevented — the report says plainly how many those were.
 */
export async function stopCampaign(
  campaignId: string,
  organizationId: string,
): Promise<{ prevented: number; alreadyAccepted: number; unresolved: number }> {
  const result = await db.transaction(async (tx) => {
    // Ownership is established first. Without this, knowing a campaign id would
    // be enough to cancel another tenant's messages, because the per-item
    // update below matches on campaign id.
    const owned = (
      await tx
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, organizationId)))
        .limit(1)
    )[0];
    if (!owned) return { prevented: 0, alreadyAccepted: 0, unresolved: 0 };

    await tx
      .update(campaigns)
      .set({ status: "CANCELLED", cancelledAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(campaigns.id, campaignId),
          eq(campaigns.organizationId, organizationId),
          inArray(campaigns.status, ["SCHEDULED", "QUEUED", "PROCESSING", "PAUSED_REVIEW"]),
        ),
      );

    // Only PENDING items can be stopped. SUBMITTING is already in flight.
    const cancelled = await tx
      .update(messageItems)
      .set({ submissionStatus: "CANCELLED", updatedAt: new Date() })
      .where(
        and(
          eq(messageItems.campaignId, campaignId),
          eq(messageItems.organizationId, organizationId),
          eq(messageItems.submissionStatus, "PENDING"),
        ),
      )
      .returning({ id: messageItems.id, cost: messageItems.costCentavos });

    const counts = await tx
      .select({
        accepted: sql<number>`count(*) filter (where ${messageItems.submissionStatus} = 'ACCEPTED')::int`,
        unresolved: sql<number>`count(*) filter (where ${messageItems.submissionStatus} in ('SUBMITTING','UNKNOWN'))::int`,
      })
      .from(messageItems)
      .where(
        and(
          eq(messageItems.campaignId, campaignId),
          eq(messageItems.organizationId, organizationId),
        ),
      );

    const refundable = cancelled.reduce((sum, row) => sum + row.cost, 0);
    const active = await tx
      .select()
      .from(reservations)
      .where(and(eq(reservations.campaignId, campaignId), eq(reservations.status, "ACTIVE")));

    for (const reservation of active) {
      if (refundable > 0) {
        await releaseReservation(tx, {
          reservationId: reservation.id,
          amountCentavos: refundable,
          operationRef: `release:cancel:${campaignId}`,
          reason: "Campaign cancelled before submission",
        });
      }
    }
    await releaseQuota(tx, { campaignId, count: cancelled.length });

    await tx
      .update(dispatchJobs)
      .set({ status: "DONE", leaseOwner: null, leaseExpiresAt: null })
      .where(eq(dispatchJobs.campaignId, campaignId));

    return {
      prevented: cancelled.length,
      alreadyAccepted: counts[0]?.accepted ?? 0,
      unresolved: counts[0]?.unresolved ?? 0,
    };
  });

  await recordAudit({
    action: "campaign.stopped",
    organizationId,
    objectType: "campaign",
    objectId: campaignId,
    metadata: result,
  });

  return result;
}
