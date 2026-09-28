import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { campaigns, idempotencyKeys, memberships, users } from "@/server/db/schema";
import { decrypt } from "@/server/security/crypto";
import { issueQuote, QuoteError } from "./quote";
import { submitCampaign, SubmitError } from "./submit";
import type { AppConfig } from "@/server/config";

/**
 * Test send (MSG-04).
 *
 * A test send is a real send: it is priced, charged, dispatched and delivered
 * exactly like any other message. The only things that differ are where it may
 * go and what it is called.
 *
 * It may go ONLY to a mobile number a member of this organization has verified
 * they control. That restriction is the whole safety argument — without it a
 * "test" is simply an unreviewed send to any number the sender cares to type,
 * and the self-service ceiling and review rules become optional.
 */

export class TestSendError extends Error {
  constructor(
    message: string,
    readonly code: "NO_VERIFIED_NUMBER" | "NOT_A_MEMBER" | "NOT_VERIFIED" | "REFUSED",
  ) {
    super(message);
    this.name = "TestSendError";
  }
}

export type TestRecipient = {
  userId: string;
  fullName: string;
  mask: string;
  isSelf: boolean;
};

/**
 * The numbers this organization is allowed to test against: verified mobiles
 * belonging to its own members. Masked — the caller never needs the digits.
 */
export async function listTestRecipients(params: {
  organizationId: string;
  userId: string;
}): Promise<TestRecipient[]> {
  const rows = await db
    .select({
      userId: users.id,
      fullName: users.fullName,
      mask: users.mobileMask,
      verifiedAt: users.mobileVerifiedAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, params.organizationId));

  return rows
    .filter((r) => r.verifiedAt !== null && r.mask !== null)
    .map((r) => ({
      userId: r.userId,
      fullName: r.fullName,
      mask: r.mask!,
      isSelf: r.userId === params.userId,
    }))
    .sort((a, b) => Number(b.isSelf) - Number(a.isSelf));
}

export type TestSendResult = {
  campaignId: string;
  mask: string;
  costCentavos: number;
};

/**
 * Sends one message to one verified number.
 *
 * Runs through the ordinary quote and submit path so it is charged against the
 * same ledger and dispatched by the same worker. A test that took a shortcut
 * would not be testing the thing the customer is about to do.
 */
export async function sendTest(params: {
  organizationId: string;
  userId: string;
  /** Whose verified number to send to. Defaults to the sender's own. */
  recipientUserId?: string;
  senderIdentityId: string;
  body: string;
  purpose: "INFORMATIONAL" | "PROMOTIONAL";
  idempotencyKey: string;
  config?: AppConfig;
}): Promise<TestSendResult> {
  const targetUserId = params.recipientUserId ?? params.userId;

  // Membership is checked here rather than trusted from the request: the
  // recipient id arrives from the browser.
  const [row] = await db
    .select({
      encrypted: users.mobileEncrypted,
      mask: users.mobileMask,
      verifiedAt: users.mobileVerifiedAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, params.organizationId),
        eq(memberships.userId, targetUserId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new TestSendError(
      "That person is not a member of this organization.",
      "NOT_A_MEMBER",
    );
  }

  if (!row.verifiedAt || !row.encrypted) {
    throw new TestSendError(
      targetUserId === params.userId
        ? "Verify your mobile number before sending a test, so tests can only reach a phone you own."
        : "That member has not verified a mobile number yet.",
      "NOT_VERIFIED",
    );
  }

  // Checked before quoting, not after. Each call issues a fresh quote, so a
  // second click would otherwise reach `submitCampaign` with the same key but a
  // different quote and be reported as a key conflict — which is not what a
  // double click is.
  const prior = await priorTestSend(params.idempotencyKey, params.organizationId);
  if (prior) return { ...prior, mask: row.mask! };

  try {
    const quote = await issueQuote({
      organizationId: params.organizationId,
      userId: params.userId,
      senderIdentityId: params.senderIdentityId,
      purpose: params.purpose,
      body: params.body,
      rawRecipients: [decrypt(row.encrypted)],
      isTestSend: true,
      config: params.config,
    });

    const result = await submitCampaign({
      quoteId: quote.id,
      organizationId: params.organizationId,
      userId: params.userId,
      name: `Test send — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      idempotencyKey: params.idempotencyKey,
      config: params.config,
    });

    return {
      campaignId: result.campaignId,
      mask: row.mask!,
      costCentavos: quote.maxAuthorizedCostCentavos,
    };
  } catch (err) {
    // Content blocks and insufficient funds are ordinary outcomes here; they
    // are reported in the sender's words rather than as a failure.
    if (err instanceof QuoteError || err instanceof SubmitError) {
      throw new TestSendError(err.message, "REFUSED");
    }
    throw err;
  }
}

/**
 * The campaign a previous call with this key produced, if there was one.
 *
 * Scoped to the organization so a key guessed from elsewhere cannot be used to
 * read another tenant's campaign id.
 */
async function priorTestSend(
  idempotencyKey: string,
  organizationId: string,
): Promise<{ campaignId: string; costCentavos: number } | null> {
  const [claim] = await db
    .select({ responseRef: idempotencyKeys.responseRef })
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.key, idempotencyKey),
        eq(idempotencyKeys.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!claim?.responseRef) return null;

  const [campaign] = await db
    .select({
      id: campaigns.id,
      cost: campaigns.maxAuthorizedCostCentavos,
    })
    .from(campaigns)
    .where(and(eq(campaigns.id, claim.responseRef), eq(campaigns.organizationId, organizationId)))
    .limit(1);

  return campaign ? { campaignId: campaign.id, costCentavos: campaign.cost } : null;
}

/** Whether this user can test right now, for enabling the button. */
export async function hasVerifiedMobile(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ verifiedAt: users.mobileVerifiedAt })
    .from(users)
    .where(inArray(users.id, [userId]))
    .limit(1);
  return row?.verifiedAt !== null && row?.verifiedAt !== undefined;
}
