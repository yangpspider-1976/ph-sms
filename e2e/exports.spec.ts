import { expect, test, type Page } from "@playwright/test";

/**
 * The export endpoint.
 *
 * Two gaps closed on 2 November 2026: the sample CSV template downloaded
 * without signing in, although the endpoint is meant to serve signed-in users
 * only; and a mistyped id in an export link reached the database, which
 * rejects a malformed uuid, so the link failed with a server error instead of
 * "not found".
 */

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill("owner@demo.test");
  await page.getByLabel("Password").fill("DemoPass123!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app\//);
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
