import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db, resetDb } from "@/test/db";
import { createTenant, NUMBERS, type Tenant } from "@/test/fixtures";
import { campaigns, dispatchJobs, messageItems } from "@/server/db/schema";
import { issueQuote } from "./quote";
import { submitCampaign } from "./submit";
import { getWallet } from "./wallet";
import { approveCampaign, listPendingApproval, rejectCampaign } from "./approval";
import { MockSmsProvider } from "@/server/providers/sms";
import { dispatchCampaign } from "@/server/jobs/dispatch";

/**
 * MSG-05's core promise: a flagged job cannot bypass required review.
 */

const CLEAN = "Your order is ready for pickup until 8pm today. Thank you!";
const FLAGGED = "Act now! This loan offer expires today.";

let tenant: Tenant;

async function submit(body: string, key: string, recipients = [NUMBERS.ok(1)]) {
  const quote = await issueQuote({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    senderIdentityId: tenant.senderIdentityId,
    purpose: "INFORMATIONAL",
    body,
    rawRecipients: recipients,
  });
  const result = await submitCampaign({
    quoteId: quote.id,
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    name: `Campaign ${key}`,
    idempotencyKey: key,
  });
  return { quote, result };
}

beforeEach(async () => {
  await resetDb();
  tenant = await createTenant();
});
afterAll(closeDb);

describe("holding a flagged campaign", () => {
  it("a clean campaign is queued as normal", async () => {
    const { quote, result } = await submit(CLEAN, "clean-1");

    expect(quote.requiresApproval).toBe(false);
    expect(result.pendingApproval).toBe(false);

    const campaign = (
      await db.select().from(campaigns).where(eq(campaigns.id, result.campaignId))
    )[0]!;
    expect(campaign.status).toBe("QUEUED");

    const jobs = await db
      .select()
      .from(dispatchJobs)
      .where(eq(dispatchJobs.campaignId, result.campaignId));
    expect(jobs).toHaveLength(1);
  });

  it("a flagged campaign is held and gets NO dispatch job", async () => {
    const { quote, result } = await submit(FLAGGED, "flagged-1");

    expect(quote.requiresApproval).toBe(true);
    expect(result.pendingApproval).toBe(true);

    const campaign = (
      await db.select().from(campaigns).where(eq(campaigns.id, result.campaignId))
    )[0]!;
    expect(campaign.status).toBe("PENDING_APPROVAL");
    expect(campaign.approvalReason).toMatch(/Held for approval/);

    // The absence of the job is the control. Relying on the worker to skip a
    // queued-but-held campaign would mean one missed check sends the message.
    const jobs = await db
      .select()
      .from(dispatchJobs)
      .where(eq(dispatchJobs.campaignId, result.campaignId));
    expect(jobs).toHaveLength(0);
  });

  it("funds are still reserved while it waits", async () => {
    const { result } = await submit(FLAGGED, "flagged-2");
    const wallet = await getWallet(tenant.organizationId);
    expect(wallet.heldCentavos).toBe(result.reservedCentavos);
    expect(wallet.heldCentavos).toBeGreaterThan(0);
  });

  it("a held campaign cannot be dispatched even if dispatch is called directly", async () => {
    const { result } = await submit(FLAGGED, "flagged-3");

    const summary = await dispatchCampaign(result.campaignId, {
      provider: new MockSmsProvider(),
    });

    expect(summary.attempted).toBe(0);
    const items = await db
      .select()
      .from(messageItems)
      .where(eq(messageItems.campaignId, result.campaignId));
    expect(items.every((i) => i.submissionStatus === "PENDING")).toBe(true);
  });

  it("refuses to quote a blocked message at all", async () => {
    await expect(
      issueQuote({
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        senderIdentityId: tenant.senderIdentityId,
        purpose: "INFORMATIONAL",
        body: "Reply with your OTP to claim your prize.",
        rawRecipients: [NUMBERS.ok(1)],
      }),
    ).rejects.toMatchObject({ code: "CONTENT_BLOCKED" });

    expect(await db.select().from(campaigns)).toHaveLength(0);
  });
});

