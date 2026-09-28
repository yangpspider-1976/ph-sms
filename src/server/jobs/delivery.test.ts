import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { closeDb, db, resetDb } from "@/test/db";
import { createTenant, NUMBERS, type Tenant } from "@/test/fixtures";
import { messageItems, providerEvents } from "@/server/db/schema";
import { issueQuote } from "@/server/domain/quote";
import { submitCampaign } from "@/server/domain/submit";
import { MockSmsProvider } from "@/server/providers/sms";
import { dispatchCampaign } from "./dispatch";
import { ingestDeliveryEvent, retryQuarantined } from "./delivery";

/**
 * Requirement 10: delivery receipts arriving early, twice, unsigned, out of
 * order or for an unknown reference.
 */

const BODY = "Your order is ready for pickup until 8pm today.";
const SECRET = "mock-webhook-secret";

const sign = (body: string) => createHash("sha256").update(`${SECRET}:${body}`).digest("hex");

function callback(payload: Record<string, unknown>, opts: { signed?: boolean } = {}) {
  const body = JSON.stringify(payload);
  return {
    body,
    headers: { "x-mock-signature": opts.signed === false ? "deadbeef" : sign(body) },
  };
}

let tenant: Tenant;
let provider: MockSmsProvider;
let campaignId: string;

async function itemsOf() {
  return db.select().from(messageItems).where(eq(messageItems.campaignId, campaignId));
}

beforeEach(async () => {
  await resetDb();
  tenant = await createTenant();
  provider = new MockSmsProvider();

  const quote = await issueQuote({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    senderIdentityId: tenant.senderIdentityId,
    purpose: "INFORMATIONAL",
    body: BODY,
    rawRecipients: [NUMBERS.ok(1), NUMBERS.ok(2)],
  });
  const submitted = await submitCampaign({
    quoteId: quote.id,
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    name: "Delivery test",
    idempotencyKey: `dlr-${Date.now()}`,
  });
  campaignId = submitted.campaignId;
  await dispatchCampaign(campaignId, { provider });
});
afterAll(closeDb);

describe("authentication", () => {
  it("refuses an event whose signature does not verify", async () => {
    const items = await itemsOf();
    const { body, headers } = callback(
      { eventId: "evt-forged", reference: items[0]!.partnerReference, status: "DELIVERED" },
      { signed: false },
    );

    const outcome = await ingestDeliveryEvent(body, headers, provider);
    expect(outcome.status).toBe("REJECTED");

    // Nothing unverified is stored, and nothing is marked delivered.
    expect(await db.select().from(providerEvents)).toHaveLength(0);
    const after = await itemsOf();
    expect(after.every((i) => i.deliveryStatus === "PENDING")).toBe(true);
  });

  it("refuses a malformed payload", async () => {
    const body = "not json";
    const outcome = await ingestDeliveryEvent(
      body,
      { "x-mock-signature": sign(body) },
      provider,
    );
    expect(outcome.status).toBe("REJECTED");
  });
});

describe("applying receipts", () => {
  it("records a delivery only from a verified event", async () => {
    const items = await itemsOf();
    const { body, headers } = callback({
      eventId: "evt-1",
      reference: items[0]!.partnerReference,
      status: "DELIVERED",
      occurredAt: new Date().toISOString(),
    });

    const outcome = await ingestDeliveryEvent(body, headers, provider);
    expect(outcome.status).toBe("APPLIED");

    const updated = (await itemsOf()).find((i) => i.id === items[0]!.id)!;
    expect(updated.deliveryStatus).toBe("DELIVERED");
    expect(updated.deliveredAt).not.toBeNull();
    // Submission state is untouched by a delivery receipt.
    expect(updated.submissionStatus).toBe("ACCEPTED");
  });

  it("records a non-delivery without inventing a success", async () => {
    const items = await itemsOf();
    const { body, headers } = callback({
      eventId: "evt-2",
      reference: items[0]!.partnerReference,
      status: "UNDELIVERED",
      code: "ABSENT_SUBSCRIBER",
    });

    await ingestDeliveryEvent(body, headers, provider);
    const updated = (await itemsOf()).find((i) => i.id === items[0]!.id)!;
    expect(updated.deliveryStatus).toBe("UNDELIVERED");
    expect(updated.deliveredAt).toBeNull();
  });

  it("stores the verified event before acknowledging it", async () => {
    const items = await itemsOf();
    const { body, headers } = callback({
      eventId: "evt-3",
      reference: items[0]!.partnerReference,
      status: "DELIVERED",
    });
    await ingestDeliveryEvent(body, headers, provider);

    const stored = await db
      .select()
      .from(providerEvents)
      .where(eq(providerEvents.externalEventId, "evt-3"));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.signatureValid).toBe(true);
    expect(stored[0]!.processedAt).not.toBeNull();
    expect(stored[0]!.messageItemId).toBe(items[0]!.id);
  });
});

