"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/server/auth/context";
import { listTestRecipients, sendTest, TestSendError } from "@/server/domain/test-send";
import { checkRateLimit } from "@/server/security/rate-limit";
import { formatCentavos, MOCK_DEFAULTS } from "@/server/config";
import { recordAudit } from "@/server/audit";
import { dispatchAfterResponse } from "@/server/jobs/dispatch-after-response";

/** Test send (MSG-04). A real, charged send to a verified number. */

export type TestSendActionResult =
  | { ok: true; message: string; campaignId: string }
  | { ok: false; message: string };

const schema = z.object({
  senderIdentityId: z.string().uuid("Choose a sender identity."),
  body: z.string().min(1, "Enter a message.").max(2000),
  recipientUserId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(8).max(200),
});

export async function sendTestAction(raw: unknown): Promise<TestSendActionResult> {
  const auth = await authorize("campaign.send");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const limit = await checkRateLimit("test-send", auth.ctx.org.organizationId);
  if (!limit.allowed) return { ok: false, message: limit.message };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That request was not valid." };
  }

  try {
    const result = await sendTest({
      organizationId: auth.ctx.org.organizationId,
      userId: auth.ctx.user.id,
      recipientUserId: parsed.data.recipientUserId,
      senderIdentityId: parsed.data.senderIdentityId,
      body: parsed.data.body,
      purpose: "INFORMATIONAL",
      idempotencyKey: parsed.data.idempotencyKey,
      config: MOCK_DEFAULTS,
    });

    await recordAudit({
      action: "campaign.test_sent",
      organizationId: auth.ctx.org.organizationId,
      actorUserId: auth.ctx.user.id,
      objectType: "campaign",
      objectId: result.campaignId,
      metadata: { mask: result.mask, costCentavos: result.costCentavos },
    });

    revalidatePath("/app/campaigns");
    dispatchAfterResponse();

    return {
      ok: true,
      campaignId: result.campaignId,
      // Said plainly, because a test costs the same as any other message.
      message: `Test sent to ${result.mask}. It is charged like any other message (${formatCentavos(result.costCentavos)}).`,
    };
  } catch (err) {
    if (err instanceof TestSendError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function listTestRecipientsAction() {
  const auth = await authorize("campaign.send");
  if (!auth.ok) return [];
  return listTestRecipients({
    organizationId: auth.ctx.org.organizationId,
    userId: auth.ctx.user.id,
  });
}