describe("approving", () => {
  it("releases the campaign and creates the dispatch job", async () => {
    const { result } = await submit(FLAGGED, "approve-1");

    await approveCampaign({
      campaignId: result.campaignId,
      organizationId: tenant.organizationId,
      approverUserId: tenant.userId,
      allowSelfApproval: true,
    });

    const campaign = (
      await db.select().from(campaigns).where(eq(campaigns.id, result.campaignId))
    )[0]!;
    expect(campaign.status).toBe("QUEUED");
    expect(campaign.approvedBy).toBe(tenant.userId);
    expect(campaign.approvedAt).not.toBeNull();

    const jobs = await db
      .select()
      .from(dispatchJobs)
      .where(eq(dispatchJobs.campaignId, result.campaignId));
    expect(jobs).toHaveLength(1);
  });

  it("an approved campaign then dispatches normally", async () => {
    const { result } = await submit(FLAGGED, "approve-2");
    await approveCampaign({
      campaignId: result.campaignId,
      organizationId: tenant.organizationId,
      approverUserId: tenant.userId,
      allowSelfApproval: true,
    });

    const summary = await dispatchCampaign(result.campaignId, {
      provider: new MockSmsProvider(),
    });
    expect(summary.accepted).toBe(1);
  });

  it("a dedicated approver cannot approve their own campaign", async () => {
    const { result } = await submit(FLAGGED, "approve-3");

    await expect(
      approveCampaign({
        campaignId: result.campaignId,
        organizationId: tenant.organizationId,
        approverUserId: tenant.userId,
        allowSelfApproval: false,
      }),
    ).rejects.toMatchObject({ code: "SELF_APPROVAL" });

    const campaign = (
      await db.select().from(campaigns).where(eq(campaigns.id, result.campaignId))
    )[0]!;
    expect(campaign.status).toBe("PENDING_APPROVAL");
  });

  it("cannot approve a campaign that is not awaiting approval", async () => {
    const { result } = await submit(CLEAN, "approve-4");
    await expect(
      approveCampaign({
        campaignId: result.campaignId,
        organizationId: tenant.organizationId,
        approverUserId: tenant.userId,
        allowSelfApproval: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_PENDING" });
  });

  it("cannot approve another tenant's campaign", async () => {
    const { result } = await submit(FLAGGED, "approve-5");
    const other = await createTenant();

    await expect(
      approveCampaign({
        campaignId: result.campaignId,
        organizationId: other.organizationId,
        approverUserId: other.userId,
        allowSelfApproval: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("rejecting", () => {
  it("cancels the campaign and returns the money", async () => {
    const { result } = await submit(FLAGGED, "reject-1");
    const held = (await getWallet(tenant.organizationId)).heldCentavos;
    expect(held).toBeGreaterThan(0);

    const outcome = await rejectCampaign({
      campaignId: result.campaignId,
      organizationId: tenant.organizationId,
      approverUserId: tenant.userId,
      reason: "Lending offers need a compliance review first",
    });

    expect(outcome.releasedCentavos).toBe(held);

    const wallet = await getWallet(tenant.organizationId);
    expect(wallet.heldCentavos).toBe(0);
    // Nothing was sent, so nothing was charged.
    expect(wallet.postedBalanceCentavos).toBe(100_000);

    const campaign = (
      await db.select().from(campaigns).where(eq(campaigns.id, result.campaignId))
    )[0]!;
    expect(campaign.status).toBe("CANCELLED");
    expect(campaign.rejectionReason).toMatch(/compliance/);
  });

  it("cancels every message so none can be picked up later", async () => {
    const { result } = await submit(FLAGGED, "reject-2", [NUMBERS.ok(1), NUMBERS.ok(2)]);
    await rejectCampaign({
      campaignId: result.campaignId,
      organizationId: tenant.organizationId,
      approverUserId: tenant.userId,
      reason: "Not appropriate",
    });

    const items = await db
      .select()
      .from(messageItems)
      .where(eq(messageItems.campaignId, result.campaignId));
    expect(items.every((i) => i.submissionStatus === "CANCELLED")).toBe(true);
  });
});

describe("the pending queue", () => {
  it("lists only this tenant's held campaigns", async () => {
    await submit(FLAGGED, "queue-1");
    await submit(CLEAN, "queue-2");

    const other = await createTenant();
    const otherQuote = await issueQuote({
      organizationId: other.organizationId,
      userId: other.userId,
      senderIdentityId: other.senderIdentityId,
      purpose: "INFORMATIONAL",
      body: FLAGGED,
      rawRecipients: [NUMBERS.ok(3)],
    });
    await submitCampaign({
      quoteId: otherQuote.id,
      organizationId: other.organizationId,
      userId: other.userId,
      name: "Theirs",
      idempotencyKey: "queue-other",
    });

    const mine = await listPendingApproval(tenant.organizationId);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.approvalReason).toMatch(/Held for approval/);

    const theirs = await listPendingApproval(other.organizationId);
    expect(theirs).toHaveLength(1);
    expect(theirs[0]!.id).not.toBe(mine[0]!.id);
  });
});
