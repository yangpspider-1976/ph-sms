import "server-only";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { campaignStatus, campaigns, messageItems, messagePurpose } from "@/server/db/schema";
import { dateToPlatformWallTime, platformWallTimeToDate, formatDateTime, formatMoney } from "@/i18n/format";
import { campaignName } from "@/i18n/campaign-name";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { toCsv } from "./csv";
import type { ExportFile } from "./exports";
import { recordAudit } from "@/server/audit";

const DAY_MS = 86_400_000;
export const REPORT_PAGE_SIZE = 50;
export const REPORT_EXPORT_LIMIT = 10_000;
export const REPORT_STATUSES = campaignStatus.enumValues;
export const REPORT_PURPOSES = messagePurpose.enumValues;

export type ReportFilters = {
  from: string;
  to: string;
  status: (typeof REPORT_STATUSES)[number] | "";
  purpose: (typeof REPORT_PURPOSES)[number] | "";
  page: number;
};

export class ReportFilterError extends Error {}

/** The range selects campaign creation dates, including the whole end day in Manila. */
export function parseReportFilters(
  raw: Record<string, string | string[] | undefined>,
  now = new Date(),
): ReportFilters {
  const from = raw.from || dateToPlatformWallTime(new Date(now.getTime() - 29 * DAY_MS)).slice(0, 10);
  const to = raw.to || dateToPlatformWallTime(now).slice(0, 10);
  const status = raw.status || "";
  const purpose = raw.purpose || "";
  const page = raw.page || "1";
  if ([from, to, status, purpose, page].some((v) => typeof v !== "string")) {
    throw new ReportFilterError("Invalid report filters");
  }
  const start = platformWallTimeToDate(`${from}T00:00:00`);
  const end = platformWallTimeToDate(`${to}T00:00:00`);
  if (!start || !end || start > end || end.getTime() - start.getTime() >= 366 * DAY_MS ||
      (status && !(REPORT_STATUSES as readonly string[]).includes(status as string)) ||
      (purpose && !(REPORT_PURPOSES as readonly string[]).includes(purpose as string)) ||
      !/^\d{1,7}$/.test(page as string) || Number(page) < 1) {
    throw new ReportFilterError("Invalid report filters");
  }
  return { from, to, status, purpose, page: Number(page) } as ReportFilters;
}

export function reportQuery(filters: ReportFilters, page = filters.page): string {
  return new URLSearchParams({ from: filters.from, to: filters.to, status: filters.status,
    purpose: filters.purpose, page: String(page) }).toString();
}

function predicate(organizationId: string, filters: ReportFilters) {
  return and(
    eq(campaigns.organizationId, organizationId),
    gte(campaigns.createdAt, platformWallTimeToDate(`${filters.from}T00:00:00`)!),
    lt(campaigns.createdAt, new Date(platformWallTimeToDate(`${filters.to}T00:00:00`)!.getTime() + DAY_MS)),
    filters.status ? eq(campaigns.status, filters.status) : undefined,
    filters.purpose ? eq(campaigns.purpose, filters.purpose) : undefined,
  );
}

