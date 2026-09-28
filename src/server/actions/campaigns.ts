"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/server/auth/context";
import { issueQuote, QuoteError } from "@/server/domain/quote";
import { submitCampaign, SubmitError } from "@/server/domain/submit";
import { stopCampaign } from "@/server/jobs/dispatch";
import { dispatchAfterResponse } from "@/server/jobs/dispatch-after-response";
import { getWallet } from "@/server/domain/wallet";
import { maskNormalized } from "@/server/domain/phone";
import { formatCentavos } from "@/server/config";
import { getEffectiveConfig } from "@/server/domain/app-config";
import { recordAudit } from "@/server/audit";
import { checkRateLimit } from "@/server/security/rate-limit";

/**
 * Send-path server actions.
 *
 * These are the authority. The wizard's live counters are a preview; what the
 * customer is actually offered and charged is decided here, on the server,
 * against the database.
 */

export type QuoteView = {
  quoteId: string;
  recipientCount: number;
  segmentsPerMessage: number;
  segmentTotal: number;
  encoding: "GSM7" | "UCS2";
  unitPriceLabel: string;
  totalLabel: string;
  totalCentavos: number;
  availableLabel: string;
  sufficientFunds: boolean;
  exclusions: { invalid: number; duplicate: number; suppressed: number };
  expiresAt: string;
  scheduledAt: string | null;
  sampleMasked: string[];
  senderValue: string;
  /** Whether "Reply STOP" may be shown: only if this sender can receive replies. */
  senderAcceptsReplies: boolean;
};

export type QuoteResult =
  | { ok: true; quote: QuoteView }
  | { ok: false; error: string; code: string; supportRef?: string };

const quoteInput = z.object({
  senderIdentityId: z.string().uuid("Choose a sender identity."),
  body: z.string().min(1, "Enter a message."),
  recipients: z.array(z.string()).min(1, "Add at least one recipient."),
  scheduledAt: z.string().optional().nullable(),
});

export async function createQuoteAction(raw: unknown): Promise<QuoteResult> {
  const auth = await authorize("campaign.send");
  if (!auth.ok) {
    return { ok: false, error: auth.error.message, code: auth.error.code, supportRef: auth.error.supportRef };
  }

  const quoteLimit = await checkRateLimit("quote", auth.ctx.org.organizationId);
  if (!quoteLimit.allowed) {
    return { ok: false, error: quoteLimit.message, code: "RATE_LIMITED" };
  }

  const parsed = quoteInput.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "That request was not valid.",
      code: "INVALID_INPUT",
    };
  }

  try {
    const quote = await issueQuote({
      organizationId: auth.ctx.org.organizationId,
      userId: auth.ctx.user.id,
      senderIdentityId: parsed.data.senderIdentityId,
      purpose: "INFORMATIONAL",
      body: parsed.data.body,
      rawRecipients: parsed.data.recipients,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
    });

    const wallet = await getWallet(auth.ctx.org.organizationId);

    // Look up the sender once more purely to decide opt-out wording.
    const { db } = await import("@/server/db");
    const { senderIdentities } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const sender = (
      await db
        .select()
        .from(senderIdentities)
        .where(eq(senderIdentities.id, parsed.data.senderIdentityId))
        .limit(1)
    )[0];

    return {
      ok: true,
      quote: {
        quoteId: quote.id,
        recipientCount: quote.recipientCount,
        segmentsPerMessage: quote.segmentsPerMessage,
        segmentTotal: quote.segmentTotal,
        encoding: quote.encoding,
        unitPriceLabel: formatCentavos(quote.unitPriceCentavos),
        totalLabel: formatCentavos(quote.maxAuthorizedCostCentavos),
        totalCentavos: quote.maxAuthorizedCostCentavos,
        availableLabel: formatCentavos(wallet.availableCentavos),
        sufficientFunds: wallet.availableCentavos >= quote.maxAuthorizedCostCentavos,
        exclusions: {
          invalid: quote.exclusions.invalid,
          duplicate: quote.exclusions.duplicate,
          suppressed: quote.exclusions.suppressed,
        },
        expiresAt: quote.expiresAt.toISOString(),
        scheduledAt: quote.scheduledAt?.toISOString() ?? null,
        // Only ever masked numbers leave the server for the review screen.
        sampleMasked: quote.recipients.slice(0, 5).map(maskNormalized),
        senderValue: sender?.value ?? "",
        senderAcceptsReplies: sender?.supportsInboundReplies ?? false,
      },
    };
  } catch (err) {
    if (err instanceof QuoteError) return { ok: false, error: err.message, code: err.code };
    throw err;
  }
}

export type ConfirmResult =
  | { ok: true; campaignId: string; includedCount: number; scheduled: boolean }
  | { ok: false; error: string; code: string };

const confirmInput = z.object({
  quoteId: z.string().uuid(),
  name: z.string().min(1).max(120),
  idempotencyKey: z.string().min(8).max(200),
});

/**
 * Final confirmation. Bound to the exact quote; the idempotency key comes from
 * the review screen, so a double-click or a retry lands on the same campaign.
 */
export async function confirmSendAction(raw: unknown): Promise<ConfirmResult> {
  const auth = await authorize("campaign.send");
  if (!auth.ok) return { ok: false, error: auth.error.message, code: auth.error.code };

  const dispatchLimit = await checkRateLimit("dispatch", auth.ctx.org.organizationId);
  if (!dispatchLimit.allowed) {
    return { ok: false, error: dispatchLimit.message, code: "RATE_LIMITED" };
  }

  const parsed = confirmInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "That confirmation was not valid.", code: "INVALID_INPUT" };
  }

  try {
    const result = await submitCampaign({
      quoteId: parsed.data.quoteId,
      organizationId: auth.ctx.org.organizationId,
      userId: auth.ctx.user.id,
      name: parsed.data.name,
      idempotencyKey: parsed.data.idempotencyKey,
      config: await getEffectiveConfig(),
    });

    revalidatePath("/app/campaigns");
    revalidatePath("/app/dashboard");
    dispatchAfterResponse();

    return {
      ok: true,
      campaignId: result.campaignId,
      includedCount: result.includedCount,
      scheduled: result.scheduledAt !== null,
    };
  } catch (err) {
    if (err instanceof SubmitError) return { ok: false, error: err.message, code: err.code };
    throw err;
  }
}

export type StopResult =
  | { ok: true; prevented: number; alreadyAccepted: number; unresolved: number }
  | { ok: false; error: string };

/** Stops a campaign and reports honestly what could and could not be stopped. */
export async function stopCampaignAction(campaignId: string): Promise<StopResult> {
  const auth = await authorize("campaign.cancel");
  if (!auth.ok) return { ok: false, error: auth.error.message };

  const result = await stopCampaign(campaignId, auth.ctx.org.organizationId);

  await recordAudit({
    action: "campaign.stop_requested",
    organizationId: auth.ctx.org.organizationId,
    actorUserId: auth.ctx.user.id,
    objectType: "campaign",
    objectId: campaignId,
    metadata: result,
  });

  revalidatePath(`/app/campaigns/${campaignId}`);
  return { ok: true, ...result };
}
