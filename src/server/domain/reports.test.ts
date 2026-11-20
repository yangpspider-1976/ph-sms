import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db, resetDb } from "@/test/db";
import { createTenant, NUMBERS, type Tenant } from "@/test/fixtures";
import { campaigns, messageItems, auditEvents } from "@/server/db/schema";
import { issueQuote } from "./quote";
import { submitCampaign } from "./submit";
import { exportReports, getReportsForOrg, parseReportFilters } from "./reports";
import { en } from "@/i18n/locales/en";
import { ko } from "@/i18n/locales/ko";

beforeEach(resetDb);
afterAll(closeDb);

async function campaign(tenant: Tenant, createdAt: string, name: string) {
  const quote = await issueQuote({ ...tenant, purpose: "INFORMATIONAL", body: "Your order is ready.", rawRecipients: [NUMBERS.ok(1)] });
  const sent = await submitCampaign({ ...tenant, quoteId: quote.id, name, idempotencyKey: `report:${quote.id}` });
  await db.update(campaigns).set({ createdAt: new Date(createdAt) }).where(eq(campaigns.id, sent.campaignId));
  return sent.campaignId;
}

describe("reports", () => {
  it("validates dates, ranges, repeated parameters and filter enums", () => {
    for (const raw of [
      { from: "2026-02-30" }, { from: "2026-11-20", to: "2026-11-01" },
      { from: ["2026-11-01", "2026-11-02"] }, { status: "not-a-status" },
      { purpose: "unknown" }, { page: "0" },
      { from: "2020-01-01", to: "2026-01-01" },
    ]) expect(() => parseReportFilters(raw)).toThrow();
  });

  it("scopes totals and rows by tenant and the complete Manila end date", async () => {
    const tenant = await createTenant();
    const other = await createTenant();
    const included = await campaign(tenant, "2026-11-17T15:59:59Z", "Within Manila day");
    await campaign(tenant, "2026-11-17T16:00:00Z", "Next Manila day");
    await campaign(other, "2026-11-17T12:00:00Z", "Other organization");
    await db.update(messageItems).set({ submissionStatus: "ACCEPTED", deliveryStatus: "DELIVERED", charged: true })
      .where(eq(messageItems.campaignId, included));
    const filters = parseReportFilters({ from: "2026-11-17", to: "2026-11-17" });
    const report = await getReportsForOrg(tenant.organizationId, filters);
    expect(report.totals).toMatchObject({ campaigns: 1, recipients: 1, accepted: 1, delivered: 1, charged: 100, authorized: 100 });
    expect(report.rows.map((row) => row.id)).toEqual([included]);
    const empty = await getReportsForOrg(tenant.organizationId, { ...filters, status: "CANCELLED" });
    expect(empty.totals.campaigns).toBe(0);
    expect(empty.totals.charged).toBe(0);
  });

  it("exports the same filtered aggregates in Korean, neutralizes formulas and audits access", async () => {
    const tenant = await createTenant();
    await campaign(tenant, "2026-11-17T00:00:00Z", "=SUM(1+1)");
    const file = await exportReports({ ...tenant, actorUserId: tenant.userId,
      filters: parseReportFilters({ from: "2026-11-17", to: "2026-11-17" }), t: ko, locale: "ko" });
    expect(file?.content).toContain(ko.reports.charged);
    expect(file?.content).not.toContain(en.reports.charged);
    expect(file?.content).toContain("'=SUM(1+1)");
    expect(file?.content).not.toContain(NUMBERS.ok(1));
    expect(await db.select().from(auditEvents).where(eq(auditEvents.action, "export.reports"))).toHaveLength(1);
  });
});
