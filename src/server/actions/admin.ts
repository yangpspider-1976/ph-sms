"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  inquiries,
  notifications,
  organizations,
  senderIdentities,
  wallets,
} from "@/server/db/schema";
import { requirePlatformAdmin } from "@/server/auth/context";
import { recordAudit } from "@/server/audit";
import { addSuppression } from "@/server/domain/suppression";
import { normalizePhone, splitPastedNumbers } from "@/server/domain/phone";
import { ensureWallet, postPurchase } from "@/server/domain/wallet";
import { MOCK_DEFAULTS } from "@/server/config";
import { demoFeaturesEnabled } from "@/server/env";

/**
 * Platform administration.
 *
 * Every decision here records who made it, when, and why. These run on the
 * separate admin surface and re-check platform-admin status on each call —
 * being on an admin page is not by itself authorization.
 */

export type AdminResult = { ok: boolean; message: string };

const DECISIONS = ["ACTIVE", "NEEDS_INFORMATION", "SUSPENDED", "REJECTED"] as const;

/** Approve, suspend, reject or request more information for a business. */
export async function decideVerificationAction(formData: FormData): Promise<AdminResult> {
  const admin = await requirePlatformAdmin();

  const parsed = z
    .object({
      organizationId: z.string().uuid(),
      decision: z.enum(DECISIONS),
      reason: z.string().max(500).optional(),
    })
    .safeParse({
      organizationId: formData.get("organizationId"),
      decision: formData.get("decision"),
      reason: String(formData.get("reason") ?? ""),
    });

  if (!parsed.success) return { ok: false, message: "That decision was not valid." };

  const { organizationId, decision, reason } = parsed.data;

  // A rejection or suspension without a reason is not reviewable later.
  if (decision !== "ACTIVE" && !reason?.trim()) {
    return { ok: false, message: "Give a reason so the decision can be reviewed later." };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(organizations)
      .set({
        status: decision,
        statusReason: reason?.trim() || null,
        statusChangedBy: admin.id,
        statusChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId));

    if (decision === "ACTIVE") {
      await ensureWallet(organizationId, tx);
      // Demo credit so an approved account can be tried out. Never in LIVE.
      if (demoFeaturesEnabled() && MOCK_DEFAULTS.demoFundingCentavos > 0) {
        await postPurchase(tx, {
          organizationId,
          amountCentavos: MOCK_DEFAULTS.demoFundingCentavos,
          operationRef: `demo-funding:${organizationId}`,
          actorUserId: admin.id,
          reason: "Demo funding on approval — not a real payment",
        }).catch(() => {
          // Already funded: the unique operation reference makes this a no-op.
        });
      }
    }

    await tx.insert(notifications).values({
      organizationId,
      kind: "VERIFICATION_DECISION",
      title:
        decision === "ACTIVE"
          ? "Your business was approved"
          : `Your account status is now ${decision.toLowerCase().replace("_", " ")}`,
      body: reason?.trim() || "No further detail was given.",
      href: "/app/account-status",
    });

    await recordAudit(
      {
        action: "admin.verification_decision",
        organizationId,
        actorUserId: admin.id,
        actorKind: "PLATFORM_ADMIN",
        objectType: "organization",
        objectId: organizationId,
        metadata: { decision, reason: reason?.trim() ?? null },
      },
      tx,
    );
  });

  revalidatePath("/admin/verification");
  revalidatePath("/admin");
  return { ok: true, message: `Recorded: ${decision.toLowerCase().replace("_", " ")}.` };
}

/** Approve, reject or revoke a sender identity. */
export async function decideSenderAction(formData: FormData): Promise<AdminResult> {
  const admin = await requirePlatformAdmin();

  const parsed = z
    .object({
      senderId: z.string().uuid(),
      decision: z.enum(["APPROVED", "REJECTED", "REVOKED"]),
      reason: z.string().max(500).optional(),
      supportsInboundReplies: z.boolean().optional(),
    })
    .safeParse({
      senderId: formData.get("senderId"),
      decision: formData.get("decision"),
      reason: String(formData.get("reason") ?? ""),
      supportsInboundReplies: formData.get("supportsInboundReplies") === "on",
    });

  if (!parsed.success) return { ok: false, message: "That decision was not valid." };

  const sender = (
    await db
      .select()
      .from(senderIdentities)
      .where(eq(senderIdentities.id, parsed.data.senderId))
      .limit(1)
  )[0];
  if (!sender) return { ok: false, message: "That sender identity no longer exists." };

  await db.transaction(async (tx) => {
    await tx
      .update(senderIdentities)
      .set({
        status: parsed.data.decision,
        // Drives whether the app may ever tell recipients to reply STOP.
        supportsInboundReplies: parsed.data.supportsInboundReplies ?? false,
        decidedBy: admin.id,
        decidedAt: new Date(),
        decisionReason: parsed.data.reason?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(senderIdentities.id, parsed.data.senderId));

    await recordAudit(
      {
        action: "admin.sender_decision",
        organizationId: sender.organizationId,
        actorUserId: admin.id,
        actorKind: "PLATFORM_ADMIN",
        objectType: "sender_identity",
        objectId: sender.id,
        metadata: { decision: parsed.data.decision, sender: sender.value },
      },
      tx,
    );
  });

  revalidatePath("/admin/senders");
  return { ok: true, message: `Sender ${parsed.data.decision.toLowerCase()}.` };
}

const INQUIRY_STATUSES = [
  "NEW",
  "CONTACTED",
  "REVIEWING",
  "QUOTATION_SENT",
  "CONTRACTED",
  "COMPLETED",
  "REJECTED",
] as const;

/**
 * Moves an inquiry along the pipeline.
 *
 * This is a CRM record and nothing more. Marking an inquiry CONTRACTED does not
 * queue a single SMS — a contracted campaign still goes through the normal
 * reviewed send path.
 */
export async function updateInquiryAction(formData: FormData): Promise<AdminResult> {
  const admin = await requirePlatformAdmin();

  const parsed = z
    .object({
      inquiryId: z.string().uuid(),
      status: z.enum(INQUIRY_STATUSES),
      note: z.string().max(2000).optional(),
    })
    .safeParse({
      inquiryId: formData.get("inquiryId"),
      status: formData.get("status"),
      note: String(formData.get("note") ?? ""),
    });

  if (!parsed.success) return { ok: false, message: "That update was not valid." };

  await db.transaction(async (tx) => {
    await tx
      .update(inquiries)
      .set({
        status: parsed.data.status,
        internalNote: parsed.data.note?.trim() || null,
        ownerUserId: admin.id,
        updatedAt: new Date(),
      })
      .where(eq(inquiries.id, parsed.data.inquiryId));

    await recordAudit(
      {
        action: "admin.inquiry_updated",
        actorUserId: admin.id,
        actorKind: "PLATFORM_ADMIN",
        objectType: "inquiry",
        objectId: parsed.data.inquiryId,
        metadata: { status: parsed.data.status },
      },
      tx,
    );
  });

  revalidatePath("/admin/inquiries");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `Inquiry moved to ${parsed.data.status.toLowerCase().replace("_", " ")}. No SMS was sent.`,
  };
}

