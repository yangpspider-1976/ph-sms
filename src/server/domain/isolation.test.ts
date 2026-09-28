import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db, resetDb } from "@/test/db";
import { createTenant, NUMBERS, type Tenant } from "@/test/fixtures";
import { campaigns, messageItems, suppressions } from "@/server/db/schema";
import { issueQuote, loadQuoteForConfirmation } from "./quote";
import { submitCampaign } from "./submit";
import {
  campaignSummaryForOrg,
  getCampaignForOrg,
  listCampaignItemsForOrg,
  listCampaignsForOrg,
} from "./campaigns";
import {
  addSuppression,
  findSuppressed,
  listOrganizationSuppressions,
  listPlatformSuppressions,
} from "./suppression";
import { getWallet } from "./wallet";
import { stopCampaign } from "@/server/jobs/dispatch";
import { numberHash } from "@/server/security/crypto";

/**
 * Requirement 11: one tenant must not reach another's data by object id, by a
 * list query, by a mutation or through a background job — and the check has to
 * be on the server, not in the interface.
 *
 * These call the same functions the pages and actions call, so the test fails
 * if the scoping is ever dropped from the real query.
 */

const BODY = "Your order is ready for pickup until 8pm today.";

let alpha: Tenant;
let beta: Tenant;
let alphaCampaignId: string;

beforeEach(async () => {
  await resetDb();
  alpha = await createTenant({ name: "Tenant Alpha" });
  beta = await createTenant({ name: "Tenant Beta" });

  const quote = await issueQuote({
    organizationId: alpha.organizationId,
    userId: alpha.userId,
    senderIdentityId: alpha.senderIdentityId,
    purpose: "INFORMATIONAL",
    body: BODY,
    rawRecipients: [NUMBERS.ok(1), NUMBERS.ok(2)],
  });
  const submitted = await submitCampaign({
    quoteId: quote.id,
    organizationId: alpha.organizationId,
    userId: alpha.userId,
    name: "Alpha campaign",
    idempotencyKey: "alpha-1",
  });
  alphaCampaignId = submitted.campaignId;
});
afterAll(closeDb);

describe("reading another tenant's data", () => {
  it("cannot load a campaign by its object id", async () => {
    expect(await getCampaignForOrg(alphaCampaignId, alpha.organizationId)).not.toBeNull();
    // Beta knows the id but still gets nothing back.
    expect(await getCampaignForOrg(alphaCampaignId, beta.organizationId)).toBeNull();
  });

  it("cannot see it in a list query", async () => {
    const alphaList = await listCampaignsForOrg(alpha.organizationId);
    const betaList = await listCampaignsForOrg(beta.organizationId);
    expect(alphaList.map((c) => c.id)).toContain(alphaCampaignId);
    expect(betaList).toHaveLength(0);
  });

  it("cannot read its recipients", async () => {
    const mine = await listCampaignItemsForOrg(alphaCampaignId, alpha.organizationId);
    const theirs = await listCampaignItemsForOrg(alphaCampaignId, beta.organizationId);
    expect(mine).toHaveLength(2);
    expect(theirs).toHaveLength(0);
  });

  it("cannot read its totals", async () => {
    const mine = await campaignSummaryForOrg(alphaCampaignId, alpha.organizationId);
    const theirs = await campaignSummaryForOrg(alphaCampaignId, beta.organizationId);
    expect(mine.total).toBe(2);
    expect(theirs.total).toBe(0);
  });

  it("cannot load its quote for confirmation", async () => {
    const quote = await issueQuote({
      organizationId: alpha.organizationId,
      userId: alpha.userId,
      senderIdentityId: alpha.senderIdentityId,
      purpose: "INFORMATIONAL",
      body: BODY,
      rawRecipients: [NUMBERS.ok(3)],
    });

    await expect(
      db.transaction((tx) =>
        loadQuoteForConfirmation(tx, {
          quoteId: quote.id,
          organizationId: beta.organizationId,
          userId: beta.userId,
        }),
      ),
    ).rejects.toMatchObject({ code: "QUOTE_NOT_FOUND" });
  });
});

describe("mutating another tenant's data", () => {
  it("cannot stop another tenant's campaign", async () => {
    const result = await stopCampaign(alphaCampaignId, beta.organizationId);
    expect(result.prevented).toBe(0);

    // Alpha's campaign is untouched.
    const campaign = (
      await db.select().from(campaigns).where(eq(campaigns.id, alphaCampaignId))
    )[0];
    expect(campaign!.status).toBe("QUEUED");

    const items = await db
      .select()
      .from(messageItems)
      .where(eq(messageItems.campaignId, alphaCampaignId));
    expect(items.every((i) => i.submissionStatus === "PENDING")).toBe(true);
  });

  it("cannot borrow another tenant's sender identity", async () => {
    await expect(
      issueQuote({
        organizationId: beta.organizationId,
        userId: beta.userId,
        senderIdentityId: alpha.senderIdentityId,
        purpose: "INFORMATIONAL",
        body: BODY,
        rawRecipients: [NUMBERS.ok(1)],
      }),
    ).rejects.toMatchObject({ code: "SENDER_NOT_ALLOWED" });
  });

  it("cannot spend another tenant's credit", async () => {
    const before = await getWallet(beta.organizationId);
    const quote = await issueQuote({
      organizationId: alpha.organizationId,
      userId: alpha.userId,
      senderIdentityId: alpha.senderIdentityId,
      purpose: "INFORMATIONAL",
      body: BODY,
      rawRecipients: [NUMBERS.ok(5)],
    });

    // Confirming Alpha's quote as Beta must not move Beta's money.
    await expect(
      submitCampaign({
        quoteId: quote.id,
        organizationId: beta.organizationId,
        userId: beta.userId,
        name: "Theft attempt",
        idempotencyKey: "beta-steal",
      }),
    ).rejects.toMatchObject({ code: "QUOTE_INVALID" });

    const after = await getWallet(beta.organizationId);
    expect(after).toEqual(before);
  });
});

