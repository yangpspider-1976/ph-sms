import "server-only";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  campaigns,
  contacts,
  imports,
  importRows,
  messageItems,
  organizations,
  suppressions,
} from "@/server/db/schema";
import { decrypt } from "@/server/security/crypto";
import { toCsv } from "./csv";
import { formatCentavos } from "@/server/config";
import { recordAudit } from "@/server/audit";
import { dateToPlatformWallTime, formatDateTime } from "@/i18n/format";
import { campaignName } from "@/i18n/campaign-name";
import { localizeServerText } from "@/i18n/server-text";
import { en } from "@/i18n/locales/en";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

/**
 * Exports.
 *
 * Two rules, both enforced here rather than in the page:
 *   - masked by default. Revealing full numbers is a separate, owner-only
 *     action, and every one of those is written to the audit log;
 *   - every cell goes through the formula-safe writer, so a name like
 *     "=cmd|..." cannot execute when the file is opened in a spreadsheet.
 *
 * A file is written in the language of the person downloading it: the column
 * names, statuses, reasons and dates. The English column names are the
 * identifiers they have always been, and an upload recognises the contact
 * columns in either language.
 */

export type ExportScope = "MASKED" | "FULL";

export type ExportFile = {
  filename: string;
  content: string;
  contentType: string;
};

/** Who is downloading, for the file's language. English when not given. */
type Reader = { t?: Dictionary; locale?: Locale };

/** When the file was made, in Manila time like every other time a customer sees. */
function stamp(): string {
  return dateToPlatformWallTime(new Date()).replace(/[:T]/g, "-");
}

/**
 * A CSV file. It starts with a byte-order mark: without one, Excel on Windows
 * reads the file in the computer's own code page, and Korean comes out garbled.
 */
function csvFile(filename: string, headers: string[], rows: Array<Array<unknown>>): ExportFile {
  return {
    filename,
    content: `﻿${toCsv(headers, rows)}`,
    contentType: "text/csv; charset=utf-8",
  };
}

/** A label from a list, or the stored value itself when the list has none. */
function label(labels: Record<string, string>, raw: string): string {
  return labels[raw] ?? raw;
}

/**
 * A campaign's name as it can appear in a file name, followed by a dash.
 *
 * The file name travels in a response header, so only plain letters and digits
 * are kept. A name with none, such as one written in Korean, is left out rather
 * than becoming a row of dashes. A test send's stored name is only a record
 * (see campaignName), so its file just says test-send.
 */
function nameForFile(campaign: { name: string; isTestSend: boolean }): string {
  const slug = (campaign.isTestSend ? "test send" : campaign.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `${slug}-` : "";
}

/** Per-recipient results for one campaign. */
export async function exportCampaignReport(
  input: {
    campaignId: string;
    organizationId: string;
    actorUserId: string;
    scope: ExportScope;
  } & Reader,
): Promise<ExportFile | null> {
  const t = input.t ?? en;
  const locale = input.locale ?? "en";
  const columns = t.exportFiles.campaign;

  const campaign = (
    await db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, input.campaignId),
          eq(campaigns.organizationId, input.organizationId),
        ),
      )
      .limit(1)
  )[0];
  if (!campaign) return null;

  const items = await db
    .select()
    .from(messageItems)
    .where(
      and(
        eq(messageItems.campaignId, input.campaignId),
        eq(messageItems.organizationId, input.organizationId),
      ),
    );

  const headers = [
    columns.row,
    input.scope === "FULL" ? columns.phone : columns.phoneMasked,
    columns.submission,
    columns.delivery,
    columns.segments,
    columns.cost,
    columns.charged,
    columns.errorCode,
    columns.excludedReason,
    columns.acceptedAt,
    columns.deliveredAt,
  ];

  const rows = items.map((item, index) => [
    index + 1,
    input.scope === "FULL" ? decrypt(item.numberEncrypted) : item.numberMasked,
    label(t.status.submission, item.submissionStatus),
    // Delivery is only meaningful once the provider accepted the message.
    item.submissionStatus === "ACCEPTED" ? label(t.status.delivery, item.deliveryStatus) : "",
    item.segments,
    formatCentavos(item.costCentavos),
    item.charged ? t.exportFiles.yes : t.exportFiles.no,
    item.errorCode ?? "",
    item.excludedReason ? label(t.exportFiles.rejectionReasons, item.excludedReason) : "",
    item.acceptedAt ? formatDateTime(item.acceptedAt, locale) : "",
    item.deliveredAt ? formatDateTime(item.deliveredAt, locale) : "",
  ]);

  await recordAudit({
    action: input.scope === "FULL" ? "export.campaign_full" : "export.campaign_masked",
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    objectType: "campaign",
    objectId: input.campaignId,
    metadata: { rows: rows.length, scope: input.scope },
  });

  return csvFile(`campaign-${nameForFile(campaign)}${stamp()}.csv`, headers, rows);
}

