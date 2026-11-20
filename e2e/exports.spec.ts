import { readFileSync } from "node:fs";
import { expect, test, type Page, type Request } from "@playwright/test";

/**
 * The export endpoint.
 *
 * Two gaps closed on 2 November 2026: the sample CSV template downloaded
 * without signing in, although the endpoint is meant to serve signed-in users
 * only; and a mistyped id in an export link reached the database, which
 * rejects a malformed uuid, so the link failed with a server error instead of
 * "not found".
 */

async function login(page: Page, email = "owner@demo.test") {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("DemoPass123!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/(app|admin)(\/|$)/);
}

/**
 * Fetches from inside the page, so the request carries the browser's session
 * as a click on the link would. Playwright's own request client leaves out
 * `Secure` cookies over plain http unless the host is "localhost", and this
 * suite is served on 127.0.0.1.
 */
async function fetchInPage(page: Page, path: string) {
  return page.evaluate(async (url) => {
    const response = await fetch(url);
    return {
      status: response.status,
      disposition: response.headers.get("content-disposition"),
      body: await response.text(),
    };
  }, path);
}

/**
 * Clicks a download button and returns the file, with every request the click
 * made to the export endpoint.
 *
 * Each request is an export in the audit log and counts against the hourly
 * limit, so a click must make exactly one. Until 13 November 2026 the buttons
 * were router links, and the router fetched each file once before downloading
 * it.
 */
async function clickDownload(page: Page, name: string) {
  const requests: string[] = [];
  const record = (request: Request) => {
    if (/\/(app|admin)\/exports/.test(request.url())) requests.push(request.url());
  };
  page.on("request", record);
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name, exact: true }).click();
  const download = await downloading;
  const content = readFileSync(await download.path(), "utf8");
  page.off("request", record);
  return { filename: download.suggestedFilename(), content, requests };
}

test("the sample CSV template needs a signed-in user", async ({ page }) => {
  await page.goto("/login");
  const signedOut = await fetchInPage(page, "/app/exports?kind=template");
  expect(signedOut.status).toBe(401);

  await login(page);
  const signedIn = await fetchInPage(page, "/app/exports?kind=template");
  expect(signedIn.status).toBe(200);
  expect(signedIn.disposition).toMatch(/^attachment; filename=".+\.csv"$/);
  expect(signedIn.body).toContain("phone_number");
});

test("a campaign's results download from its page, in one request", async ({ page }) => {
  await login(page);
  // Demo Business starts with no campaigns, so send one. Its name is left
  // empty, so the default name ends up in the file name.
  await page.goto("/app/send");
  await page.getByLabel("Mobile numbers").fill("+639170000811\n+639170000812");
  await page.getByRole("button", { name: "Continue to message" }).click();
  await page.getByLabel("Message", { exact: true }).fill("Your order is ready for pickup.");
  await page.getByLabel("I am authorized to contact these recipients.").check();
  await page.getByRole("button", { name: "Review message" }).click();
  await page.getByRole("button", { name: "Send 2 messages" }).click();
  await expect(page).toHaveURL(/\/app\/campaigns\/[0-9a-f-]+$/);
  // The page refreshes itself while messages are waiting; let it settle.
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Waiting", { exact: true })).toHaveCount(0);
  }).toPass({ timeout: 45_000 });
  const recipientRows = page.getByRole("row").filter({ hasText: /\+63 9\d\d \*\*\* \d{4}/ });
  await expect(recipientRows).toHaveCount(2);

  const { filename, content, requests } = await clickDownload(page, "Export");
  expect(filename).toMatch(/^campaign-send-[a-z0-9-]+-\d{4}(-\d{2}){5}\.csv$/);
  const lines = content.trim().split(/\r?\n/);
  expect(lines[0]).toContain("phone_number_masked");
  expect(lines).toHaveLength(3);
  expect(content).toContain("0811");
  expect(content).not.toMatch(/\+?639\d{9}/);
  expect(requests).toHaveLength(1);
});

test("the Contacts and opt-out exports each download in one request", async ({ page }) => {
  await login(page);
  for (const [path, name] of [
    ["/app/contacts", /^contacts-\d{4}(-\d{2}){5}\.csv$/],
    ["/app/contacts/opt-outs", /^opt-outs-\d{4}(-\d{2}){5}\.csv$/],
  ] as const) {
    await page.goto(path);
    const { filename, requests } = await clickDownload(page, "Export");
    expect(filename, path).toMatch(name);
    expect(requests, path).toHaveLength(1);
  }
});

test("an export link with a mistyped id is not found, not a server error", async ({ page }) => {
  await login(page);

  for (const path of [
    "/app/exports?kind=campaign&campaignId=abc",
    "/app/exports?kind=import-errors&importId=abc",
  ]) {
    const response = await fetchInPage(page, path);
    expect(response.status, path).toBe(404);
  }
});

test("Reports exports the chosen range and rejects invalid ranges", async ({ page }) => {
  await login(page);
  await page.goto("/app/reports?from=2020-01-01&to=2020-01-31");
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
  await expect(page.getByText("No campaigns in this range", { exact: true })).toBeVisible();
  const file = await clickDownload(page, "Download filtered report");
  expect(file.filename).toBe("reports-2020-01-01-2020-01-31.csv");
  expect(file.requests).toHaveLength(1);
  expect(file.content.trim().split(/\r?\n/)).toHaveLength(1);
  expect(file.content).toContain("Maximum authorized");
  const invalid = await fetchInPage(page, "/app/exports?kind=reports&from=2026-02-31&to=2026-03-01");
  expect(invalid.status).toBe(400);
});

test("admin overview report downloads once and includes aggregate columns", async ({ page }) => {
  await login(page, "admin@phsms.test");
  await page.goto("/admin");
  const file = await clickDownload(page, "Export report");
  expect(file.requests).toHaveLength(1);
  expect(file.filename).toMatch(/^all-campaigns-/);
  expect(file.content).toContain("organization");
  expect(file.content).not.toMatch(/\+?639\d{9}/);
});

test("Korean downloads and refused download pages use Korean", async ({ page }) => {
  await login(page);
  await page.goto("/app/reports");
  await page.getByLabel("Change language").selectOption("ko");
  await expect(page.getByRole("heading", { name: "보고서", exact: true })).toBeVisible();
  const contacts = await fetchInPage(page, "/app/exports?kind=contacts");
  expect(contacts.status).toBe(200);
  expect(contacts.body).toContain("전화번호(마스킹)");
  expect(contacts.body).not.toContain("phone_number_masked");
  const report = await clickDownload(page, "필터된 보고서 다운로드");
  expect(report.content).toContain("최대 승인 금액");
  expect(report.requests).toHaveLength(1);
  const refused = await fetchInPage(page, "/app/exports?kind=campaign&campaignId=abc");
  expect(refused.status).toBe(404);
  expect(refused.body).toContain('lang="ko-KR"');
});
