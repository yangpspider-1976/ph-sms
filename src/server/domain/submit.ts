import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  campaigns,
  dispatchJobs,
  idempotencyKeys,
  messageItems,
  organizations,
  quotes,
  senderIdentities,
} from "@/server/db/schema";
import { MOCK_DEFAULTS, type AppConfig } from "@/server/config";
import { encrypt, numberHash, sha256 } from "@/server/security/crypto";
import { maskNormalized } from "./phone";
import { loadQuoteForConfirmation, QuoteError } from "./quote";
import { findSuppressedNumbers } from "./suppression";
import { limitsFor, reserveQuota, QuotaError } from "./quota";
import { isUniqueViolation, reserveFunds, WalletError } from "./wallet";
import { recordAudit } from "@/server/audit";

/**
 * Campaign submission.
 *
 * Everything below happens in ONE transaction: re-verification, the funds hold,
 * the quota hold, the immutable campaign and per-recipient snapshots, and the
 * durable dispatch job. If any step fails the whole thing rolls back, so there
 * is never a hold without a campaign, or a queued job without a hold.
 *
 * The dispatch job is inserted in the same transaction as the campaign rather
 * than pushed to an external queue afterwards, which is what keeps "committed"
 * and "queued" from drifting apart.
 */

export class SubmitError extends Error {
  constructor(
    message: string,
    readonly code:
      | "ORG_NOT_ACTIVE"
      | "SENDER_NOT_APPROVED"
      | "NO_ELIGIBLE_RECIPIENTS"
      | "IDEMPOTENCY_CONFLICT"
      | "INSUFFICIENT_FUNDS"
      | "SENDING_FROZEN"
      | "QUOTA_EXCEEDED"
      | "QUOTE_INVALID",
    readonly detail?: string,
  ) {
    super(message);
    this.name = "SubmitError";
  }
}

export type SubmitInput = {
  quoteId: string;
  organizationId: string;
  userId: string;
  name: string;
  /** Supplied by the client; a repeat of the same key must not send twice. */
  idempotencyKey: string;
  config?: AppConfig;
};

export type SubmitResult = {
  campaignId: string;
  reused: boolean;
  includedCount: number;
  reservedCentavos: number;
  scheduledAt: Date | null;
  /** True when content checks held this campaign for an approver. */
  pendingApproval: boolean;
};

/** Per-message key handed to the provider. Deterministic and carries no number. */
export function stableKeyFor(campaignId: string, normalized: string): string {
  return sha256(`${campaignId}:${normalized}`).slice(0, 40);
}

