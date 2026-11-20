import type { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/context";
import { exportAdminCampaigns } from "@/server/domain/exports";
import { checkRateLimit } from "@/server/security/rate-limit";
import { download, downloadRefused } from "@/server/download-response";
import { getI18n } from "@/i18n/server";
import { localizeServerText } from "@/i18n/server-text";

/**
 * The admin console's downloads. Platform admins only: anyone else is sent
 * away by requirePlatformAdmin, as from every admin page.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const admin = await requirePlatformAdmin();
  const { t, locale, tag } = await getI18n();
  const kind = new URL(request.url).searchParams.get("kind") ?? "";

  const refuse = (status: number, message: string) =>
    downloadRefused({ request, status, message, t, tag, fallback: "/admin" });

  // Limited per admin, as customer exports are per organization.
  const limit = await checkRateLimit("export", `admin:${admin.id}`);
  if (!limit.allowed) return refuse(429, localizeServerText(limit.message, t));

  switch (kind) {
    case "campaigns":
      return download(await exportAdminCampaigns({ actorUserId: admin.id, t, locale }));
    default:
      return refuse(400, t.exportFiles.unknownKind);
  }
}
