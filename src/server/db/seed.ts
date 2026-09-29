/**
 * Deterministic demo fixtures.
 *
 * Every number here is synthetic. Nothing in this file is a real business, a
 * real person or a reachable handset, and the seeded logins exist only outside
 * LIVE mode.
 */

import "@/server/load-env";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db, client } from "./index";
import {
  campaigns,
  contacts,
  inquiries,
  memberships,
  messageItems,
  organizations,
  quotaBuckets,
  senderIdentities,
  suppressions,
  templates,
  users,
  wallets,
  ledgerEntries,
  auditEvents,
} from "./schema";
import { MOCK_DEFAULTS, manilaDayKey, manilaMonthKey } from "@/server/config";
import { encrypt, numberHash } from "@/server/security/crypto";
import { analyzeMessage } from "@/server/domain/segments";
import { maskNormalized } from "@/server/domain/phone";
import { sha256 } from "@/server/security/crypto";

const PASSWORD = "DemoPass123!";

/** Synthetic numbers only — the 0917-000-xxxx block used for fixtures. */
function demoNumber(index: number): string {
  return `+639170${String(index).padStart(6, "0")}`;
}

function numberFields(normalized: string) {
  return {
    numberHash: numberHash(normalized),
    numberEncrypted: encrypt(normalized),
    numberMasked: maskNormalized(normalized),
  };
}

