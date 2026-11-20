import "server-only";
import { NextResponse } from "next/server";
import type { ExportFile } from "@/server/domain/exports";
import type { Dictionary } from "@/i18n/dictionaries";

/**
 * Responses for the download links.
 *
 * A download is a plain link, so a refusal is a page the browser shows in
 * place of the file. It used to be JSON, in English whatever the reader's
 * language, with no way back.
 */

export function download(file: ExportFile): NextResponse {
  return new NextResponse(file.content, {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Where "Go back" leads: the page the link was on, when it was on this site,
 * or the given fallback. Only a path is kept, so the link cannot lead off-site.
 */
function backPath(request: Request, fallback: string): string {
  const referer = request.headers.get("referer");
  if (!referer) return fallback;
  try {
    const from = new URL(referer);
    const here = new URL(request.url);
    if (from.origin !== here.origin) return fallback;
    // A path starting // becomes a protocol-relative external URL in an href.
    if (from.pathname.startsWith("//") || from.pathname.includes("\\")) return fallback;
    return `${from.pathname}${from.search}`;
  } catch {
    return fallback;
  }
}

export function downloadRefused(input: {
  request: Request;
  status: number;
  message: string;
  t: Dictionary;
  tag: string;
  supportRef?: string;
  fallback: string;
}): NextResponse {
  const { t } = input;
  const reference = input.supportRef
    ? `<p class="ref">${escapeHtml(t.components.supportReference(input.supportRef))}</p>`
    : "";
  const html = `<!doctype html>
<html lang="${escapeHtml(input.tag)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(t.exportFiles.errorTitle)}</title>
<style>
  body { margin: 0; padding: 48px 16px; background: #ffffff; color: #1d2733;
         font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; }
  main { max-width: 560px; margin: 0 auto; }
  h1 { margin: 0 0 12px; font-size: 20px; font-weight: 600; }
  p { margin: 0 0 12px; font-size: 15px; line-height: 1.55; }
  .ref { color: #4b5b58; font-size: 13px; }
  a { color: #0b6b5f; font-weight: 600; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(t.exportFiles.errorTitle)}</h1>
<p>${escapeHtml(input.message)}</p>
${reference}
<p><a href="${escapeHtml(backPath(input.request, input.fallback))}">${escapeHtml(t.exportFiles.errorBack)}</a></p>
</main>
</body>
</html>
`;
  return new NextResponse(html, {
    status: input.status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