/** Both joins and campaign predicates carry tenant scope, including aggregate queries. */
function reportRows(organizationId: string, filters: ReportFilters) {
  return db.select({
    id: campaigns.id, name: campaigns.name, isTestSend: campaigns.isTestSend,
    createdAt: campaigns.createdAt, status: campaigns.status, purpose: campaigns.purpose,
    recipients: campaigns.includedCount, authorized: campaigns.maxAuthorizedCostCentavos,
    accepted: sql<number>`count(${messageItems.id}) filter (where ${messageItems.submissionStatus} = 'ACCEPTED')::int`.as("accepted"),
    delivered: sql<number>`count(${messageItems.id}) filter (where ${messageItems.submissionStatus} = 'ACCEPTED' and ${messageItems.deliveryStatus} = 'DELIVERED')::int`.as("delivered"),
    notDelivered: sql<number>`count(${messageItems.id}) filter (where ${messageItems.submissionStatus} = 'REJECTED' or (${messageItems.submissionStatus} = 'ACCEPTED' and ${messageItems.deliveryStatus} in ('UNDELIVERED','EXPIRED')))::int`.as("not_delivered"),
    unresolved: sql<number>`count(${messageItems.id}) filter (where ${messageItems.submissionStatus} in ('UNKNOWN','SUBMITTING'))::int`.as("unresolved"),
    charged: sql<number>`coalesce(sum(${messageItems.costCentavos}) filter (where ${messageItems.charged}), 0)`.mapWith(Number).as("charged"),
  }).from(campaigns).leftJoin(messageItems, and(
    eq(messageItems.campaignId, campaigns.id), eq(messageItems.organizationId, organizationId),
  )).where(predicate(organizationId, filters)).groupBy(campaigns.id);
}

export async function getReportsForOrg(organizationId: string, filters: ReportFilters) {
  const allRows = reportRows(organizationId, filters).as("report_rows");
  const [totals] = await db.select({
    campaigns: sql<number>`count(*)::int`,
    recipients: sql<number>`coalesce(sum(${allRows.recipients}), 0)`.mapWith(Number),
    accepted: sql<number>`coalesce(sum(${allRows.accepted}), 0)`.mapWith(Number),
    delivered: sql<number>`coalesce(sum(${allRows.delivered}), 0)`.mapWith(Number),
    notDelivered: sql<number>`coalesce(sum(${allRows.notDelivered}), 0)`.mapWith(Number),
    unresolved: sql<number>`coalesce(sum(${allRows.unresolved}), 0)`.mapWith(Number),
    charged: sql<number>`coalesce(sum(${allRows.charged}), 0)`.mapWith(Number),
    authorized: sql<number>`coalesce(sum(${allRows.authorized}), 0)`.mapWith(Number),
  }).from(allRows);
  const total = totals!;
  const pages = Math.max(1, Math.ceil(total.campaigns / REPORT_PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const rows = await reportRows(organizationId, filters).orderBy(desc(campaigns.createdAt), desc(campaigns.id))
    .limit(REPORT_PAGE_SIZE).offset((page - 1) * REPORT_PAGE_SIZE);
  return { totals: total, rows, page, pages };
}

/** Totals only. Recipient details stay behind the existing permission-checked campaign export. */
export async function exportReports(input: {
  organizationId: string; actorUserId: string; filters: ReportFilters; t: Dictionary; locale: Locale;
}): Promise<ExportFile | null> {
  const { t, locale, filters } = input;
  const rows = await reportRows(input.organizationId, filters)
    .orderBy(desc(campaigns.createdAt), desc(campaigns.id)).limit(REPORT_EXPORT_LIMIT + 1);
  // Refuse rather than silently dropping older campaigns from the download.
  if (rows.length > REPORT_EXPORT_LIMIT) return null;
  const r = t.reports;
  await recordAudit({ action: "export.reports", organizationId: input.organizationId,
    actorUserId: input.actorUserId, objectType: "campaigns",
    metadata: { from: filters.from, to: filters.to, status: filters.status, purpose: filters.purpose, rows: rows.length } });
  return {
    filename: `reports-${filters.from}-${filters.to}.csv`,
    contentType: "text/csv; charset=utf-8",
    content: `\uFEFF${toCsv([r.created, r.campaign, r.status, r.purpose, r.recipients, r.accepted,
      r.delivered, r.notDelivered, r.unresolved, r.charged, r.authorized], rows.map((row) => [
      formatDateTime(row.createdAt, locale), campaignName(row, t, locale), t.status.campaign[row.status],
      t.status.purpose[row.purpose], row.recipients, row.accepted, row.delivered, row.notDelivered,
      row.unresolved, formatMoney(row.charged, locale), formatMoney(row.authorized, locale),
    ]))}`,
  };
}