/**
 * Rejected rows from one import (REC-06).
 *
 * Scoped to a single import and to rows that were NOT accepted, so the file is
 * a correction worksheet and not a copy of the contact list. Numbers are always
 * masked here regardless of the caller's export scope: the purpose is to find
 * the row in the customer's own spreadsheet, which the row number does, and a
 * full number would make this a second, softer route to a data export.
 */
export async function exportImportErrors(
  input: {
    organizationId: string;
    actorUserId: string;
    importId: string;
  } & Reader,
): Promise<ExportFile | null> {
  const t = input.t ?? en;
  const columns = t.exportFiles.importErrors;

  const [record] = await db
    .select({ id: imports.id, filename: imports.filename })
    .from(imports)
    .where(and(eq(imports.id, input.importId), eq(imports.organizationId, input.organizationId)))
    .limit(1);

  if (!record) return null;

  const rows = await db
    .select({
      sourceRowNumber: importRows.sourceRowNumber,
      numberMasked: importRows.numberMasked,
      rawValue: importRows.rawValue,
      status: importRows.status,
      reasonDetail: importRows.reasonDetail,
    })
    .from(importRows)
    .where(
      and(
        eq(importRows.importId, input.importId),
        eq(importRows.organizationId, input.organizationId),
        ne(importRows.status, "ELIGIBLE"),
      ),
    )
    .orderBy(importRows.sourceRowNumber);

  const headers = [columns.rowNumber, columns.phoneMasked, columns.reason, columns.detail];

  const data = rows.map((row) => [
    String(row.sourceRowNumber),
    // A row that failed to parse has no mask, because there was no number to
    // mask. The raw value is the customer's own text from their own file.
    row.numberMasked ?? truncateRaw(row.rawValue),
    label(t.exportFiles.rejectionReasons, row.status),
    localizeServerText(row.reasonDetail, t) ?? "",
  ]);

  await recordAudit({
    action: "export.import_errors",
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    objectType: "import",
    objectId: input.importId,
    metadata: { rows: data.length },
  });

  return csvFile(`import-errors-${stamp()}.csv`, headers, data);
}

/** Keeps an unparseable cell short enough to stay readable in a spreadsheet. */
function truncateRaw(raw: string | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed;
}

/**
 * The organization's contact list.
 *
 * The consent date is written as YYYY-MM-DD, the form an upload reads, so a
 * downloaded list can be uploaded again.
 */
export async function exportContacts(
  input: {
    organizationId: string;
    actorUserId: string;
    scope: ExportScope;
  } & Reader,
): Promise<ExportFile> {
  const t = input.t ?? en;
  const locale = input.locale ?? "en";
  const columns = t.exportFiles.contacts;

  const rows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.organizationId, input.organizationId));

  const headers = [
    input.scope === "FULL" ? columns.phone : columns.phoneMasked,
    columns.firstName,
    columns.lastName,
    columns.consentSource,
    columns.consentDate,
    columns.createdAt,
  ];

  const data = rows.map((row) => [
    input.scope === "FULL" ? decrypt(row.numberEncrypted) : row.numberMasked,
    row.firstName ?? "",
    row.lastName ?? "",
    row.consentSource ?? "",
    row.consentDate ? dateToPlatformWallTime(row.consentDate).slice(0, 10) : "",
    formatDateTime(row.createdAt, locale),
  ]);

  await recordAudit({
    action: input.scope === "FULL" ? "export.contacts_full" : "export.contacts_masked",
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    objectType: "contacts",
    metadata: { rows: data.length, scope: input.scope },
  });

  return csvFile(`contacts-${stamp()}.csv`, headers, data);
}

/**
 * The organization's own opt-out list.
 *
 * Always masked: an opt-out list is a list of people who asked this business to
 * stop, and there is no reason to hand back plain numbers for it.
 */