export async function submitCampaign(input: SubmitInput): Promise<SubmitResult> {
  const config = input.config ?? MOCK_DEFAULTS;
  const requestHash = sha256(
    JSON.stringify({ q: input.quoteId, o: input.organizationId, u: input.userId }),
  );

  try {
    return await db.transaction(async (tx) => {
      /* --- Idempotency --------------------------------------------------- */

      const claimed = await tx
        .insert(idempotencyKeys)
        .values({
          key: input.idempotencyKey,
          organizationId: input.organizationId,
          scope: "campaign.submit",
          requestHash,
        })
        .onConflictDoNothing()
        .returning({ key: idempotencyKeys.key });

      if (claimed.length === 0) {
        const existing = (
          await tx
            .select()
            .from(idempotencyKeys)
            .where(eq(idempotencyKeys.key, input.idempotencyKey))
            .limit(1)
        )[0];

        // Same key, different request: a conflict, never a second send.
        if (!existing || existing.requestHash !== requestHash) {
          throw new SubmitError(
            "That request key has already been used for a different send.",
            "IDEMPOTENCY_CONFLICT",
          );
        }
        // Same key, same request: return what the first call produced.
        if (existing.responseRef) {
          const prior = (
            await tx
              .select()
              .from(campaigns)
              .where(eq(campaigns.id, existing.responseRef))
              .limit(1)
          )[0];
          if (prior) {
            return {
              campaignId: prior.id,
              reused: true,
              includedCount: prior.includedCount,
              reservedCentavos: prior.maxAuthorizedCostCentavos,
              scheduledAt: prior.scheduledAt,
              pendingApproval: prior.status === "PENDING_APPROVAL",
            };
          }
        }
        throw new SubmitError(
          "That request is already being processed.",
          "IDEMPOTENCY_CONFLICT",
        );
      }

      /* --- Re-verify everything at submit time --------------------------- */

      const quote = await loadQuoteForConfirmation(tx, {
        quoteId: input.quoteId,
        organizationId: input.organizationId,
        userId: input.userId,
      });

      const org = (
        await tx
          .select()
          .from(organizations)
          .where(eq(organizations.id, input.organizationId))
          .limit(1)
      )[0];
      if (!org || org.status !== "ACTIVE") {
        throw new SubmitError(
          "This organization is not active and cannot send.",
          "ORG_NOT_ACTIVE",
        );
      }

      // The sender could have been revoked between quoting and confirming.
      const sender = (
        await tx
          .select()
          .from(senderIdentities)
          .where(
            and(
              eq(senderIdentities.id, quote.senderIdentityId),
              eq(senderIdentities.organizationId, input.organizationId),
              eq(senderIdentities.status, "APPROVED"),
            ),
          )
          .limit(1)
      )[0];
      if (!sender) {
        throw new SubmitError(
          "That sender identity is no longer approved. Review the send again.",
          "SENDER_NOT_APPROVED",
        );
      }

      // So could an opt-out. Re-check now; the worker checks again per message.
      const suppressed = await findSuppressedNumbers(tx, input.organizationId, quote.recipients);
      const included = quote.recipients.filter((n) => !suppressed.has(n));

      if (included.length === 0) {
        throw new SubmitError(
          "Every recipient on this quote has since opted out, so there is nothing to send.",
          "NO_ELIGIBLE_RECIPIENTS",
        );
      }

      /* --- Price the confirmed set --------------------------------------- */

      // Never more than the customer authorized: the quote's price per segment
      // is fixed, and dropping recipients can only reduce the total.
      const costCentavos = quote.segmentsPerMessage * quote.unitPriceCentavos;
      const totalCentavos = included.length * costCentavos;
      const runAt = quote.scheduledAt ?? new Date();

      /* --- Reserve funds and quota, snapshot, enqueue -------------------- */

      const { reservationId } = await reserveFunds(tx, {
        organizationId: input.organizationId,
        amountCentavos: totalCentavos,
        operationRef: `campaign:reserve:${input.idempotencyKey}`,
        actorUserId: input.userId,
      });

      const [campaign] = await tx
        .insert(campaigns)
        .values({
          organizationId: input.organizationId,
          createdBy: input.userId,
          name: input.name,
          // Held campaigns are created and funded like any other, but no
          // dispatch job is queued until an approver releases them.
          status: quote.requiresApproval
            ? "PENDING_APPROVAL"
            : quote.scheduledAt
              ? "SCHEDULED"
              : "QUEUED",
          requiresApproval: quote.requiresApproval,
          approvalReason: quote.approvalReason,
          quoteId: quote.id,
          senderIdentityId: sender.id,
          senderValueSnapshot: sender.value,
          purpose: quote.purpose,
          body: quote.body,
          bodyHash: quote.bodyHash,
          encoding: quote.encoding,
          segmentsPerMessage: quote.segmentsPerMessage,
          unitPriceCentavos: quote.unitPriceCentavos,
          pricingPolicyVersion: quote.pricingPolicyVersion,
          maxAuthorizedCostCentavos: totalCentavos,
          requestedCount: quote.recipientCount,
          includedCount: included.length,
          exclusions: {
            ...(quote.exclusions ?? {}),
            suppressedAtSubmit: quote.recipients.length - included.length,
          },
          isTestSend: quote.isTestSend,
          scheduledAt: quote.scheduledAt,
        })
        .returning();

      await tx
        .update(quotes)
        .set({ consumedByCampaignId: campaign!.id })
        .where(eq(quotes.id, quote.id));

      await tx
        .update(idempotencyKeys)
        .set({ responseRef: campaign!.id })
        .where(eq(idempotencyKeys.key, input.idempotencyKey));

      // Attach the hold to the campaign now that it exists.
      const { reservations } = await import("@/server/db/schema");
      await tx
        .update(reservations)
        .set({ campaignId: campaign!.id })
        .where(eq(reservations.id, reservationId));

      await reserveQuota(tx, {
        organizationId: input.organizationId,
        count: included.length,
        campaignId: campaign!.id,
        runAt,
        limits: limitsFor(config, {
          daily: org.dailyDestinationLimit,
          monthly: org.monthlyDestinationLimit,
        }),
      });

      // One immutable row per recipient. The unique index on
      // (campaign_id, number_hash) is what actually prevents a duplicate send.
      await tx.insert(messageItems).values(
        included.map((normalized) => ({
          campaignId: campaign!.id,
          organizationId: input.organizationId,
          stableKey: stableKeyFor(campaign!.id, normalized),
          numberHash: numberHash(normalized),
          numberEncrypted: encrypt(normalized),
          numberMasked: maskNormalized(normalized),
          segments: quote.segmentsPerMessage,
          costCentavos,
          submissionStatus: "PENDING" as const,
          deliveryStatus: "PENDING" as const,
        })),
      );

      // No dispatch job for a held campaign. Creating one and relying on the
      // worker to skip it would mean a single missed check sends the message.
      if (!quote.requiresApproval) {
        await tx.insert(dispatchJobs).values({
          organizationId: input.organizationId,
          campaignId: campaign!.id,
          kind: "DISPATCH_CAMPAIGN",
          status: "PENDING",
          runAt,
        });
      }

      await recordAudit(
        {
          action: "campaign.submitted",
          organizationId: input.organizationId,
          actorUserId: input.userId,
          objectType: "campaign",
          objectId: campaign!.id,
          metadata: {
            recipients: included.length,
            segments: quote.segmentsPerMessage,
            reservedCentavos: totalCentavos,
            scheduled: Boolean(quote.scheduledAt),
            heldForApproval: quote.requiresApproval,
          },
        },
        tx,
      );

      return {
        campaignId: campaign!.id,
        reused: false,
        includedCount: included.length,
        reservedCentavos: totalCentavos,
        scheduledAt: quote.scheduledAt,
        pendingApproval: quote.requiresApproval,
      };
    });
  } catch (err) {
    throw translate(err);
  }
}

function translate(err: unknown): Error {
  if (err instanceof SubmitError) return err;
  if (err instanceof WalletError) {
    if (err.code === "INSUFFICIENT_FUNDS") {
      return new SubmitError(
        "Your available credit does not cover this send. Top up and review again.",
        "INSUFFICIENT_FUNDS",
        err.message,
      );
    }
    if (err.code === "SENDING_FROZEN") {
      return new SubmitError(
        "Sending is frozen on this account. Contact support.",
        "SENDING_FROZEN",
        err.message,
      );
    }
  }
  if (err instanceof QuotaError) {
    return new SubmitError(err.message, "QUOTA_EXCEEDED", err.code);
  }
  if (err instanceof QuoteError) {
    return new SubmitError(err.message, "QUOTE_INVALID", err.code);
  }
  if (isUniqueViolation(err)) {
    return new SubmitError(
      "That request has already been submitted.",
      "IDEMPOTENCY_CONFLICT",
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}
