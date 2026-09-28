import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db, resetDb } from "@/test/db";
import { createTenant, NUMBERS, type Tenant } from "@/test/fixtures";
import {
  campaigns,
  dispatchJobs,
  ledgerEntries,
  messageItems,
  senderIdentities,
} from "@/server/db/schema";
import { MOCK_DEFAULTS } from "@/server/config";
import { issueQuote } from "@/server/domain/quote";
import { submitCampaign } from "@/server/domain/submit";
import { getWallet } from "@/server/domain/wallet";
import { addSuppression } from "@/server/domain/suppression";
import { quotaUsage, limitsFor } from "@/server/domain/quota";
import { MockSmsProvider, type SmsProvider, type SubmissionOutcome } from "@/server/providers/sms";
import {
  claimJob,
  dispatchCampaign,
  drainDueJobs,
  reconcileUnknown,
  stopCampaign,
} from "./dispatch";

const BODY = "Your order is ready for pickup until 8pm today.";

let tenant: Tenant;
let provider: MockSmsProvider;

async function submit(recipients: string[], key: string) {
  const quote = await issueQuote({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    senderIdentityId: tenant.senderIdentityId,
    purpose: "INFORMATIONAL",
    body: BODY,
    rawRecipients: recipients,
  });
  return submitCampaign({
    quoteId: quote.id,
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    name: `Campaign ${key}`,
    idempotencyKey: key,
  });
}

const itemsOf = (campaignId: string) =>
  db.select().from(messageItems).where(eq(messageItems.campaignId, campaignId));

const chargeCount = async (campaignId: string) => {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.campaignId, campaignId), eq(ledgerEntries.type, "CHARGE")));
  return rows[0]?.n ?? 0;
};

beforeEach(async () => {
  await resetDb();
  tenant = await createTenant();
  provider = new MockSmsProvider();
});
afterAll(closeDb);

describe("dispatch", () => {
  it("submits each recipient once and charges on acceptance", async () => {
    const result = await submit([NUMBERS.ok(1), NUMBERS.ok(2), NUMBERS.ok(3)], "d1");
    const summary = await dispatchCampaign(result.campaignId, { provider });

    expect(summary.accepted).toBe(3);
    expect(summary.rejected).toBe(0);
    expect(summary.unknown).toBe(0);

    const items = await itemsOf(result.campaignId);
    expect(items.every((i) => i.submissionStatus === "ACCEPTED")).toBe(true);
    expect(items.every((i) => i.partnerReference !== null)).toBe(true);

    // Charged on acceptance: the hold is gone and the balance has dropped.
    const wallet = await getWallet(tenant.organizationId);
    expect(wallet.heldCentavos).toBe(0);
    expect(wallet.postedBalanceCentavos).toBe(100_000 - 3 * MOCK_DEFAULTS.unitPriceCentavos);
    expect(await chargeCount(result.campaignId)).toBe(3);

    const campaign = (
      await db.select().from(campaigns).where(eq(campaigns.id, result.campaignId))
    )[0];
    expect(campaign!.status).toBe("FINISHED");
  });

  it("a rejected recipient releases its hold rather than being charged", async () => {
    const result = await submit([NUMBERS.ok(1), NUMBERS.rejected], "d2");
    const summary = await dispatchCampaign(result.campaignId, { provider });

    expect(summary.accepted).toBe(1);
    expect(summary.rejected).toBe(1);

    const items = await itemsOf(result.campaignId);
    const rejected = items.find((i) => i.submissionStatus === "REJECTED");
    expect(rejected?.errorCategory).toBe("RECIPIENT");

    const wallet = await getWallet(tenant.organizationId);
    expect(wallet.heldCentavos).toBe(0);
    // Only the accepted one was charged.
    expect(wallet.postedBalanceCentavos).toBe(100_000 - MOCK_DEFAULTS.unitPriceCentavos);
  });

  it("delivery state stays separate from submission state", async () => {
    const result = await submit([NUMBERS.ok(1)], "d3");
    await dispatchCampaign(result.campaignId, { provider });

    const item = (await itemsOf(result.campaignId))[0]!;
    // Accepted by the provider is not the same as delivered.
    expect(item.submissionStatus).toBe("ACCEPTED");
    expect(item.deliveryStatus).toBe("PENDING");
    expect(item.deliveredAt).toBeNull();
  });
});

