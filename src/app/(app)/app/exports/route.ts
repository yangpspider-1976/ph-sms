import type { NextResponse } from "next/server";
import { authorize, currentContext } from "@/server/auth/context";
import {
  contactTemplate,
  exportCampaignReport,
  exportContacts,
  exportImportErrors,
  exportSuppressions,
} from "@/server/domain/exports";
import { checkRateLimit } from "@/server/security/rate-limit";
import { isUuid } from "@/server/uuid";
import { download, downloadRefused } from "@/server/download-response";
import { getI18n } from "@/i18n/server";
import { localizeServerText } from "@/i18n/server-text";
import { enServerText } from "@/i18n/locales/en-server-text";
import { exportReports, parseReportFilters, ReportFilterError } from "@/server/domain/reports";

/**
 * Export endpoint.
 *
 * Served behind the session, never from a public URL, and the full-number scope
 * needs the owner-only permission. The response is marked no-store so the file
 * is not left in a shared cache. Files and refusals are both in the reader's
 * language.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { t, locale, tag } = await getI18n();
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "";
  const scope = url.searchParams.get("scope") === "full" ? "FULL" : "MASKED";

  const refuse = (status: number, message: string, supportRef?: string) =>
    downloadRefused({ request, status, message, t, tag, supportRef, fallback: "/app/dashboard" });

  // The template contains no customer data, so it only needs a signed-in user.
  if (kind === "template") {
    if (!(await currentContext())) {
      return refuse(401, localizeServerText(enServerText.signInToContinue, t));
    }
    return download(contactTemplate(t));
  }

  // Revealing full numbers is a separate permission from viewing a report.
  const permission = scope === "FULL" ? "reports.export.full" : "reports.export.masked";
  const auth = await authorize(permission);
  if (!auth.ok) {
    return refuse(
      auth.error.code === "NOT_AUTHENTICATED" ? 401 : 403,
      localizeServerText(auth.error.message, t),
      auth.error.supportRef,
    );
  }

  // Exports carry customer data out of the system, so they are limited even
  // for an authorised user.
  const limit = await checkRateLimit("export", auth.ctx.org.organizationId);
  if (!limit.allowed) {
    return refuse(429, localizeServerText(limit.message, t));
  }

  const shared = {
    organizationId: auth.ctx.org.organizationId,
    actorUserId: auth.ctx.user.id,
    t,
    locale,
  };

  switch (kind) {
    case "reports": {
      try {
        const filters = parseReportFilters(Object.fromEntries(
          ["from", "to", "status", "purpose"].map((key) => [key, url.searchParams.getAll(key).length > 1
            ? url.searchParams.getAll(key) : url.searchParams.get(key) ?? undefined]),
        ));
        const file = await exportReports({ ...shared, filters });
        if (!file) return refuse(400, t.reports.tooMany);
        return download(file);
      } catch (error) {
        if (error instanceof ReportFilterError) return refuse(400, t.reports.invalidFilters);
        throw error;
      }
    }
    case "campaign": {
      const campaignId = url.searchParams.get("campaignId");
      if (!campaignId) return refuse(400, t.exportFiles.missingCampaign);
      // A mistyped id cannot match anything; querying with it is a database error.
      if (!isUuid(campaignId)) return refuse(404, t.exportFiles.notFound);
      const file = await exportCampaignReport({ ...shared, campaignId, scope });
      if (!file) return refuse(404, t.exportFiles.notFound);
      return download(file);
    }
    case "import-errors": {
      const importId = url.searchParams.get("importId");
      if (!importId) return refuse(400, t.exportFiles.missingImport);
      if (!isUuid(importId)) return refuse(404, t.exportFiles.notFound);
      const file = await exportImportErrors({ ...shared, importId });
      if (!file) return refuse(404, t.exportFiles.notFound);
      return download(file);
    }
    case "contacts":
      return download(await exportContacts({ ...shared, scope }));
    case "suppression":
      return download(await exportSuppressions(shared));
    default:
      return refuse(400, t.exportFiles.unknownKind);
  }
}