describe("suppression does not leak between tenants", () => {
  // Requirement 12: an opt-out given to one business is not visible to another.
  it("one tenant's opt-out does not block another tenant's send", async () => {
    await db.transaction((tx) =>
      addSuppression(tx, {
        normalized: NUMBERS.ok(9),
        scope: "ORGANIZATION",
        organizationId: alpha.organizationId,
        reason: "Asked Alpha to stop",
        source: "OPERATOR_INTAKE",
      }),
    );

    const hash = numberHash(NUMBERS.ok(9));
    expect(await findSuppressed(db, alpha.organizationId, [hash])).toHaveProperty("size", 1);
    expect(await findSuppressed(db, beta.organizationId, [hash])).toHaveProperty("size", 0);

    // Beta can still quote that number; Alpha cannot.
    const betaQuote = await issueQuote({
      organizationId: beta.organizationId,
      userId: beta.userId,
      senderIdentityId: beta.senderIdentityId,
      purpose: "INFORMATIONAL",
      body: BODY,
      rawRecipients: [NUMBERS.ok(9)],
    });
    expect(betaQuote.recipientCount).toBe(1);

    await expect(
      issueQuote({
        organizationId: alpha.organizationId,
        userId: alpha.userId,
        senderIdentityId: alpha.senderIdentityId,
        purpose: "INFORMATIONAL",
        body: BODY,
        rawRecipients: [NUMBERS.ok(9)],
      }),
    ).rejects.toMatchObject({ code: "NO_ELIGIBLE_RECIPIENTS" });
  });

  it("a platform block applies to every tenant", async () => {
    await db.transaction((tx) =>
      addSuppression(tx, {
        normalized: NUMBERS.ok(11),
        scope: "PLATFORM",
        organizationId: null,
        reason: "Platform safety block",
        source: "ADMIN",
      }),
    );

    const hash = numberHash(NUMBERS.ok(11));
    expect((await findSuppressed(db, alpha.organizationId, [hash])).get(hash)).toBe("PLATFORM");
    expect((await findSuppressed(db, beta.organizationId, [hash])).get(hash)).toBe("PLATFORM");
  });

  it("a tenant's own list never contains another tenant's rows", async () => {
    await db.transaction(async (tx) => {
      await addSuppression(tx, {
        normalized: NUMBERS.ok(20),
        scope: "ORGANIZATION",
        organizationId: alpha.organizationId,
        reason: "alpha",
        source: "OPERATOR_INTAKE",
      });
      await addSuppression(tx, {
        normalized: NUMBERS.ok(21),
        scope: "ORGANIZATION",
        organizationId: beta.organizationId,
        reason: "beta",
        source: "OPERATOR_INTAKE",
      });
      await addSuppression(tx, {
        normalized: NUMBERS.ok(22),
        scope: "PLATFORM",
        organizationId: null,
        reason: "platform",
        source: "ADMIN",
      });
    });

    const alphaList = await listOrganizationSuppressions(alpha.organizationId);
    const betaList = await listOrganizationSuppressions(beta.organizationId);
    expect(alphaList).toHaveLength(1);
    expect(betaList).toHaveLength(1);
    expect(alphaList[0]!.reason).toBe("alpha");
    expect(betaList[0]!.reason).toBe("beta");

    // The platform list is the admin surface and is separate from both.
    const platform = await listPlatformSuppressions();
    expect(platform).toHaveLength(1);
    expect(platform[0]!.organizationId).toBeNull();
  });

  it("a business cannot create a platform-wide block", async () => {
    await expect(
      db.transaction((tx) =>
        addSuppression(tx, {
          normalized: NUMBERS.ok(30),
          scope: "PLATFORM",
          // A tenant id on a platform row is rejected outright.
          organizationId: alpha.organizationId,
          reason: "trying to block globally",
          source: "OPERATOR_INTAKE",
        }),
      ),
    ).rejects.toThrow(/must not belong to an organization/);

    expect(await listPlatformSuppressions()).toHaveLength(0);
  });
});

describe("database-level scoping", () => {
  it("every row a tenant creates carries its organization id", async () => {
    const items = await db
      .select()
      .from(messageItems)
      .where(eq(messageItems.campaignId, alphaCampaignId));
    expect(items.every((i) => i.organizationId === alpha.organizationId)).toBe(true);

    const rows = await db.select().from(suppressions);
    for (const row of rows) {
      if (row.scope === "ORGANIZATION") expect(row.organizationId).not.toBeNull();
      else expect(row.organizationId).toBeNull();
    }
  });
});
