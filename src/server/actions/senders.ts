"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { senderIdentities } from "@/server/db/schema";
import { authorize } from "@/server/auth/context";
import { isUniqueViolation } from "@/server/domain/wallet";
import { recordAudit } from "@/server/audit";
import { demoFeaturesEnabled } from "@/server/env";

/**
 * Sender identity applications.
 *
 * A customer applies; a platform admin decides. The customer can never approve
 * their own sender, and `supportsInboundReplies` is not theirs to set either —
 * whether a sender can receive replies is a fact about the network route, and
 * claiming it wrongly would let the product tell recipients to reply STOP into
 * a void.
 */

export type SenderResult = { ok: boolean; message: string };

/** Alphanumeric sender IDs, the shape networks generally accept. */
const schema = z.object({
  value: z
    .string()
    .trim()
    .min(3, "A sender ID is at least 3 characters.")
    .max(11, "Alphanumeric sender IDs are at most 11 characters.")
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9 ]*[A-Za-z0-9]$/,
      "Use letters, numbers and single spaces only.",
    ),
  evidenceNote: z
    .string()
    .trim()
    .min(20, "Explain how this name relates to your registered business.")
    .max(1000),
});

export async function applyForSenderAction(formData: FormData): Promise<SenderResult> {
  const auth = await authorize("sender.apply");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const parsed = schema.safeParse({
    value: String(formData.get("value") ?? ""),
    evidenceNote: String(formData.get("evidenceNote") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That application is not valid." };
  }

  const value = parsed.data.value.toUpperCase();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(senderIdentities).values({
        organizationId: auth.ctx.org.organizationId,
        value,
        // Always PENDING. A customer cannot approve their own sender.
        status: "PENDING",
        supportsInboundReplies: false,
        evidenceNote: parsed.data.evidenceNote,
      });

      await recordAudit(
        {
          action: "sender.applied",
          organizationId: auth.ctx.org.organizationId,
          actorUserId: auth.ctx.user.id,
          objectType: "sender_identity",
          metadata: { sender: value },
        },
        tx,
      );
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, message: `You have already applied for ${value}.` };
    }
    throw err;
  }

  revalidatePath("/app/settings/senders");
  return {
    ok: true,
    message: `${value} submitted for review. You cannot send under it until it is approved.`,
  };
}

/**
 * Demo-only shortcut so the mock environment can be exercised end to end
 * without a second person logging in as an admin. Never available in LIVE, and
 * it still goes through the same status field the admin decision writes.
 */
export async function approveSenderForDemoAction(senderId: string): Promise<SenderResult> {
  if (!demoFeaturesEnabled()) {
    return { ok: false, message: "Not available in this mode." };
  }

  const auth = await authorize("sender.apply");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const updated = await db
    .update(senderIdentities)
    .set({ status: "APPROVED", decidedAt: new Date(), decisionReason: "Approved in demo mode" })
    .where(
      and(
        eq(senderIdentities.id, senderId),
        // Scoped: a sender id from another tenant does not resolve.
        eq(senderIdentities.organizationId, auth.ctx.org.organizationId),
        eq(senderIdentities.status, "PENDING"),
      ),
    )
    .returning({ id: senderIdentities.id, value: senderIdentities.value });

  if (updated.length === 0) {
    return { ok: false, message: "That sender is not awaiting review." };
  }

  await recordAudit({
    action: "sender.demo_approved",
    organizationId: auth.ctx.org.organizationId,
    actorUserId: auth.ctx.user.id,
    objectType: "sender_identity",
    objectId: senderId,
    metadata: { sender: updated[0]!.value, demo: true },
  });

  revalidatePath("/app/settings/senders");
  return { ok: true, message: `${updated[0]!.value} approved (demo mode only).` };
}

export async function listSenders(organizationId: string) {
  return db
    .select()
    .from(senderIdentities)
    .where(eq(senderIdentities.organizationId, organizationId))
    .orderBy(desc(senderIdentities.createdAt));
}
