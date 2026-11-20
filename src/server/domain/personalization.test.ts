import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db, resetDb } from "@/test/db";
import { createTenant, NUMBERS, type Tenant } from "@/test/fixtures";
import { contacts, messageItems, quotes } from "@/server/db/schema";
import { encrypt, decrypt, numberHash } from "@/server/security/crypto";
import { maskNormalized } from "./phone";
import { issueQuote, samplesForReview } from "./quote";
import { submitCampaign } from "./submit";
import { getWallet } from "./wallet";
import { addSuppression } from "./suppression";
import { dispatchCampaign } from "@/server/jobs/dispatch";
import { runRetention } from "@/server/jobs/retention";
import { MockSmsProvider } from "@/server/providers/sms";
import { MOCK_DEFAULTS } from "@/server/config";
import { personalizeMessage } from "./personalization";
import { setPromotionalSelfService } from "./app-config";

let tenant: Tenant;
beforeEach(async () => { await resetDb(); tenant = await createTenant(); });
afterAll(closeDb);

async function contact(number: string, firstName: string, organizationId = tenant.organizationId) {
  await db.insert(contacts).values({
    organizationId, numberHash: numberHash(number), numberEncrypted: encrypt(number),
    numberMasked: maskNormalized(number), firstName, lastName: "Reyes",
    custom: { custom_1: "Tuesday" }, consentSource: "Marketing signup form",
  });
}
async function quote(body: string, numbers = [NUMBERS.ok(1)], purpose: "INFORMATIONAL" | "PROMOTIONAL" = "INFORMATIONAL") {
  return issueQuote({ ...tenant, senderIdentityId: tenant.senderIdentityId, rawRecipients: numbers, body, purpose });
}
async function submit(quoteId: string) {
  return submitCampaign({ ...tenant, quoteId, name: "Personalized campaign", idempotencyKey: `personalized:${quoteId}` });
}

describe("personalized sending", () => {
  it("treats contact values as literal text and supports all named fields", () => {
    expect(personalizeMessage("Hi {{ first_name }} {{last_name}}: {{custom_5}}", {
      first_name: "$&", last_name: "Reyes", custom_5: "Tuesday",
    })).toBe("Hi $& Reyes: Tuesday");
    expect(() => personalizeMessage("Hi {{first_name}}", { first_name: "{{last_name}}" })).toThrow();
  });

  it("prices rendered encoding and segment lengths, freezes names and dispatches the reviewed bodies", async () => {
    await contact(NUMBERS.ok(1), "Ana");
    await contact(NUMBERS.ok(2), "가".repeat(75));
    const offer = await quote("Hi {{first_name}}", [NUMBERS.ok(1), NUMBERS.ok(2)]);
    expect(offer.messages.map((message) => message.segments)).toEqual([1, 2]);
    expect(offer.segmentTotal).toBe(3);
    expect(offer.maxAuthorizedCostCentavos).toBe(3 * MOCK_DEFAULTS.unitPriceCentavos);
    await db.update(contacts).set({ firstName: "Changed after review" });
    const campaign = await submit(offer.id);
    const items = await db.select().from(messageItems).where(eq(messageItems.campaignId, campaign.campaignId));
    expect(items.map((item) => decrypt(item.bodyEncrypted!)).sort()).toEqual(offer.messages.map((message) => message.body).sort());
    const provider = new MockSmsProvider();
    const calls = vi.spyOn(provider, "submitMessage");
    await dispatchCampaign(campaign.campaignId, { provider });
    expect(calls.mock.calls.map(([input]) => input.content).sort()).toEqual(offer.messages.map((message) => message.body).sort());
    expect((await getWallet(tenant.organizationId)).postedBalanceCentavos).toBe(100_000 - offer.maxAuthorizedCostCentavos);
  });

  it("does not fill fields from another tenant's contact record", async () => {
    const other = await createTenant();
    await contact(NUMBERS.ok(1), "Other tenant", other.organizationId);
    await expect(quote("Hi {{first_name}}")).rejects.toMatchObject({ code: "MESSAGE_INVALID" });
  });

  it("applies content checks and segment limits after inserting contact data", async () => {
    await contact(NUMBERS.ok(1), "Please send your password");
    await expect(quote("Hi {{first_name}}")).rejects.toMatchObject({ code: "CONTENT_BLOCKED" });
    await db.update(contacts).set({ firstName: "가".repeat(500) });
    await expect(quote("Hi {{first_name}}")).rejects.toMatchObject({ code: "MESSAGE_INVALID" });
  });

  it("drops opted-out recipients at confirmation using their actual individual cost", async () => {
    await contact(NUMBERS.ok(1), "Ana");
    await contact(NUMBERS.ok(2), "가".repeat(75));
    const offer = await quote("Hi {{first_name}}", [NUMBERS.ok(1), NUMBERS.ok(2)]);
    await db.transaction((tx) => addSuppression(tx, { normalized: NUMBERS.ok(2), organizationId: tenant.organizationId,
      scope: "ORGANIZATION", reason: "Stop", source: "OPERATOR_INTAKE" }));
    const campaign = await submit(offer.id);
    expect(campaign.reservedCentavos).toBe(MOCK_DEFAULTS.unitPriceCentavos);
    expect(campaign.includedCount).toBe(1);
  });

  it("refuses a changed or removed priced message snapshot", async () => {
    await contact(NUMBERS.ok(1), "Ana");
    const offer = await quote("Hi {{first_name}}");
    await db.update(quotes).set({ messageSnapshot: encrypt(JSON.stringify([{ ...offer.messages[0], body: "Changed" }])) }).where(eq(quotes.id, offer.id));
    await expect(submit(offer.id)).rejects.toMatchObject({ code: "QUOTE_INVALID" });
    await db.update(quotes).set({ messageSnapshot: null, messageSnapshotHash: null }).where(eq(quotes.id, offer.id));
    await expect(submit(offer.id)).rejects.toMatchObject({ code: "QUOTE_INVALID" });
  });

  it("redacts rendered messages and priced copies with message-detail retention", async () => {
    await contact(NUMBERS.ok(1), "Ana");
    const offer = await quote("Hi {{first_name}}");
    const campaign = await submit(offer.id);
    await dispatchCampaign(campaign.campaignId, { provider: new MockSmsProvider() });
    await runRetention(MOCK_DEFAULTS, new Date(Date.now() + (MOCK_DEFAULTS.messageDetailRetentionDays + 1) * 86_400_000));
    expect((await db.select().from(quotes).where(eq(quotes.id, offer.id)))[0]?.messageSnapshot).toBeNull();
    expect((await db.select().from(messageItems).where(eq(messageItems.campaignId, campaign.campaignId)))[0]?.bodyEncrypted).toBeNull();
  });
});