export async function exportSuppressions(
  input: {
    organizationId: string;
    actorUserId: string;
  } & Reader,
): Promise<ExportFile> {
  const t = input.t ?? en;
  const locale = input.locale ?? "en";
  const columns = t.exportFiles.optOuts;

  const rows = await db
    .select()
    .from(suppressions)
    .where(
      and(
        eq(suppressions.scope, "ORGANIZATION"),
        eq(suppressions.organizationId, input.organizationId),
      ),
    );

  const headers = [columns.phoneMasked, columns.reason, columns.source, columns.recordedAt];
  const data = rows.map((row) => [
    row.numberMasked,
    localizeServerText(row.reason, t) ?? "",
    label(t.status.suppressionSource as Record<string, string>, row.source),
    formatDateTime(row.createdAt, locale),
  ]);

  await recordAudit({
    action: "export.suppression",
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    objectType: "suppression",
    metadata: { rows: data.length },
  });

  return csvFile(`opt-outs-${stamp()}.csv`, headers, data);
}

/** The most campaigns one admin export holds, newest first. */
const ADMIN_CAMPAIGN_EXPORT_LIMIT = 10_000;

/**
 * Every organization's campaigns, for the admin console's overview.
 *
 * Totals only: no message text and no numbers, so the file carries no
 * customer's recipients out of the platform. Every export is audited.
 */
export async function exportAdminCampaigns(
  input: { actorUserId: string } & Reader,
): Promise<ExportFile> {
  const t = input.t ?? en;
  const locale = input.locale ?? "en";
  const columns = t.exportFiles.adminCampaigns;

  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      isTestSend: campaigns.isTestSend,
      createdAt: campaigns.createdAt,
      status: campaigns.status,
      purpose: campaigns.purpose,
      includedCount: campaigns.includedCount,
      maxAuthorized: campaigns.maxAuthorizedCostCentavos,
      organizationName: organizations.name,
      accepted: sql<number>`(
        select count(*) from ${messageItems}
        where ${messageItems.campaignId} = ${campaigns.id}
          and ${messageItems.submissionStatus} = 'ACCEPTED')::int`,
      delivered: sql<number>`(
        select count(*) from ${messageItems}
        where ${messageItems.campaignId} = ${campaigns.id}
          and ${messageItems.deliveryStatus} = 'DELIVERED')::int`,
      notDelivered: sql<number>`(
        select count(*) from ${messageItems}
        where ${messageItems.campaignId} = ${campaigns.id}
          and (${messageItems.submissionStatus} = 'REJECTED'
            or ${messageItems.deliveryStatus} = 'UNDELIVERED'))::int`,
      charged: sql<number>`(
        select coalesce(sum(${messageItems.costCentavos}), 0) from ${messageItems}
        where ${messageItems.campaignId} = ${campaigns.id}
          and ${messageItems.charged})::int`,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .orderBy(desc(campaigns.createdAt))
    .limit(ADMIN_CAMPAIGN_EXPORT_LIMIT);

  const headers = [
    columns.created,
    columns.organization,
    columns.campaign,
    columns.status,
    columns.purpose,
    columns.recipients,
    columns.accepted,
    columns.delivered,
    columns.notDelivered,
    columns.charged,
    columns.maxAuthorized,
  ];

  const data = rows.map((row) => [
    formatDateTime(row.createdAt, locale),
    row.organizationName,
    campaignName(row, t, locale),
    label(t.status.campaign, row.status),
    label(t.status.purpose, row.purpose),
    row.includedCount,
    row.accepted,
    row.delivered,
    row.notDelivered,
    formatCentavos(row.charged),
    formatCentavos(row.maxAuthorized),
  ]);

  await recordAudit({
    action: "export.admin_campaigns",
    actorUserId: input.actorUserId,
    actorKind: "PLATFORM_ADMIN",
    objectType: "campaigns",
    metadata: { rows: data.length },
  });

  return csvFile(`all-campaigns-${stamp()}.csv`, headers, data);
}

/** A CSV template with the accepted columns and one example row. */
export function contactTemplate(t: Dictionary = en): ExportFile {
  const columns = t.exportFiles.contacts;
  const headers = [
    columns.phone,
    columns.firstName,
    columns.lastName,
    columns.consentSource,
    columns.consentDate,
  ];
  return {
    filename: "contacts-template.csv",
    content: `\uFEFF${toCsv(headers, [["09170000001", "Ana", "Reyes", t.exportFiles.sampleConsent, "2026-01-31"]])}`,
    contentType: "text/csv; charset=utf-8",
  };
}
