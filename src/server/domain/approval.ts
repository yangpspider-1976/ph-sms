import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { campaigns, dispatchJobs, messageItems, reservations } from "@/server/db/schema";
import { releaseReservation } from "./wallet";
import { releaseQuota } from "./quota";
import { recordAudit } from "@/server/audit";

/**
 * Campaign approval.
 *
 * A campaign held by content checks has already reserved funds and quota, and
 * has its per-recipient snapshot — everything except a dispatch job. Approving
 * creates that job; rejecting cancels the campaign and gives the money back.
 *
 * The approver is recorded on the campaign. An approver cannot create or send
 * (see rbac.ts), so the person releasing a message is never the person who
 * wrote it.
 */

export class ApprovalError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "NOT_PENDING" | "SELF_APPROVAL",
  ) {
    super(message);
    this.name = "ApprovalError";
  }
}

export type PendingCampaign = {
  id: string;
  name: string;
  body: string;
  senderValue: string;
  includedCount: number;
  maxAuthorizedCostCentavos: number;
  approvalReason: string | null;
  scheduledAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
};

export async function listPendingApproval(organizationId: string): Promise<PendingCampaign[]> {
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      body: campaigns.body,
      senderValue: campaigns.senderValueSnapshot,
      includedCount: campaigns.includedCount,
      maxAuthorizedCostCentavos: campaigns.maxAuthorizedCostCentavos,
      approvalReason: campaigns.approvalReason,
      scheduledAt: campaigns.scheduledAt,
      createdAt: campaigns.createdAt,
      createdBy: campaigns.createdBy,
    })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.organizationId, organizationId),
        eq(campaigns.status, "PENDING_APPROVAL"),
      ),
    )
    .orderBy(desc(campaigns.createdAt));
  return rows;
}

export async function countPendingApproval(organizationId: string): Promise<number> {
  return (await listPendingApproval(organizationId)).length;
}

/**
 * Releases a held campaign by creating the dispatch job that submission
 * deliberately withheld.
 */
export async function approveCampaign(input: {
  campaignId: string;
  organizationId: string;
  approverUserId: string;
  /** Owners may release their own work; a dedicated Approver may not. */
  allowSelfApproval: boolean;
}): Promise<{ scheduledAt: Date | null }> {
  return db.transaction(async (tx) => {
    const campaign = (
      await tx
        .select()
        .from(campaigns)
        .where(
          and(
            eq(campaigns.id, input.campaignId),
            eq(campaigns.organizationId, input.organizationId),
          ),
        )
        .for("update")
        .limit(1)
    )[0];

    if (!campaign) throw new ApprovalError("That campaign was not found.", "NOT_FOUND");
    if (campaign.status !== "PENDING_APPROVAL") {
      throw new ApprovalError(
        `This campaign is ${campaign.status.toLowerCase().replace("_", " ")}, not awaiting approval.`,
        "NOT_PENDING",
      );
    }
    if (!input.allowSelfApproval && campaign.createdBy === input.approverUserId) {
      throw new ApprovalError(
        "You created this campaign, so you cannot approve it. Ask another approver.",
        "SELF_APPROVAL",
      );
    }

    const runAt = campaign.scheduledAt ?? new Date();

    await tx
      .update(campaigns)
      .set({
        status: campaign.scheduledAt ? "SCHEDULED" : "QUEUED",
        approvedBy: input.approverUserId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaign.id));

    await tx
      .insert(dispatchJobs)
      .values({
        organizationId: input.organizationId,
        campaignId: campaign.id,
        kind: "DISPATCH_CAMPAIGN",
        status: "PENDING",
        runAt,
      })
      .onConflictDoNothing();

    await recordAudit(
      {
        action: "campaign.approved",
        organizationId: input.organizationId,
        actorUserId: input.approverUserId,
        objectType: "campaign",
        objectId: campaign.id,
        metadata: {
          recipients: campaign.includedCount,
          reason: campaign.approvalReason,
          selfApproved: campaign.createdBy === input.approverUserId,
        },
      },
      tx,
    );

    return { scheduledAt: campaign.scheduledAt };
  });
}

/** Refuses a held campaign and returns everything it reserved. */
export async function rejectCampaign(input: {
  campaignId: string;
  organizationId: string;
  approverUserId: string;
  reason: string;
}): Promise<{ releasedCentavos: number }> {
  return db.transaction(async (tx) => {
    const campaign = (
      await tx
        .select()
        .from(campaigns)
        .where(
          and(
            eq(campaigns.id, input.campaignId),
            eq(campaigns.organizationId, input.organizationId),
          ),
        )
        .for("update")
        .limit(1)
    )[0];

    if (!campaign) throw new ApprovalError("That campaign was not found.", "NOT_FOUND");
    if (campaign.status !== "PENDING_APPROVAL") {
      throw new ApprovalError(
        `This campaign is ${campaign.status.toLowerCase().replace("_", " ")}, not awaiting approval.`,
        "NOT_PENDING",
      );
    }

    await tx
      .update(campaigns)
      .set({
        status: "CANCELLED",
        rejectedBy: input.approverUserId,
        rejectedAt: new Date(),
        rejectionReason: input.reason,
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaign.id));

    // Nothing was submitted, so every message is cancelled outright.
    await tx
      .update(messageItems)
      .set({ submissionStatus: "CANCELLED", updatedAt: new Date() })
      .where(
        and(
          eq(messageItems.campaignId, campaign.id),
          eq(messageItems.organizationId, input.organizationId),
        ),
      );

    let releasedCentavos = 0;
    const active = await tx
      .select()
      .from(reservations)
      .where(
        and(eq(reservations.campaignId, campaign.id), eq(reservations.status, "ACTIVE")),
      );

    for (const reservation of active) {
      releasedCentavos += await releaseReservation(tx, {
        reservationId: reservation.id,
        operationRef: `release:rejected:${campaign.id}:${reservation.id}`,
        reason: "Campaign rejected at approval",
      });
    }

    await releaseQuota(tx, { campaignId: campaign.id });

    await recordAudit(
      {
        action: "campaign.rejected",
        organizationId: input.organizationId,
        actorUserId: input.approverUserId,
        objectType: "campaign",
        objectId: campaign.id,
        metadata: { reason: input.reason, releasedCentavos },
      },
      tx,
    );

    return { releasedCentavos };
  });
}