/** Adds a platform-wide safety block. Admin only, by design. */
export async function addPlatformSuppressionAction(formData: FormData): Promise<AdminResult> {
  const admin = await requirePlatformAdmin();

  const raw = String(formData.get("numbers") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { ok: false, message: "Give a reason for the block." };

  const entries = splitPastedNumbers(raw);
  if (entries.length === 0) return { ok: false, message: "Enter at least one number." };

  let added = 0;
  let invalid = 0;

  await db.transaction(async (tx) => {
    for (const entry of entries) {
      const result = normalizePhone(entry);
      if (!result.ok) {
        invalid += 1;
        continue;
      }
      const created = await addSuppression(tx, {
        normalized: result.normalized,
        scope: "PLATFORM",
        organizationId: null,
        reason,
        source: "ADMIN",
        createdBy: admin.id,
      });
      if (created.created) added += 1;
    }

    await recordAudit(
      {
        action: "admin.platform_suppression_added",
        actorUserId: admin.id,
        actorKind: "PLATFORM_ADMIN",
        objectType: "suppression",
        metadata: { added, invalid, reason },
      },
      tx,
    );
  });

  revalidatePath("/admin/suppression");
  return {
    ok: true,
    message: `${added} blocked platform-wide${invalid > 0 ? `, ${invalid} not valid` : ""}.`,
  };
}

/** Adjusts an organization's sending limits. */
export async function updateLimitsAction(formData: FormData): Promise<AdminResult> {
  const admin = await requirePlatformAdmin();

  const parsed = z
    .object({
      organizationId: z.string().uuid(),
      daily: z.coerce.number().int().positive().max(1_000_000),
      monthly: z.coerce.number().int().positive().max(10_000_000),
    })
    .safeParse({
      organizationId: formData.get("organizationId"),
      daily: formData.get("daily"),
      monthly: formData.get("monthly"),
    });

  if (!parsed.success) return { ok: false, message: "Those limits were not valid." };
  if (parsed.data.daily > parsed.data.monthly) {
    return { ok: false, message: "The daily limit cannot exceed the monthly limit." };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(organizations)
      .set({
        dailyDestinationLimit: parsed.data.daily,
        monthlyDestinationLimit: parsed.data.monthly,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, parsed.data.organizationId));

    await recordAudit(
      {
        action: "admin.limits_updated",
        organizationId: parsed.data.organizationId,
        actorUserId: admin.id,
        actorKind: "PLATFORM_ADMIN",
        objectType: "organization",
        objectId: parsed.data.organizationId,
        metadata: { daily: parsed.data.daily, monthly: parsed.data.monthly },
      },
      tx,
    );
  });

  revalidatePath("/admin/customers");
  return { ok: true, message: "Limits updated." };
}

/** Lifts a sending freeze once an operator has settled the debt. */
export async function clearSendingFreezeAction(organizationId: string): Promise<AdminResult> {
  const admin = await requirePlatformAdmin();

  await db.transaction(async (tx) => {
    await tx
      .update(wallets)
      .set({ sendingFrozen: false, updatedAt: new Date() })
      .where(eq(wallets.organizationId, organizationId));

    await recordAudit(
      {
        action: "admin.sending_freeze_cleared",
        organizationId,
        actorUserId: admin.id,
        actorKind: "PLATFORM_ADMIN",
        objectType: "wallet",
        objectId: organizationId,
      },
      tx,
    );
  });

  revalidatePath("/admin/credits");
  return { ok: true, message: "Sending freeze lifted. The recorded debt is unchanged." };
}