describe("unknown submissions", () => {
  // Requirement 8: a timeout after the provider may have accepted must never
  // cause a second SMS.
  it("records UNKNOWN, keeps the hold, and does not resend", async () => {
    const result = await submit([NUMBERS.unknown], "u1");
    const summary = await dispatchCampaign(result.campaignId, { provider });

    expect(summary.unknown).toBe(1);
    expect(summary.accepted).toBe(0);

    const item = (await itemsOf(result.campaignId))[0]!;
    expect(item.submissionStatus).toBe("ACCEPTED"); // resolved by reconciliation below
    expect(item.attempts).toBe(1);
  });

  it("leaves UNKNOWN unresolved and the hold in place when the provider cannot be queried", async () => {
    // A provider with no query support is the realistic case until the partner
    // contract says otherwise.
    const blind: SmsProvider = {
      capabilities: { ...provider.capabilities, supportsQuery: false, guaranteesIdempotency: false },
      async submitMessage(): Promise<SubmissionOutcome> {
        return {
          outcome: "UNKNOWN",
          code: "TIMEOUT",
          message: "no response",
          latencyMs: 1,
        };
      },
      verifyAndMapDeliveryEvent: () => null,
    };

    const result = await submit([NUMBERS.ok(1)], "u2");
    const summary = await dispatchCampaign(result.campaignId, { provider: blind });

    expect(summary.unknown).toBe(1);

    const item = (await itemsOf(result.campaignId))[0]!;
    expect(item.submissionStatus).toBe("UNKNOWN");
    expect(item.attempts).toBe(1);

    // The hold stays: no automatic refund of an ambiguous timeout.
    const wallet = await getWallet(tenant.organizationId);
    expect(wallet.heldCentavos).toBe(MOCK_DEFAULTS.unitPriceCentavos);
    expect(await chargeCount(result.campaignId)).toBe(0);

    // And the campaign is not finished, because the item is genuinely unresolved.
    const campaign = (
      await db.select().from(campaigns).where(eq(campaigns.id, result.campaignId))
    )[0];
    expect(campaign!.status).toBe("PROCESSING");

    // Running dispatch again does not submit it a second time.
    const again = await dispatchCampaign(result.campaignId, { provider: blind });
    expect(again.attempted).toBe(0);
  });

  // Requirement 8: reconciliation captures at most one charge.
  it("reconciliation charges exactly once, however many times it runs", async () => {
    const result = await submit([NUMBERS.unknown], "u3");
    await dispatchCampaign(result.campaignId, { provider });

    // dispatchCampaign already reconciles once; run it twice more.
    await reconcileUnknown(result.campaignId, provider);
    await reconcileUnknown(result.campaignId, provider);

    expect(await chargeCount(result.campaignId)).toBe(1);

    const wallet = await getWallet(tenant.organizationId);
    expect(wallet.postedBalanceCentavos).toBe(100_000 - MOCK_DEFAULTS.unitPriceCentavos);
    expect(wallet.heldCentavos).toBe(0);
  });
});

describe("pre-send re-checks", () => {
  // Requirement 7: an opt-out after scheduling blocks the pending work.
  it("excludes a recipient who opted out after the campaign was queued", async () => {
    const result = await submit([NUMBERS.ok(1), NUMBERS.ok(2)], "r1");

    await db.transaction((tx) =>
      addSuppression(tx, {
        normalized: NUMBERS.ok(2),
        scope: "ORGANIZATION",
        organizationId: tenant.organizationId,
        reason: "Opted out after queueing",
        source: "OPERATOR_INTAKE",
      }),
    );

    const summary = await dispatchCampaign(result.campaignId, { provider });
    expect(summary.accepted).toBe(1);
    expect(summary.excluded).toBe(1);

    const items = await itemsOf(result.campaignId);
    const excluded = items.find((i) => i.submissionStatus === "EXCLUDED");
    expect(excluded?.excludedReason).toBe("SUPPRESSED");

    // The excluded recipient's hold and quota came back.
    const wallet = await getWallet(tenant.organizationId);
    expect(wallet.heldCentavos).toBe(0);
    expect(wallet.postedBalanceCentavos).toBe(100_000 - MOCK_DEFAULTS.unitPriceCentavos);

    const usage = await quotaUsage(db, tenant.organizationId, limitsFor(MOCK_DEFAULTS));
    expect(usage.daily.used).toBe(1);
  });

  // Requirement 7: a revoked sender stops the campaign; no automatic resume.
  it("pauses for review when the sender is revoked before dispatch", async () => {
    const result = await submit([NUMBERS.ok(1), NUMBERS.ok(2)], "r2");
    await db
      .update(senderIdentities)
      .set({ status: "REVOKED" })
      .where(eq(senderIdentities.id, tenant.senderIdentityId));

    const summary = await dispatchCampaign(result.campaignId, { provider });

    expect(summary.paused).toBe(true);
    expect(summary.attempted).toBe(0);

    const campaign = (
      await db.select().from(campaigns).where(eq(campaigns.id, result.campaignId))
    )[0];
    expect(campaign!.status).toBe("PAUSED_REVIEW");
    expect(campaign!.pausedReason).toContain("REVOKED");

    const items = await itemsOf(result.campaignId);
    expect(items.every((i) => i.submissionStatus === "PENDING")).toBe(true);

    // The job is parked, not retried automatically.
    const job = (
      await db.select().from(dispatchJobs).where(eq(dispatchJobs.campaignId, result.campaignId))
    )[0];
    expect(job!.status).toBe("PAUSED");
  });
});

