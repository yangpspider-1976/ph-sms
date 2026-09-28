import "server-only";
import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import { quotes, senderIdentities } from "@/server/db/schema";
import { MOCK_DEFAULTS, type AppConfig } from "@/server/config";
import { encrypt, decrypt, numberHash, sha256 } from "@/server/security/crypto";
import { normalizePhone } from "./phone";
import { analyzeMessage, validateMessageBody } from "./segments";
import { findSuppressedNumbers } from "./suppression";
import { checkContent, type ContentCheckResult, type ContentPolicy } from "./content-checks";
import { getEffectiveContentPolicy } from "./app-config";

/**
 * Immutable priced offer.
 *
 * The customer confirms a specific quote id, and the submission is bound to
 * that quote's content hash, recipient hash, sender, schedule and price. Change
 * any of those and the quote no longer matches, so a stale review screen cannot
 * authorize a different or more expensive send than the one that was shown.
 */

export class QuoteError extends Error {
  constructor(
    message: string,
    readonly code:
      | "SENDER_NOT_ALLOWED"
      | "PROMOTIONAL_INQUIRY_ONLY"
      | "MESSAGE_INVALID"
      | "NO_ELIGIBLE_RECIPIENTS"
      | "ABOVE_SELF_SERVICE_CEILING"
      | "SCHEDULE_INVALID"
      | "CONTENT_BLOCKED"
      | "QUOTE_EXPIRED"
      | "QUOTE_ALREADY_USED"
      | "QUOTE_NOT_FOUND"
      | "QUOTE_MISMATCH",
  ) {
    super(message);
    this.name = "QuoteError";
  }
}

export type Exclusions = {
  invalid: number;
  duplicate: number;
  suppressed: number;
  overCeiling: number;
};

export type QuoteRequest = {
  organizationId: string;
  userId: string;
  senderIdentityId: string;
  purpose: "INFORMATIONAL" | "PROMOTIONAL";
  body: string;
  /** Raw entries as typed, pasted or imported. Normalization happens here. */
  rawRecipients: string[];
  scheduledAt?: Date | null;
  isTestSend?: boolean;
  config?: AppConfig;
  /** Overrides the saved policy. Used by tests; production reads the saved one. */
  contentPolicy?: ContentPolicy;
};

export type IssuedQuote = {
  id: string;
  /** Held for an approver before anything is dispatched. */
  requiresApproval: boolean;
  approvalReason: string | null;
  recipients: string[];
  exclusions: Exclusions;
  encoding: "GSM7" | "UCS2";
  segmentsPerMessage: number;
  recipientCount: number;
  segmentTotal: number;
  unitPriceCentavos: number;
  maxAuthorizedCostCentavos: number;
  expiresAt: Date;
  scheduledAt: Date | null;
  bodyHash: string;
  recipientHash: string;
};

/** Order-independent fingerprint of the recipient set. */
export function hashRecipients(normalized: string[]): string {
  return sha256([...normalized].sort().join(","));
}

/**
 * Prices a send and stores the offer.
 *
 * Exclusion order matters: the self-service ceiling is applied to unique
 * format-valid destinations BEFORE suppression. Applying suppression first
 * would let a large list slip under the ceiling because some of it happened to
 * be opted out, which is a policy bypass.
 */
