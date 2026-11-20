import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import { contacts, quotes, senderIdentities } from "@/server/db/schema";
import { MOCK_DEFAULTS, type AppConfig } from "@/server/config";
import { encrypt, decrypt, numberHashCandidates, sha256 } from "@/server/security/crypto";
import { normalizePhone } from "./phone";
import { analyzeMessage, validateMessageBody } from "./segments";
import { findSuppressedNumbers } from "./suppression";
import { checkContent, type ContentCheckResult, type ContentPolicy } from "./content-checks";
import { getEffectiveContentPolicy, promotionalSelfServiceEnabled } from "./app-config";
import { enServerText } from "@/i18n/locales/en-server-text";
import { personalizeMessage, personalizationFields } from "./personalization";

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
      | "PROMOTIONAL_CONSENT_REQUIRED"
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
  personalized: boolean;
  messages: PricedMessage[];
};

export type PricedMessage = {
  number: string;
  body: string;
  encoding: "GSM7" | "UCS2";
  segments: number;
};

/**
 * The messages a review shows: the first four recipients', and the longest one
 * wherever it falls in the list, marked. MSG-03 asks for the longest row as well
 * as a sample, because it is the one most likely to spill into another segment.
 * Longest means most segments, then most characters.
 */
export function samplesForReview(
  messages: PricedMessage[],
): Array<PricedMessage & { longest: boolean }> {
  if (messages.length === 0) return [];
  const longest = messages.reduce((a, b) =>
    b.segments > a.segments || (b.segments === a.segments && b.body.length > a.body.length) ? b : a,
  );
  const shown = messages.slice(0, 4);
  if (!shown.includes(longest)) shown.push(longest);
  return shown.map((message) => ({ ...message, longest: message === longest && messages.length > 1 }));
}

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

  // Promotional campaigns go to the bulk inquiry unless an admin has allowed
  // them through normal sending. Enforced here, not only by hiding the choice:
  // the purpose arrives from the browser.
  if (request.purpose === "PROMOTIONAL" && !(await promotionalSelfServiceEnabled())) {
    throw new QuoteError(enServerText.promotionalNeedsInquiry, "PROMOTIONAL_INQUIRY_ONLY");
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
      enServerText.senderNotApproved,
      "SENDER_NOT_ALLOWED",
    );
  }

  const bodyCheck = validateMessageBody(request.body, {
    maxSegments: config.maxSegmentsPerMessage,
    supportsNonBmp: true,
    supportsUnicode: true,
    allowVariables: true,
  });
  if (!bodyCheck.ok) throw new QuoteError(bodyCheck.message, "MESSAGE_INVALID");

  if (request.scheduledAt) {
    const now = Date.now();
    const at = request.scheduledAt.getTime();
    if (!Number.isFinite(at) || at <= now) {
      throw new QuoteError(enServerText.pickFutureTime, "SCHEDULE_INVALID");
    }
    if (at > now + config.maxScheduleDays * 86_400_000) {
      throw new QuoteError(
        enServerText.scheduleTooFar(String(config.maxScheduleDays)),
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
      enServerText.overSelfServiceLimit(String(unique.length), String(config.selfServiceCeiling)),
      "ABOVE_SELF_SERVICE_CEILING",
    );
  }

  const suppressed = await findSuppressedNumbers(db, request.organizationId, candidates);
  const eligible = candidates.filter((n) => !suppressed.has(n));
  exclusions.suppressed = candidates.length - eligible.length;

  if (eligible.length === 0) {
    throw new QuoteError(
      enServerText.noEligibleRecipients,
      "NO_ELIGIBLE_RECIPIENTS",
    );
  }

  const personalized = personalizationFields(request.body).length > 0;
  const contactRows = personalized || request.purpose === "PROMOTIONAL"
    ? await db.select().from(contacts).where(and(
        eq(contacts.organizationId, request.organizationId),
        inArray(contacts.numberHash, eligible.flatMap(numberHashCandidates)),
      ))
    : [];
  const contactsByHash = new Map(contactRows.map((contact) => [contact.numberHash, contact]));
  const messages: PricedMessage[] = eligible.map((number) => {
    const contact = numberHashCandidates(number).map((hash) => contactsByHash.get(hash)).find(Boolean);
    if (request.purpose === "PROMOTIONAL" && !contact?.consentSource?.trim()) {
      throw new QuoteError(enServerText.promotionalConsentRequired, "PROMOTIONAL_CONSENT_REQUIRED");
    }
    let body: string;
    try {
      body = personalizeMessage(request.body, {
        ...contact?.custom,
        first_name: contact?.firstName,
        last_name: contact?.lastName,
      });
    } catch (error) {
      throw new QuoteError(error instanceof Error ? error.message : enServerText.personalizationMissing, "MESSAGE_INVALID");
    }
    const check = validateMessageBody(body, {
      maxSegments: config.maxSegmentsPerMessage,
      supportsNonBmp: true,
      supportsUnicode: true,
    });
    if (!check.ok) throw new QuoteError(check.message, "MESSAGE_INVALID");
    const info = analyzeMessage(body);
    return { number, body, encoding: info.encoding, segments: info.segments };
  });

  /* --- Content and risk checks (MSG-05) ---------------------------------- */

  // Run after exclusions so the volume rule sees the real recipient count.
  // The policy is read from admin configuration, falling back to the built-in
  // rules when nothing has been saved.
  const policy = request.contentPolicy ?? (await getEffectiveContentPolicy());
  const results = [...new Set(messages.map((message) => message.body))].map((body) =>
    checkContent(body, { recipientCount: eligible.length, policy }),
  );
  const checks: ContentCheckResult = results.find((result) => result.blocked)
    ?? results.find((result) => result.requiresReview) ?? results[0]!;

  if (checks.blocked) {
    throw new QuoteError(
      enServerText.refusedEditMessage(checks.summary),
      "CONTENT_BLOCKED",
    );
  }

  // A test send reaches only a number a member has proven they own, so holding
  // it for an approver protects nobody and stops the sender previewing the very
  // message they need to correct. A BLOCK still blocks, and the real campaign is
  // held as normal — see DECISIONS.md.
  const requiresApproval = checks.requiresReview && !request.isTestSend;

  /* --- Pricing ----------------------------------------------------------- */

  const info = {
    encoding: messages.some((message) => message.encoding === "UCS2") ? "UCS2" as const : "GSM7" as const,
    segments: Math.max(...messages.map((message) => message.segments)),
  };
  const segmentTotal = messages.reduce((total, message) => total + message.segments, 0);
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
      messageSnapshot: personalized ? encrypt(JSON.stringify(messages)) : null,
      messageSnapshotHash: personalized ? sha256(JSON.stringify(messages)) : null,
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
    personalized,
    messages,
  };
}