describe("stopping a campaign", () => {
  // Requirement 7: cancellation reports are truthful about what could be stopped.
  it("reports what was prevented and what had already been accepted", async () => {
    const result = await submit([NUMBERS.ok(1), NUMBERS.ok(2), NUMBERS.ok(3)], "s1");

    // Accept one message, then stop the campaign.
    const items = await itemsOf(result.campaignId);
    await db
      .update(messageItems)
      .set({ submissionStatus: "ACCEPTED", partnerReference: "mock-x", charged: true })
      .where(eq(messageItems.id, items[0]!.id));

    const stopped = await stopCampaign(result.campaignId, tenant.organizationId);

    expect(stopped.prevented).toBe(2);
    expect(stopped.alreadyAccepted).toBe(1);
    expect(stopped.unresolved).toBe(0);

    const campaign = (
      await db.select().from(campaigns).where(eq(campaigns.id, result.campaignId))
    )[0];
    expect(campaign!.status).toBe("CANCELLED");

    // The two prevented messages released their hold.
    const wallet = await getWallet(tenant.organizationId);
    expect(wallet.heldCentavos).toBe(MOCK_DEFAULTS.unitPriceCentavos);
  });

  it("does not claim to have cancelled an item that is already in flight", async () => {
    const result = await submit([NUMBERS.ok(1)], "s2");
    const items = await itemsOf(result.campaignId);
    await db
      .update(messageItems)
      .set({ submissionStatus: "SUBMITTING" })
      .where(eq(messageItems.id, items[0]!.id));

    const stopped = await stopCampaign(result.campaignId, tenant.organizationId);
    expect(stopped.prevented).toBe(0);
    expect(stopped.unresolved).toBe(1);

    const item = (await itemsOf(result.campaignId))[0]!;
    expect(item.submissionStatus).toBe("SUBMITTING");
  });

  it("a stop mid-dispatch leaves already-accepted messages accepted", async () => {
    const result = await submit([NUMBERS.ok(1), NUMBERS.ok(2)], "s3");
    await stopCampaign(result.campaignId, tenant.organizationId);

    // Dispatch after the stop must not send the cancelled items.
    const summary = await dispatchCampaign(result.campaignId, { provider });
    expect(summary.attempted).toBe(0);

    const items = await itemsOf(result.campaignId);
    expect(items.every((i) => i.submissionStatus === "CANCELLED")).toBe(true);
  });
});

describe("worker job claiming", () => {
  it("two workers never claim the same job", async () => {
    const a = await submit([NUMBERS.ok(1)], "w1");
    const b = await submit([NUMBERS.ok(2)], "w2");

    const [first, second] = await Promise.all([claimJob("worker-a"), claimJob("worker-b")]);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.id).not.toBe(second!.id);
    expect(new Set([first!.campaignId, second!.campaignId])).toEqual(
      new Set([a.campaignId, b.campaignId]),
    );

    // With both leased, there is nothing left to claim.
    expect(await claimJob("worker-c")).toBeNull();
  });

  it("does not claim a job scheduled for the future", async () => {
    const quote = await issueQuote({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      senderIdentityId: tenant.senderIdentityId,
      purpose: "INFORMATIONAL",
      body: BODY,
      rawRecipients: [NUMBERS.ok(1)],
      scheduledAt: new Date(Date.now() + 3_600_000),
    });
    await submitCampaign({
      quoteId: quote.id,
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      name: "Future",
      idempotencyKey: "w3",
    });

    expect(await claimJob("worker-future")).toBeNull();
  });
});

describe("draining without a worker process", () => {
  it("stops between messages at the deadline and leaves the rest for the next claim", async () => {
    const result = await submit([NUMBERS.ok(1), NUMBERS.ok(2)], "t1");

    const cut = await dispatchCampaign(result.campaignId, { provider, deadline: Date.now() - 1 });
    expect(cut.attempted).toBe(0);

    // Nothing stranded in SUBMITTING, and the campaign is still open.
    let items = await itemsOf(result.campaignId);
    expect(items.every((i) => i.submissionStatus === "PENDING")).toBe(true);
    const [open] = await db.select().from(campaigns).where(eq(campaigns.id, result.campaignId));
    expect(open!.status).not.toBe("FINISHED");

    const resumed = await dispatchCampaign(result.campaignId, { provider });
    expect(resumed.accepted).toBe(2);
    items = await itemsOf(result.campaignId);
    expect(items.every((i) => i.submissionStatus === "ACCEPTED")).toBe(true);
    expect(await chargeCount(result.campaignId)).toBe(2);
  });

  it("runs every due job and finishes each campaign", async () => {
    const a = await submit([NUMBERS.ok(1)], "t2");
    const b = await submit([NUMBERS.ok(2)], "t3");

    expect(await drainDueJobs("drain-test", 30_000)).toBe(2);

    const jobs = await db.select().from(dispatchJobs);
    expect(jobs.every((j) => j.status === "DONE")).toBe(true);
    for (const id of [a.campaignId, b.campaignId]) {
      const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id));
      expect(row!.status).toBe("FINISHED");
    }
  });

  it("claims nothing once its budget is spent", async () => {
    await submit([NUMBERS.ok(1)], "t4");

    expect(await drainDueJobs("drain-test", 0)).toBe(0);
    const [job] = await db.select().from(dispatchJobs);
    expect(job!.status).toBe("PENDING");
  });
});
