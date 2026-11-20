import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db, resetDb } from "@/test/db";
import { createTenant, NUMBERS, type Tenant } from "@/test/fixtures";
import { campaigns, memberships, messageItems, users } from "@/server/db/schema";
import { MockSmsProvider } from "@/server/providers/sms";
import { numberHash } from "@/server/security/crypto";
import {
  confirmMobileVerification,
  startMobileVerification,
} from "./mobile-verification";
import { listTestRecipients, sendTest, TestSendError } from "./test-send";
import { getWallet } from "./wallet";
import { exportCampaignReport } from "./exports";
import { dateToPlatformWallTime, formatDateTime } from "@/i18n/format";
import { enServerText } from "@/i18n/locales/en-server-text";

/**
 * MSG-04. A test send is a real send, so the questions that matter are where it
 * is allowed to go and whether it is charged like anything else.
 */

const provider = new MockSmsProvider();
let tenant: Tenant;

async function verifyMobile(userId: string, number: string) {
  const { demoCode } = await startMobileVerification({
    userId,
    rawNumber: number,
    provider,
    exposeDemoCode: true,
  });
  await confirmMobileVerification({ userId, code: demoCode! });
}

beforeEach(async () => {
  await resetDb();
  tenant = await createTenant({ fundingCentavos: 500_00 });
});
afterAll(closeDb);