export type LoadedQuote = typeof quotes.$inferSelect & { recipients: string[]; messages: PricedMessage[] };

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
  if (!quote) throw new QuoteError(enServerText.quoteNotFound, "QUOTE_NOT_FOUND");

  // Confirmation is bound to the user the quote was issued to.
  if (quote.createdBy !== input.userId) {
    throw new QuoteError(enServerText.quoteOtherUser, "QUOTE_MISMATCH");
  }
  if (quote.consumedByCampaignId) {
    throw new QuoteError(
      enServerText.quoteUsed,
      "QUOTE_ALREADY_USED",
    );
  }
  if (quote.expiresAt.getTime() <= Date.now()) {
    throw new QuoteError(
      enServerText.quoteExpired,
      "QUOTE_EXPIRED",
    );
  }

  const recipients = JSON.parse(decrypt(quote.recipientSnapshot)) as string[];

  // The snapshot must still match the hash the customer confirmed against.
  if (hashRecipients(recipients) !== quote.recipientHash) {
    throw new QuoteError(enServerText.quoteRecipientsChanged, "QUOTE_MISMATCH");
  }
  if (sha256(quote.body) !== quote.bodyHash) {
    throw new QuoteError(enServerText.quoteMessageChanged, "QUOTE_MISMATCH");
  }

  if (Boolean(quote.messageSnapshot) !== Boolean(quote.messageSnapshotHash)
      || (personalizationFields(quote.body).length > 0 && !quote.messageSnapshot)) {
    throw new QuoteError(enServerText.quoteMessageChanged, "QUOTE_MISMATCH");
  }
  const snapshot = quote.messageSnapshot ? decrypt(quote.messageSnapshot) : null;
  if (snapshot && sha256(snapshot) !== quote.messageSnapshotHash) {
    throw new QuoteError(enServerText.quoteMessageChanged, "QUOTE_MISMATCH");
  }
  const messages: PricedMessage[] = snapshot ? JSON.parse(snapshot) : recipients.map((number) => ({
    number, body: quote.body, encoding: quote.encoding, segments: quote.segmentsPerMessage,
  }));
  if (messages.length !== recipients.length || hashRecipients(messages.map((message) => message.number)) !== quote.recipientHash) {
    throw new QuoteError(enServerText.quoteRecipientsChanged, "QUOTE_MISMATCH");
  }
  return { ...quote, recipients, messages };
}