describe("the review's samples (MSG-03)", () => {
  const message = (number: string, body: string, segments: number) =>
    ({ number, body, segments, encoding: "GSM7" as const });

  it("shows the longest message even when it is not among the first", () => {
    const messages = [
      message("+639170000001", "Hi Ana", 1),
      message("+639170000002", "Hi Ben", 1),
      message("+639170000003", "Hi Cy", 1),
      message("+639170000004", "Hi Di", 1),
      message("+639170000005", "Hi Ed", 1),
      message("+639170000006", "Hi Maximiliano", 2),
    ];
    const samples = samplesForReview(messages);
    expect(samples.map((s) => s.number)).toEqual([
      "+639170000001",
      "+639170000002",
      "+639170000003",
      "+639170000004",
      "+639170000006",
    ]);
    expect(samples.filter((s) => s.longest).map((s) => s.body)).toEqual(["Hi Maximiliano"]);
  });

  it("marks the longest within the first few, and nothing for a single message", () => {
    const samples = samplesForReview([message("+639170000001", "Hello there", 1), message("+639170000002", "Hi", 1)]);
    expect(samples.map((s) => s.longest)).toEqual([true, false]);
    expect(samplesForReview([message("+639170000001", "Hi", 1)])[0]!.longest).toBe(false);
  });
});

describe("promotional self-service", () => {
  // Off by default: promotions go through the bulk quote until an admin allows them.
  beforeEach(async () => {
    await setPromotionalSelfService({ enabled: true, actorUserId: tenant.userId });
  });

  it("refuses at confirmation when an admin switches it off after the quote", async () => {
    await contact(NUMBERS.ok(1), "Ana");
    const offer = await quote("Our new collection is available in store.", undefined, "PROMOTIONAL");
    await setPromotionalSelfService({ enabled: false, actorUserId: tenant.userId });
    await expect(submit(offer.id)).rejects.toMatchObject({ code: "QUOTE_INVALID" });
    await expect(
      quote("Our new collection is available in store.", undefined, "PROMOTIONAL"),
    ).rejects.toMatchObject({ code: "PROMOTIONAL_INQUIRY_ONLY" });
  });

  it("accepts consented contacts and refuses withdrawn consent at confirmation", async () => {
    await contact(NUMBERS.ok(1), "Ana");
    const offer = await quote("Our new collection is available in store.", undefined, "PROMOTIONAL");
    expect(offer.recipientCount).toBe(1);
    await db.update(contacts).set({ consentSource: null });
    await expect(submit(offer.id)).rejects.toMatchObject({ code: "QUOTE_INVALID" });
  });

  it("excludes withdrawn consent at dispatch without charging", async () => {
    await contact(NUMBERS.ok(1), "Ana");
    const offer = await quote("Our new collection is available in store.", undefined, "PROMOTIONAL");
    const campaign = await submit(offer.id);
    await db.update(contacts).set({ consentSource: null });
    const provider = new MockSmsProvider();
    const calls = vi.spyOn(provider, "submitMessage");
    const result = await dispatchCampaign(campaign.campaignId, { provider });
    expect(result.excluded).toBe(1);
    expect(calls).not.toHaveBeenCalled();
    expect((await getWallet(tenant.organizationId)).heldCentavos).toBe(0);
    expect((await getWallet(tenant.organizationId)).postedBalanceCentavos).toBe(100_000);
  });
});
