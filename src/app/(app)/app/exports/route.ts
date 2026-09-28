import { NextResponse } from "next/server";
import { authorize } from "@/server/auth/context";
import {
  contactTemplate,
  exportCampaignReport,
  exportContacts,
  exportImportErrors,
  exportSuppressions,
  type ExportFile,
} from "@/server/domain/exports";
import { checkRateLimit } from "@/server/security/rate-limit";

/**
 * Export endpoint.
 *
 * Served behind the session, never from a public URL, and the full-number scope
 * needs the owner-only permission. The response is marked no-store so the file
 * is not left in a shared cache.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "";
  const scope = url.searchParams.get("scope") === "full" ? "FULL" : "MASKED";

  // The template contains no customer data, so it only needs a signed-in user.
  if (kind === "template") return download(contactTemplate());

  // Revealing full numbers is a separate permission from viewing a report.
  const permission = scope === "FULL" ? "reports.export.full" : "reports.export.masked";
  const auth = await authorize(permission);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error.message, supportRef: auth.error.supportRef },
      { status: auth.error.code === "NOT_AUTHENTICATED" ? 401 : 403 },
    );
  }

  // Exports carry customer data out of the system, so they are limited even
  // for an authorised user.
  const limit = await checkRateLimit("export", auth.ctx.org.organizationId);
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.message }, { status: 429 });
  }

  const shared = {
    organizationId: auth.ctx.org.organizationId,
    actorUserId: auth.ctx.user.id,
  };

  switch (kind) {
    case "campaign": {
      const campaignId = url.searchParams.get("campaignId");
      if (!campaignId) return NextResponse.json({ error: "Missing campaign" }, { status: 400 });
      const file = await exportCampaignReport({ ...shared, campaignId, scope });
      if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return download(file);
    }
    case "import-errors": {
      const importId = url.searchParams.get("importId");
      if (!importId) return NextResponse.json({ error: "Missing import" }, { status: 400 });
      const file = await exportImportErrors({ ...shared, importId });
      if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return download(file);
    }
    case "contacts":
      return download(await exportContacts({ ...shared, scope }));
    case "suppression":
      return download(await exportSuppressions(shared));
    default:
      return NextResponse.json({ error: "Unknown export" }, { status: 400 });
  }
}

function download(file: ExportFile): NextResponse {
  return new NextResponse(file.content, {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
