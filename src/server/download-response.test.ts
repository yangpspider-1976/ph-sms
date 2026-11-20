import { describe, expect, it } from "vitest";
import { downloadRefused } from "./download-response";
import { en } from "@/i18n/locales/en";
import { ko } from "@/i18n/locales/ko";

/**
 * A refused download. It used to be JSON in English, shown raw by the browser
 * because the download is a plain link.
 */

const request = (referer?: string) =>
  new Request("http://127.0.0.1:3311/app/exports?kind=contacts", {
    headers: referer ? { referer } : {},
  });

describe("a refused download", () => {
  it("is a page in the reader's language, with the reason and a way back", async () => {
    const response = downloadRefused({
      request: request("http://127.0.0.1:3311/app/contacts?tab=opt-outs"),
      status: 429,
      message: "내보내기 요청이 너무 많습니다 <잠시 후>",
      t: ko,
      tag: "ko-KR",
      fallback: "/app/dashboard",
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const html = await response.text();
    expect(html).toContain('<html lang="ko-KR">');
    expect(html).toContain(ko.exportFiles.errorTitle);
    expect(html).toContain("내보내기 요청이 너무 많습니다 &lt;잠시 후&gt;");
    expect(html).toContain('href="/app/contacts?tab=opt-outs"');
    expect(html).toContain(ko.exportFiles.errorBack);
  });

  it("never links back off the site", async () => {
    const response = downloadRefused({
      request: request("https://elsewhere.example/page"),
      status: 404,
      message: en.exportFiles.notFound,
      t: en,
      tag: "en-PH",
      fallback: "/app/dashboard",
    });
    expect(await response.text()).toContain('href="/app/dashboard"');
  });

  it("gives the support reference when there is one", async () => {
    const response = downloadRefused({
      request: request(),
      status: 403,
      message: "No.",
      t: en,
      tag: "en-PH",
      supportRef: "REF-123",
      fallback: "/app/dashboard",
    });
    expect(await response.text()).toContain(en.components.supportReference("REF-123"));
  });

  it("refuses a same-origin referrer whose path would become an external link", async () => {
    const response = downloadRefused({
      request: request("http://127.0.0.1:3311//elsewhere.example/page"),
      status: 404,
      message: en.exportFiles.notFound,
      t: en,
      tag: "en-PH",
      fallback: "/app/dashboard",
    });
    expect(await response.text()).toContain('href="/app/dashboard"');
  });
});