async function main() {
  console.log("seeding…");
  const hash = await bcrypt.hash(PASSWORD, 10);

  // One truncate rather than a hand-maintained delete order: new tables get
  // added over time and a stale order fails on a foreign key.
  await db.execute(
    sql.raw(
      `truncate table ${[
        "audit_events",
        "dispatch_attempts",
        "dispatch_jobs",
        "provider_events",
        "payment_events",
        "payments",
        "quota_reservations",
        "quota_buckets",
        "ledger_entries",
        "reservations",
        "wallets",
        "message_items",
        "campaigns",
        "quotes",
        "templates",
        "import_rows",
        "imports",
        "suppressions",
        "contacts",
        "sender_identities",
        "notifications",
        "mail_sink",
        "inquiries",
        "idempotency_keys",
        // Otherwise a reseed keeps old counters, and a few browser-suite runs in
        // an hour use up the signup limit and lock the next run out.
        "rate_limit_hits",
        "verification_tokens",
        "sessions",
        "memberships",
        "users",
        "organizations",
      ].join(", ")} restart identity cascade`,
    ),
  );

  /* --- Organizations ---------------------------------------------------- */

  const [demoBusiness] = await db
    .insert(organizations)
    .values({
      name: "Demo Business",
      status: "ACTIVE",
      registrationId: "DEMO-0000-0001",
      address: "Unit 10, Sample Building, Makati City",
      industry: "Retail",
      websiteUrl: "https://example.test",
      contactName: "Demo Owner",
      contactPhone: "+63 2 8000 0000",
      intendedUsage: "Order and reservation updates to our own customers.",
      statusChangedAt: new Date(),
    })
    .returning();

  const [retail] = await db
    .insert(organizations)
    .values({
      name: "Demo Retail",
      status: "ACTIVE",
      registrationId: "DEMO-0000-0002",
      industry: "Retail",
      intendedUsage: "Customer updates",
      statusChangedAt: new Date(),
    })
    .returning();

  const [hospitality] = await db
    .insert(organizations)
    .values({
      name: "Demo Hospitality",
      status: "ACTIVE",
      registrationId: "DEMO-0000-0003",
      industry: "Hospitality",
      intendedUsage: "Reservations",
      statusChangedAt: new Date(),
    })
    .returning();

  const [events] = await db
    .insert(organizations)
    .values({
      name: "Demo Events",
      status: "ACTIVE",
      registrationId: "DEMO-0000-0004",
      industry: "Events",
      intendedUsage: "Event reminders",
      statusChangedAt: new Date(),
    })
    .returning();

  // Pending verification queue, as shown on the admin overview.
  const [luzon] = await db
    .insert(organizations)
    .values({
      name: "Luzon Grocers Inc.",
      status: "PENDING_REVIEW",
      registrationId: "DEMO-0000-0005",
      industry: "Grocery",
      address: "Sample Road, Quezon City",
      contactName: "Sample Contact",
      intendedUsage: "Delivery notifications for online grocery orders.",
      createdAt: new Date("2026-09-14T02:00:00Z"),
    })
    .returning();

  const [vismin] = await db
    .insert(organizations)
    .values({
      name: "VisMin Logistics Co.",
      status: "PENDING_REVIEW",
      registrationId: "DEMO-0000-0006",
      industry: "Logistics",
      address: "Sample Street, Cebu City",
      contactName: "Sample Contact",
      intendedUsage: "Parcel status updates for consignees.",
      createdAt: new Date("2026-09-13T02:00:00Z"),
    })
    .returning();

  const orgs = { demoBusiness, retail, hospitality, events, luzon, vismin };

  /* --- Users and membership --------------------------------------------- */

  const [admin] = await db
    .insert(users)
    .values({
      email: "admin@phsms.test",
      passwordHash: hash,
      fullName: "Admin User",
      emailVerifiedAt: new Date(),
      isPlatformAdmin: true,
    })
    .returning();

  const [owner] = await db
    .insert(users)
    .values({
      email: "owner@demo.test",
      passwordHash: hash,
      fullName: "Demo Owner",
      emailVerifiedAt: new Date(),
    })
    .returning();

  const [sender] = await db
    .insert(users)
    .values({
      email: "sender@demo.test",
      passwordHash: hash,
      fullName: "Demo Sender",
      emailVerifiedAt: new Date(),
    })
    .returning();

  const [viewer] = await db
    .insert(users)
    .values({
      email: "viewer@demo.test",
      passwordHash: hash,
      fullName: "Demo Viewer",
      emailVerifiedAt: new Date(),
    })
    .returning();

  // A second tenant's owner, used to prove cross-tenant access is refused.
  const [otherOwner] = await db
    .insert(users)
    .values({
      email: "owner@demoretail.test",
      passwordHash: hash,
      fullName: "Retail Owner",
      emailVerifiedAt: new Date(),
    })
    .returning();

  await db.insert(memberships).values([
    { organizationId: demoBusiness!.id, userId: owner!.id, role: "OWNER" },
    { organizationId: demoBusiness!.id, userId: sender!.id, role: "SENDER" },
    { organizationId: demoBusiness!.id, userId: viewer!.id, role: "VIEWER" },
    { organizationId: retail!.id, userId: otherOwner!.id, role: "OWNER" },
  ]);

  /* --- Wallets ----------------------------------------------------------- */

  const funded = [demoBusiness!, retail!, hospitality!, events!];
  await db.insert(wallets).values(
    funded.map((o) => ({
      organizationId: o.id,
      postedBalanceCentavos: MOCK_DEFAULTS.demoFundingCentavos,
    })),
  );

  await db.insert(ledgerEntries).values(
    funded.map((o) => ({
      organizationId: o.id,
      type: "PURCHASE" as const,
      amountCentavos: MOCK_DEFAULTS.demoFundingCentavos,
      postedBalanceAfter: MOCK_DEFAULTS.demoFundingCentavos,
      heldAfter: 0,
      operationRef: `seed:funding:${o.id}`,
      reason: "Demo funding — not a real payment",
    })),
  );

  /* --- Sender identities -------------------------------------------------- */

  await db
    .insert(senderIdentities)
    .values({
      organizationId: demoBusiness!.id,
      value: "DEMO BRAND",
      status: "APPROVED",
      // The mock sender cannot receive replies, so the UI must not offer "Reply STOP".
      supportsInboundReplies: false,
      evidenceNote: "Demo sender identity, approved in mock mode.",
      decidedAt: new Date(),
    })
    .returning();

  await db.insert(senderIdentities).values([
    {
      organizationId: retail!.id,
      value: "DEMORETAIL",
      status: "APPROVED",
      decidedAt: new Date(),
    },
    {
      organizationId: hospitality!.id,
      value: "DEMOSTAY",
      status: "APPROVED",
      decidedAt: new Date(),
    },
    { organizationId: events!.id, value: "DEMOEVENT", status: "APPROVED", decidedAt: new Date() },
    // Awaiting review, as shown on the admin overview tile.
    { organizationId: luzon!.id, value: "LUZONGROC", status: "PENDING" },
    { organizationId: vismin!.id, value: "VISMINLOG", status: "PENDING" },
  ]);

  /* --- Contacts, suppression, templates ----------------------------------- */

  await db.insert(contacts).values(
    Array.from({ length: 24 }, (_, i) => ({
      organizationId: demoBusiness!.id,
      ...numberFields(demoNumber(i + 1)),
      firstName: ["Ana", "Ben", "Cara", "Dino", "Elle", "Fidel"][i % 6]!,
      lastName: ["Reyes", "Santos", "Cruz", "Garcia"][i % 4]!,
      consentSource: "Checkout form",
      consentDate: new Date("2026-07-01T00:00:00Z"),
    })),
  );

  // Two opted-out numbers so the exclusion counters are visibly non-zero.
  await db.insert(suppressions).values([
    {
      scope: "ORGANIZATION",
      organizationId: demoBusiness!.id,
      ...(() => {
        const n = demoNumber(3);
        return { numberHash: numberHash(n), numberMasked: maskNormalized(n) };
      })(),
      reason: "Customer asked to stop receiving messages",
      source: "OPERATOR_INTAKE",
    },
    {
      scope: "PLATFORM",
      organizationId: null,
      ...(() => {
        const n = demoNumber(7);
        return { numberHash: numberHash(n), numberMasked: maskNormalized(n) };
      })(),
      reason: "Platform safety block",
      source: "ADMIN",
    },
  ]);

  await db.insert(templates).values([
    {
      organizationId: demoBusiness!.id,
      name: "Reservation confirmed",
      body: "Your reservation is confirmed. We look forward to seeing you tomorrow.",
      createdBy: owner!.id,
    },
    {
      organizationId: demoBusiness!.id,
      name: "Order ready for pickup",
      body: "Your order is ready for pickup at our store until 8pm today. Thank you!",
      createdBy: owner!.id,
    },
  ]);

  /* --- Campaigns (as shown on the admin overview) -------------------------- */

  const campaignSeeds = [
    {
      org: retail!,
      name: "September Promos",
      sender: "DEMORETAIL",
      body: "Your September statement is ready. View it in your account any time.",
      details: "Customer update announcement",
      status: "SCHEDULED" as const,
      delivered: 0,
      scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 20),
    },
    {
      org: hospitality!,
      name: "Weekend Reminders",
      sender: "DEMOSTAY",
      body: "Reminder: your booking is this weekend. Reply to our team if plans change.",
      details: "Reservation reminders",
      status: "PROCESSING" as const,
      delivered: 6,
      scheduledAt: null,
    },
    {
      org: events!,
      name: "Event Updates",
      sender: "DEMOEVENT",
      body: "Doors open at 9am today. Please bring your ticket QR code with you.",
      details: "Event day reminders",
      status: "FINISHED" as const,
      delivered: 12,
      scheduledAt: null,
    },
  ];

  for (const seed of campaignSeeds) {
    const info = analyzeMessage(seed.body);
    const recipients = 12;
    const senderRow = await db.query.senderIdentities.findFirst({
      where: (s, { eq, and }) => and(eq(s.organizationId, seed.org.id), eq(s.value, seed.sender)),
    });

    const [campaign] = await db
      .insert(campaigns)
      .values({
        organizationId: seed.org.id,
        name: seed.name,
        status: seed.status,
        senderIdentityId: senderRow!.id,
        senderValueSnapshot: seed.sender,
        purpose: "INFORMATIONAL",
        body: seed.body,
        bodyHash: sha256(seed.body),
        encoding: info.encoding,
        segmentsPerMessage: info.segments,
        unitPriceCentavos: MOCK_DEFAULTS.unitPriceCentavos,
        pricingPolicyVersion: MOCK_DEFAULTS.pricingPolicyVersion,
        maxAuthorizedCostCentavos: recipients * info.segments * MOCK_DEFAULTS.unitPriceCentavos,
        requestedCount: recipients,
        includedCount: recipients,
        exclusions: { duplicate: 0, invalid: 0, suppressed: 0 },
        scheduledAt: seed.scheduledAt,
        startedAt: seed.status === "SCHEDULED" ? null : new Date(Date.now() - 3600_000),
        finishedAt: seed.status === "FINISHED" ? new Date(Date.now() - 1800_000) : null,
        createdBy: admin!.id,
      })
      .returning();

    await db.insert(messageItems).values(
      Array.from({ length: recipients }, (_, i) => {
        const normalized = demoNumber(100 + i);
        const accepted = seed.status !== "SCHEDULED";
        const isDelivered = i < seed.delivered;
        return {
          campaignId: campaign!.id,
          organizationId: seed.org.id,
          stableKey: `${campaign!.id}:${i}`,
          ...numberFields(normalized),
          segments: info.segments,
          costCentavos: info.segments * MOCK_DEFAULTS.unitPriceCentavos,
          submissionStatus: accepted ? ("ACCEPTED" as const) : ("PENDING" as const),
          deliveryStatus: isDelivered ? ("DELIVERED" as const) : ("PENDING" as const),
          partnerReference: accepted ? `mock-${randomUUID().slice(0, 12)}` : null,
          acceptedAt: accepted ? new Date(Date.now() - 3000_000) : null,
          deliveredAt: isDelivered ? new Date(Date.now() - 2400_000) : null,
          charged: accepted,
        };
      }),
    );
  }

  /* --- Quota buckets ------------------------------------------------------- */

  await db.insert(quotaBuckets).values([
    {
      organizationId: demoBusiness!.id,
      period: "DAY",
      periodKey: manilaDayKey(),
      limitCount: MOCK_DEFAULTS.dailyDestinationQuota,
      consumedCount: 0,
    },
    {
      organizationId: demoBusiness!.id,
      period: "MONTH",
      periodKey: manilaMonthKey(),
      limitCount: MOCK_DEFAULTS.monthlyDestinationQuota,
      consumedCount: 0,
    },
  ]);

  /* --- Bulk inquiries (admin overview) ------------------------------------- */

  await db.insert(inquiries).values([
    {
      company: "Demo Retail",
      contactName: "Sample Contact",
      contactEmail: "contact@demoretail.test",
      estimatedVolume: 25_000,
      frequency: "Monthly",
      purpose: "INFORMATIONAL",
      audience: "Existing customers who opted in at checkout",
      sampleMessage: "Your September statement is ready.",
      consentSource: "Checkout opt-in",
      status: "NEW",
      organizationId: retail!.id,
      createdAt: new Date("2026-09-14T01:00:00Z"),
    },
    {
      company: "Demo Hospitality",
      contactName: "Sample Contact",
      contactEmail: "contact@demostay.test",
      estimatedVolume: 8_000,
      frequency: "Weekly",
      purpose: "INFORMATIONAL",
      audience: "Guests with upcoming bookings",
      sampleMessage: "Reminder: your booking is this weekend.",
      consentSource: "Booking form",
      status: "REVIEWING",
      organizationId: hospitality!.id,
      createdAt: new Date("2026-09-13T01:00:00Z"),
    },
    {
      company: "Demo Events",
      contactName: "Sample Contact",
      contactEmail: "contact@demoevent.test",
      estimatedVolume: 40_000,
      frequency: "Per event",
      purpose: "PROMOTIONAL",
      audience: "Ticket holders for the September event",
      sampleMessage: "Doors open at 9am today.",
      consentSource: "Ticket purchase",
      status: "QUOTATION_SENT",
      organizationId: events!.id,
      createdAt: new Date("2026-09-12T01:00:00Z"),
    },
  ]);

  console.log(`
Seed complete.

  Platform admin   admin@phsms.test     / ${PASSWORD}
  Owner            owner@demo.test      / ${PASSWORD}
  Sender           sender@demo.test     / ${PASSWORD}
  Viewer           viewer@demo.test     / ${PASSWORD}
  Other tenant     owner@demoretail.test/ ${PASSWORD}

  Organizations: ${Object.values(orgs).length}. Demo funding is mock credit only.
`);
}

try {
  await main();
} finally {
  await client.end({ timeout: 5 });
}