export async function issueQuote(request: QuoteRequest): Promise<IssuedQuote> {
  const config = request.config ?? MOCK_DEFAULTS;

  if (request.purpose === "PROMOTIONAL") {
    throw new QuoteError(
      "Promotional messages are handled as an inquiry, not self-service. Request a bulk quote instead.",
      "PROMOTIONAL_INQUIRY_ONLY",
    );
  }

  const senderRows = await db
    .select()
    .from(senderIdentities)
    .where(
      and(
        eq(senderIdentities.id, request.senderIdentityId),
        // Scoped to the caller's organization: a sender id from another tenant
        // simply does not resolve.
        eq(senderIdentities.organizationId, request.organizationId),
        eq(senderIdentities.status, "APPROVED"),
      ),
    )
    .limit(1);

  const sender = senderRows[0];
  if (!sender) {
    throw new QuoteError(
      "That sender identity is not approved for this organization.",
      "SENDER_NOT_ALLOWED",
    );
  }

  const bodyCheck = validateMessageBody(request.body, {
    maxSegments: config.maxSegmentsPerMessage,
    supportsNonBmp: true,
    supportsUnicode: true,
  });
  if (!bodyCheck.ok) throw new QuoteError(bodyCheck.message, "MESSAGE_INVALID");

  if (request.scheduledAt) {
    const now = Date.now();
    const at = request.scheduledAt.getTime();
    if (at <= now) {
      throw new QuoteError("Pick a time in the future.", "SCHEDULE_INVALID");
    }
    if (at > now + config.maxScheduleDays * 86_400_000) {
      throw new QuoteError(
        `Scheduling is limited to ${config.maxScheduleDays} days ahead.`,
        "SCHEDULE_INVALID",
      );
    }
  }

  /* --- Recipient resolution -------------------------------------------- */

  const exclusions: Exclusions = { invalid: 0, duplicate: 0, suppressed: 0, overCeiling: 0 };
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const raw of request.rawRecipients) {
    const result = normalizePhone(raw);
    if (!result.ok) {
      exclusions.invalid += 1;
      continue;
    }
    if (seen.has(result.normalized)) {
      exclusions.duplicate += 1;
      continue;
    }
    seen.add(result.normalized);
    unique.push(result.normalized);
  }

  // Ceiling first — see the note above.
  const candidates = unique;
  if (!request.isTestSend && unique.length > config.selfServiceCeiling) {
    exclusions.overCeiling = unique.length - config.selfServiceCeiling;
    throw new QuoteError(
      `This send has ${unique.length} unique destinations, above the self-service limit of ${config.selfServiceCeiling}. Request a bulk quote for a list this size.`,
      "ABOVE_SELF_SERVICE_CEILING",
    );
  }

  const suppressed = await findSuppressedNumbers(db, request.organizationId, candidates);
  const eligible = candidates.filter((n) => !suppressed.has(n));
  exclusions.suppressed = candidates.length - eligible.length;

  if (eligible.length === 0) {
    throw new QuoteError(
      "No eligible recipients remain after validation and opt-outs, so there is nothing to send.",
      "NO_ELIGIBLE_RECIPIENTS",
    );
  }

  /* --- Content and risk checks (MSG-05) ---------------------------------- */

  // Run after exclusions so the volume rule sees the real recipient count.
  // The policy is read from admin configuration, falling back to the built-in
  // rules when nothing has been saved.
  const checks: ContentCheckResult = checkContent(request.body, {
    recipientCount: eligible.length,
    policy: request.contentPolicy ?? (await getEffectiveContentPolicy()),
  });

  if (checks.blocked) {
    throw new QuoteError(
      `${checks.summary} Edit the message and try again.`,
      "CONTENT_BLOCKED",
    );
  }

  // A test send reaches only a number a member has proven they own, so holding
  // it for an approver protects nobody and stops the sender previewing the very
  // message they need to correct. A BLOCK still blocks, and the real campaign is
  // held as normal — see DECISIONS.md.
  const requiresApproval = checks.requiresReview && !request.isTestSend;

  /* --- Pricing ----------------------------------------------------------- */

  const info = analyzeMessage(request.body);
  const segmentTotal = eligible.length * info.segments;
  const maxAuthorizedCostCentavos = segmentTotal * config.unitPriceCentavos;
  const bodyHash = sha256(request.body);
  const recipientHash = hashRecipients(eligible);
  const expiresAt = new Date(Date.now() + config.quoteValiditySeconds * 1000);

  const inserted = await db
    .insert(quotes)
    .values({
      organizationId: request.organizationId,
      createdBy: request.userId,
      senderIdentityId: sender.id,
      purpose: request.purpose,
      body: request.body,
      bodyHash,
      recipientHash,
      // The recipient list is a snapshot, encrypted at rest.
      recipientSnapshot: encrypt(JSON.stringify(eligible)),
      encoding: info.encoding,
      segmentsPerMessage: info.segments,
      recipientCount: eligible.length,
      segmentTotal,
      unitPriceCentavos: config.unitPriceCentavos,
      maxAuthorizedCostCentavos,
      pricingPolicyVersion: config.pricingPolicyVersion,
      taxPolicyVersion: config.taxPolicyVersion,
      exclusions,
      scheduledAt: request.scheduledAt ?? null,
      expiresAt,
      isTestSend: request.isTestSend ?? false,
      requiresApproval,
      approvalReason: requiresApproval ? checks.summary : null,
    })
    .returning({ id: quotes.id });

  return {
    id: inserted[0]!.id,
    requiresApproval,
    approvalReason: requiresApproval ? checks.summary : null,
    recipients: eligible,
    exclusions,
    encoding: info.encoding,
    segmentsPerMessage: info.segments,
    recipientCount: eligible.length,
    segmentTotal,
    unitPriceCentavos: config.unitPriceCentavos,
    maxAuthorizedCostCentavos,
    expiresAt,
    scheduledAt: request.scheduledAt ?? null,
    bodyHash,
    recipientHash,
  };
}

export type LoadedQuote = typeof quotes.$inferSelect & { recipients: string[] };

/**
 * Loads a quote for confirmation and checks it is still the offer that was
 * shown: same organization, same user, unexpired, unused.
 */
export async function loadQuoteForConfirmation(
  tx: DbOrTx,
  input: { quoteId: string; organizationId: string; userId: string },
): Promise<LoadedQuote> {
  const rows = await tx
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, input.quoteId), eq(quotes.organizationId, input.organizationId)))
    .for("update")
    .limit(1);

  const quote = rows[0];
  if (!quote) throw new QuoteError("That quote could not be found.", "QUOTE_NOT_FOUND");

  // Confirmation is bound to the user the quote was issued to.
  if (quote.createdBy !== input.userId) {
    throw new QuoteError("That quote was issued to a different user.", "QUOTE_MISMATCH");
  }
  if (quote.consumedByCampaignId) {
    throw new QuoteError(
      "That quote has already been used for a campaign.",
      "QUOTE_ALREADY_USED",
    );
  }
  if (quote.expiresAt.getTime() <= Date.now()) {
    throw new QuoteError(
      "This quote has expired. Review the send again to get current pricing.",
      "QUOTE_EXPIRED",
    );
  }

  const recipients = JSON.parse(decrypt(quote.recipientSnapshot)) as string[];

  // The snapshot must still match the hash the customer confirmed against.
  if (hashRecipients(recipients) !== quote.recipientHash) {
    throw new QuoteError("This quote's recipient list does not match.", "QUOTE_MISMATCH");
  }
  if (sha256(quote.body) !== quote.bodyHash) {
    throw new QuoteError("This quote's message does not match.", "QUOTE_MISMATCH");
  }

  return { ...quote, recipients };
}
