"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/server/auth/context";
import { approveCampaign, rejectCampaign, ApprovalError } from "@/server/domain/approval";
import { dispatchAfterResponse } from "@/server/jobs/dispatch-after-response";

export type ApprovalResult = { ok: boolean; message: string };

/**
 * Releases a held campaign.
 *
 * An Owner may release their own work — in a small business there is often
 * nobody else. A dedicated Approver may not: that separation is the entire
 * reason the role exists.
 */
export async function approveCampaignAction(campaignId: string): Promise<ApprovalResult> {
  const auth = await authorize("campaign.approve");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const parsed = z.string().uuid().safeParse(campaignId);
  if (!parsed.success) return { ok: false, message: "That campaign is not valid." };

  try {
    const result = await approveCampaign({
      campaignId: parsed.data,
      organizationId: auth.ctx.org.organizationId,
      approverUserId: auth.ctx.user.id,
      allowSelfApproval: auth.ctx.org.role === "OWNER",
    });

    revalidatePath("/app/campaigns");
    revalidatePath("/app/approvals");
    dispatchAfterResponse();

    return {
      ok: true,
      message: result.scheduledAt
        ? "Approved. It will send at the scheduled time."
        : "Approved. It has been queued for sending.",
    };
  } catch (err) {
    if (err instanceof ApprovalError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function rejectCampaignAction(formData: FormData): Promise<ApprovalResult> {
  const auth = await authorize("campaign.approve");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const parsed = z
    .object({
      campaignId: z.string().uuid(),
      reason: z.string().trim().min(5, "Give a reason so the sender knows what to change."),
    })
    .safeParse({
      campaignId: formData.get("campaignId"),
      reason: String(formData.get("reason") ?? ""),
    });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That rejection is not valid." };
  }

  try {
    const result = await rejectCampaign({
      campaignId: parsed.data.campaignId,
      organizationId: auth.ctx.org.organizationId,
      approverUserId: auth.ctx.user.id,
      reason: parsed.data.reason,
    });

    revalidatePath("/app/campaigns");
    revalidatePath("/app/approvals");

    return {
      ok: true,
      message: `Rejected. Nothing was sent and the reserved credit has been returned.`,
    };
  } catch (err) {
    if (err instanceof ApprovalError) return { ok: false, message: err.message };
    throw err;
  }
}