describe("duplicates and ordering", () => {
  it("a replayed event is a no-op", async () => {
    const items = await itemsOf();
    const { body, headers } = callback({
      eventId: "evt-dup",
      reference: items[0]!.partnerReference,
      status: "DELIVERED",
    });

    expect((await ingestDeliveryEvent(body, headers, provider)).status).toBe("APPLIED");
    expect((await ingestDeliveryEvent(body, headers, provider)).status).toBe("DUPLICATE");
    expect((await ingestDeliveryEvent(body, headers, provider)).status).toBe("DUPLICATE");

    const stored = await db
      .select()
      .from(providerEvents)
      .where(eq(providerEvents.externalEventId, "evt-dup"));
    expect(stored).toHaveLength(1);
  });

  // Requirement 10: DELIVERED never regresses to PENDING.
  it("a late PENDING event cannot undo a recorded delivery", async () => {
    const items = await itemsOf();
    const reference = items[0]!.partnerReference;

    const delivered = callback({ eventId: "evt-d2", reference, status: "DELIVERED" });
    await ingestDeliveryEvent(delivered.body, delivered.headers, provider);

    const late = callback({ eventId: "evt-late", reference, status: "PENDING" });
    const outcome = await ingestDeliveryEvent(late.body, late.headers, provider);
    expect(outcome.status).toBe("IGNORED_STALE");

    const updated = (await itemsOf()).find((i) => i.id === items[0]!.id)!;
    expect(updated.deliveryStatus).toBe("DELIVERED");
  });

  it("two conflicting terminal results are flagged rather than overwritten", async () => {
    const items = await itemsOf();
    const reference = items[0]!.partnerReference;

    const first = callback({ eventId: "evt-t1", reference, status: "DELIVERED" });
    await ingestDeliveryEvent(first.body, first.headers, provider);

    const second = callback({ eventId: "evt-t2", reference, status: "UNDELIVERED" });
    const outcome = await ingestDeliveryEvent(second.body, second.headers, provider);
    expect(outcome.status).toBe("CONFLICT");

    // The first result stands; the contradiction is quarantined for review.
    const updated = (await itemsOf()).find((i) => i.id === items[0]!.id)!;
    expect(updated.deliveryStatus).toBe("DELIVERED");

    const flagged = await db
      .select()
      .from(providerEvents)
      .where(eq(providerEvents.externalEventId, "evt-t2"));
    expect(flagged[0]!.quarantined).toBe(true);
    expect(flagged[0]!.outcome).toBe("CONFLICTING_TERMINAL");
  });
});

describe("unknown references", () => {
  it("quarantines an event that matches no message", async () => {
    const { body, headers } = callback({
      eventId: "evt-orphan",
      reference: "mock-nothing-matches",
      status: "DELIVERED",
    });

    const outcome = await ingestDeliveryEvent(body, headers, provider);
    expect(outcome.status).toBe("QUARANTINED");

    const stored = await db
      .select()
      .from(providerEvents)
      .where(eq(providerEvents.externalEventId, "evt-orphan"));
    expect(stored[0]!.quarantined).toBe(true);
    expect(stored[0]!.messageItemId).toBeNull();
  });

  // Requirement 10: a receipt can arrive before the submit response was stored.
  it("resolves a receipt that arrived before the provider reference was saved", async () => {
    const items = await itemsOf();
    const target = items[0]!;

    // Simulate the race: the reference has not been written yet.
    await db
      .update(messageItems)
      .set({ partnerReference: null })
      .where(eq(messageItems.id, target.id));

    // The callback names our stable key, which exists from submission time.
    const early = callback({
      eventId: "evt-early",
      reference: target.stableKey,
      status: "DELIVERED",
    });
    const outcome = await ingestDeliveryEvent(early.body, early.headers, provider);
    expect(outcome.status).toBe("APPLIED");

    const updated = (await itemsOf()).find((i) => i.id === target.id)!;
    expect(updated.deliveryStatus).toBe("DELIVERED");
  });

  it("retries quarantined events once the message can be matched", async () => {
    const items = await itemsOf();
    const target = items[0]!;
    const reference = target.partnerReference!;

    await db
      .update(messageItems)
      .set({ partnerReference: "temporarily-different" })
      .where(eq(messageItems.id, target.id));

    const { body, headers } = callback({
      eventId: "evt-retry",
      reference,
      status: "DELIVERED",
    });
    expect((await ingestDeliveryEvent(body, headers, provider)).status).toBe("QUARANTINED");

    // The reference is written, and the sweep picks the event back up.
    await db
      .update(messageItems)
      .set({ partnerReference: reference })
      .where(eq(messageItems.id, target.id));

    expect(await retryQuarantined(provider)).toBe(1);

    const updated = (await itemsOf()).find((i) => i.id === target.id)!;
    expect(updated.deliveryStatus).toBe("DELIVERED");

    const event = await db
      .select()
      .from(providerEvents)
      .where(eq(providerEvents.externalEventId, "evt-retry"));
    expect(event[0]!.quarantined).toBe(false);
  });
});

describe("tenant safety", () => {
  it("the organization comes from our records, not from the payload", async () => {
    const other = await createTenant();
    const items = await itemsOf();

    // The payload claims another tenant; it changes nothing.
    const { body, headers } = callback({
      eventId: "evt-claim",
      reference: items[0]!.partnerReference,
      status: "DELIVERED",
      organizationId: other.organizationId,
      tenant: other.organizationId,
    });

    await ingestDeliveryEvent(body, headers, provider);

    const updated = (await itemsOf()).find((i) => i.id === items[0]!.id)!;
    expect(updated.deliveryStatus).toBe("DELIVERED");
    // Still owned by the original tenant.
    expect(updated.organizationId).toBe(tenant.organizationId);

    const otherItems = await db
      .select()
      .from(messageItems)
      .where(eq(messageItems.organizationId, other.organizationId));
    expect(otherItems).toHaveLength(0);
  });
});