describe("sendTest", () => {
  it("refuses until the sender has verified a number", async () => {
    await expect(
      sendTest({
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        senderIdentityId: tenant.senderIdentityId,
        body: "Hello from the test send.",
        purpose: "INFORMATIONAL",
        idempotencyKey: "test-key-0001",
      }),
    ).rejects.toMatchObject({ code: "NOT_VERIFIED" });
  });

  it("sends to the verified number and charges for it", async () => {
    await verifyMobile(tenant.userId, NUMBERS.ok(7));
    const before = await getWallet(tenant.organizationId);

    const result = await sendTest({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      senderIdentityId: tenant.senderIdentityId,
      body: "Hello from the test send.",
      purpose: "INFORMATIONAL",
      idempotencyKey: "test-key-0002",
    });

    const [item] = await db
      .select()
      .from(messageItems)
      .where(eq(messageItems.campaignId, result.campaignId));

    expect(item!.numberHash).toBe(numberHash(NUMBERS.ok(7)));
    expect(result.costCentavos).toBeGreaterThan(0);

    // A test costs money like anything else: the funds are held, not free.
    const after = await getWallet(tenant.organizationId);
    expect(after.availableCentavos).toBe(before.availableCentavos - result.costCentavos);
  });

  it("fills a personalized test from the receiving member's own details", async () => {
    await verifyMobile(tenant.userId, NUMBERS.ok(21));

    const result = await sendTest({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      senderIdentityId: tenant.senderIdentityId,
      body: "Hello {{first_name}} {{last_name}}, your order is ready.",
      purpose: "INFORMATIONAL",
      idempotencyKey: "test-key-0021",
    });

    // The member is not a saved contact; their profile name ("Test User") stands in.
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, result.campaignId));
    expect(campaign!.body).toBe("Hello Test User, your order is ready.");
  });

  it("refuses a personalized test that needs a custom field the member has not saved", async () => {
    await verifyMobile(tenant.userId, NUMBERS.ok(22));

    await expect(
      sendTest({
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        senderIdentityId: tenant.senderIdentityId,
        body: "Your table is booked for {{custom_1}}.",
        purpose: "INFORMATIONAL",
        idempotencyKey: "test-key-0022",
      }),
    ).rejects.toMatchObject({ code: "REFUSED", message: enServerText.testPersonalizationMissing });
  });

  it("marks the campaign as a test", async () => {
    await verifyMobile(tenant.userId, NUMBERS.ok(8));

    const result = await sendTest({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      senderIdentityId: tenant.senderIdentityId,
      body: "Marked as a test.",
      purpose: "INFORMATIONAL",
      idempotencyKey: "test-key-0003",
    });

    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, result.campaignId));
    expect(campaign!.isTestSend).toBe(true);
  });

  it("records its name, and names its download, in Manila time", async () => {
    await verifyMobile(tenant.userId, NUMBERS.ok(20));

    const before = new Date();
    const result = await sendTest({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      senderIdentityId: tenant.senderIdentityId,
      body: "Named in Manila time.",
      purpose: "INFORMATIONAL",
      idempotencyKey: "test-key-0020",
    });
    const file = await exportCampaignReport({
      campaignId: result.campaignId,
      organizationId: tenant.organizationId,
      actorUserId: tenant.userId,
      scope: "MASKED",
    });
    const after = new Date();

    // Pages write a test send's name themselves (campaignName); the stored one
    // is a record. It used to give the time in UTC, eight hours behind Manila.
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, result.campaignId));
    const named = (at: Date) => `Test send — ${formatDateTime(at, "en")}`;
    expect([named(before), named(after)]).toContain(campaign!.name);

    const minute = (at: Date) => dateToPlatformWallTime(at).slice(0, 16).replace(/[:T]/g, "-");
    const stamp = /^campaign-test-send-(\d{4}-\d{2}-\d{2}-\d{2}-\d{2})-\d{2}\.csv$/.exec(file!.filename);
    expect(stamp, file!.filename).not.toBeNull();
    expect([minute(before), minute(after)]).toContain(stamp![1]);

    // One recipient, shown masked.
    const lines = file!.content.trim().split(/\r?\n/);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("phone_number_masked");
    expect(lines[1]).toContain(result.mask);
    expect(file!.content).not.toContain(NUMBERS.ok(20).slice(1));
  });

  it("will not send to a number outside the organization", async () => {
    const outsider = await createTenant();
    await verifyMobile(outsider.userId, NUMBERS.ok(9));

    // The recipient id arrives from the browser, so membership is the check
    // that stops a test being aimed at anyone at all.
    await expect(
      sendTest({
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        recipientUserId: outsider.userId,
        senderIdentityId: tenant.senderIdentityId,
        body: "Should never arrive.",
        purpose: "INFORMATIONAL",
        idempotencyKey: "test-key-0004",
      }),
    ).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
  });

  it("reaches a colleague who has verified their own number", async () => {
    await verifyMobile(tenant.userId, NUMBERS.ok(10));

    const [colleague] = await db
      .insert(users)
      .values({
        email: `colleague-${Date.now()}@test.invalid`,
        passwordHash: "x",
        fullName: "Colleague",
        emailVerifiedAt: new Date(),
      })
      .returning({ id: users.id });
    await db.insert(memberships).values({
      organizationId: tenant.organizationId,
      userId: colleague!.id,
      role: "SENDER",
    });
    await verifyMobile(colleague!.id, NUMBERS.ok(11));

    const result = await sendTest({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      recipientUserId: colleague!.id,
      senderIdentityId: tenant.senderIdentityId,
      body: "Does this look right to you?",
      purpose: "INFORMATIONAL",
      idempotencyKey: "test-key-0005",
    });

    const [item] = await db
      .select()
      .from(messageItems)
      .where(eq(messageItems.campaignId, result.campaignId));
    expect(item!.numberHash).toBe(numberHash(NUMBERS.ok(11)));
  });

  it("still refuses content that is blocked outright", async () => {
    await verifyMobile(tenant.userId, NUMBERS.ok(12));

    await expect(
      sendTest({
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        senderIdentityId: tenant.senderIdentityId,
        body: "Please send your OTP and password to claim your prize.",
        purpose: "INFORMATIONAL",
        idempotencyKey: "test-key-0006",
      }),
    ).rejects.toBeInstanceOf(TestSendError);
  });

  it("does not hold a review-flagged test for an approver", async () => {
    await verifyMobile(tenant.userId, NUMBERS.ok(13));

    // The sender needs to see this message on their own handset in order to
    // fix it; holding it would make that impossible. The real campaign is
    // still held — see DECISIONS.md.
    const result = await sendTest({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      senderIdentityId: tenant.senderIdentityId,
      body: "Act now! This loan offer expires today.",
      purpose: "INFORMATIONAL",
      idempotencyKey: "test-key-0007",
    });

    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, result.campaignId));
    expect(campaign!.status).not.toBe("PENDING_APPROVAL");
  });

  it("is idempotent, so a double click sends once", async () => {
    await verifyMobile(tenant.userId, NUMBERS.ok(14));

    const args = {
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      senderIdentityId: tenant.senderIdentityId,
      body: "Only once.",
      purpose: "INFORMATIONAL" as const,
      idempotencyKey: "test-key-0008",
    };

    const first = await sendTest(args);
    const second = await sendTest(args);

    expect(second.campaignId).toBe(first.campaignId);
  });
});

describe("listTestRecipients", () => {
  it("lists only members who have verified a number, sender first", async () => {
    const [colleague] = await db
      .insert(users)
      .values({
        email: `unverified-${Date.now()}@test.invalid`,
        passwordHash: "x",
        fullName: "Unverified Colleague",
        emailVerifiedAt: new Date(),
      })
      .returning({ id: users.id });
    await db.insert(memberships).values({
      organizationId: tenant.organizationId,
      userId: colleague!.id,
      role: "SENDER",
    });

    await verifyMobile(tenant.userId, NUMBERS.ok(15));

    const list = await listTestRecipients({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
    });

    expect(list).toHaveLength(1);
    expect(list[0]!.isSelf).toBe(true);
    // Only the mask leaves the server.
    expect(list[0]!.mask).not.toContain(NUMBERS.ok(15));
  });

  it("does not list members of another organization", async () => {
    const other = await createTenant();
    await verifyMobile(other.userId, NUMBERS.ok(16));

    const list = await listTestRecipients({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
    });
    expect(list).toHaveLength(0);
  });
});
