import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/server/db";
import {
  campaigns,
  contacts,
  imports,
  importRows,
  messageItems,
  suppressions,
} from "@/server/db/schema";
import { decrypt } from "@/server/security/crypto";
import { toCsv } from "./csv";
import { formatCentavos, formatManila } from "@/server/config";
import { recordAudit } from "@/server/audit";

/**
 * Exports.
 *
 * Two rules, both enforced here rather than in the page:
 *   - masked by default. Revealing full numbers is a separate, owner-only
 *     action, and every one of those is written to the audit log;
 *   - every cell goes through the formula-safe writer, so a name like
 *     "=cmd|..." cannot execute when the file is opened in a spreadsheet.
 */

export type ExportScope = "MASKED" | "FULL";

export type ExportFile = {
  filename: string;
  content: string;
  contentType: string;
};

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

/** Per-recipient results for one campaign. */
export async function exportCampaignReport(input: {
  campaignId: string;
  organizationId: string;
  actorUserId: string;
  scope: ExportScope;
}): Promise<ExportFile | null> {
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
    "row",
    input.scope === "FULL" ? "phone_number" : "phone_number_masked",
    "submission_status",
    "delivery_status",
    "segments",
    "cost",
    "charged",
    "error_code",
    "excluded_reason",
    "accepted_at",
    "delivered_at",
  ];

  const rows = items.map((item, index) => [
    index + 1,
    input.scope === "FULL" ? decrypt(item.numberEncrypted) : item.numberMasked,
    item.submissionStatus,
    // Delivery is only meaningful once the provider accepted the message.
    item.submissionStatus === "ACCEPTED" ? item.deliveryStatus : "",
    item.segments,
    formatCentavos(item.costCentavos),
    item.charged ? "yes" : "no",
    item.errorCode ?? "",
    item.excludedReason ?? "",
    item.acceptedAt ? formatManila(item.acceptedAt) : "",
    item.deliveredAt ? formatManila(item.deliveredAt) : "",
  ]);

  await recordAudit({
    action: input.scope === "FULL" ? "export.campaign_full" : "export.campaign_masked",
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    objectType: "campaign",
    objectId: input.campaignId,
    metadata: { rows: rows.length, scope: input.scope },
  });

  return {
    filename: `campaign-${campaign.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${stamp()}.csv`,
    content: toCsv(headers, rows),
    contentType: "text/csv; charset=utf-8",
  };
}

/** The organization's contact list. */
/**
 * Rejected rows from one import (REC-06).
 *
 * Scoped to a single import and to rows that were NOT accepted, so the file is
 * a correction worksheet and not a copy of the contact list. Numbers are always
 * masked here regardless of the caller's export scope: the purpose is to find
 * the row in the customer's own spreadsheet, which the row number does, and a
 * full number would make this a second, softer route to a data export.
 */
export async function exportImportErrors(input: {
  organizationId: string;
  actorUserId: string;
  importId: string;
}): Promise<ExportFile | null> {
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

  const headers = ["row_number", "phone_number_masked", "reason", "detail"];

  const data = rows.map((row) => [
    String(row.sourceRowNumber),
    // A row that failed to parse has no mask, because there was no number to
    // mask. The raw value is the customer's own text from their own file.
    row.numberMasked ?? truncateRaw(row.rawValue),
    REJECTION_REASONS[row.status] ?? row.status,
    row.reasonDetail ?? "",
  ]);

  await recordAudit({
    action: "export.import_errors",
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    objectType: "import",
    objectId: input.importId,
    metadata: { rows: data.length },
  });

  return {
    filename: `import-errors-${stamp()}.csv`,
    content: toCsv(headers, data),
    contentType: "text/csv; charset=utf-8",
  };
}

/** Said in the customer's terms, not the database's. */
const REJECTION_REASONS: Record<string, string> = {
  INVALID: "Not a valid Philippine mobile number",
  DUPLICATE: "Appears more than once in this file",
  SUPPRESSED: "This number has opted out",
  BLANK: "No number in this row",
  OVER_CEILING: "Above the self-service limit for one upload",
};

/** Keeps an unparseable cell short enough to stay readable in a spreadsheet. */
function truncateRaw(raw: string | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed;
}

export async function exportContacts(input: {
  organizationId: string;
  actorUserId: string;
  scope: ExportScope;
}): Promise<ExportFile> {
  const rows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.organizationId, input.organizationId));

  const headers = [
    input.scope === "FULL" ? "phone_number" : "phone_number_masked",
    "first_name",
    "last_name",
    "consent_source",
    "consent_date",
    "created_at",
  ];

  const data = rows.map((row) => [
    input.scope === "FULL" ? decrypt(row.numberEncrypted) : row.numberMasked,
    row.firstName ?? "",
    row.lastName ?? "",
    row.consentSource ?? "",
    row.consentDate ? formatManila(row.consentDate) : "",
    formatManila(row.createdAt),
  ]);

  await recordAudit({
    action: input.scope === "FULL" ? "export.contacts_full" : "export.contacts_masked",
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    objectType: "contacts",
    metadata: { rows: data.length, scope: input.scope },
  });

  return {
    filename: `contacts-${stamp()}.csv`,
    content: toCsv(headers, data),
    contentType: "text/csv; charset=utf-8",
  };
}

/**
 * The organization's own opt-out list.
 *
 * Always masked: an opt-out list is a list of people who asked this business to
 * stop, and there is no reason to hand back plain numbers for it.
 */
export async function exportSuppressions(input: {
  organizationId: string;
  actorUserId: string;
}): Promise<ExportFile> {
  const rows = await db
    .select()
    .from(suppressions)
    .where(
      and(
        eq(suppressions.scope, "ORGANIZATION"),
        eq(suppressions.organizationId, input.organizationId),
      ),
    );

  const headers = ["phone_number_masked", "reason", "source", "recorded_at"];
  const data = rows.map((row) => [
    row.numberMasked,
    row.reason,
    row.source,
    formatManila(row.createdAt),
  ]);

  await recordAudit({
    action: "export.suppression",
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    objectType: "suppression",
    metadata: { rows: data.length },
  });

  return {
    filename: `opt-outs-${stamp()}.csv`,
    content: toCsv(headers, data),
    contentType: "text/csv; charset=utf-8",
  };
}

/** A CSV template with the accepted columns and one example row. */
export function contactTemplate(): ExportFile {
  const headers = [
    "phone_number",
    "first_name",
    "last_name",
    "consent_source",
    "consent_date",
  ];
  return {
    filename: "contacts-template.csv",
    content: toCsv(headers, [["09171234567", "Ana", "Reyes", "Checkout form", "2026-01-31"]]),
    contentType: "text/csv; charset=utf-8",
  };
}
