import { expect, test } from "@playwright/test";

/**
 * Localization, end to end.
 *
 * The dictionary tests prove the strings exist and are translated; these prove
 * a person can actually get to them — that the switcher changes the page, that
 * the choice survives navigation, and that `lang` follows so a screen reader
 * picks the right voice.
 *
 * The switcher is found by its own label, which is itself translated. That is
 * deliberate: a Korean reader looking for the language control sees Korean, so
 * a test that always looked for the English name would be testing something no
 * Korean speaker ever sees.
 */

/** The switcher's accessible name, in each language. */
const SWITCHER = { en: "Change language", ko: "언어 변경" } as const;

test("a visitor can switch the site to Korean and it sticks", async ({ page }) => {
  await page.goto("/pricing");

  await expect(page.getByRole("heading", { name: "Pricing" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-PH");

  await page.getByLabel(SWITCHER.en).selectOption("ko");

  // The page it was on is now Korean, without a manual reload.
  await expect(page.getByRole("heading", { name: "요금" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ko-KR");

  // And the choice survives moving to another page.
  await page.goto("/how-it-works");
  await expect(page.getByRole("heading", { name: "이용 방법" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ko-KR");

  // Switching back works the same way — and the control itself is translated,
  // so it has to be found by its Korean name now.
  await page.getByLabel(SWITCHER.ko).selectOption("en");
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-PH");
});

test("a Korean-speaking visitor gets Korean on their first visit", async ({ browser }) => {
  // No cookie, only the browser's stated preference.
  const context = await browser.newContext({ locale: "ko-KR" });
  const page = await context.newPage();

  await page.goto("/pricing");

  await expect(page.locator("html")).toHaveAttribute("lang", "ko-KR");
  await expect(page.getByRole("heading", { name: "요금" })).toBeVisible();

  await context.close();
});

test("an explicit choice outranks the browser preference", async ({ browser }) => {
  const context = await browser.newContext({ locale: "ko-KR" });
  const page = await context.newPage();

  await page.goto("/pricing");
  // The page arrives in Korean because of the browser preference, so the
  // control is labelled in Korean before the choice is made.
  await page.getByLabel(SWITCHER.ko).selectOption("en");
  await expect(page.getByRole("heading", { name: "Pricing" })).toBeVisible();

  // Korean is still what the browser asks for, and English is still what the
  // person chose — the cookie has to win or the switcher is useless to them.
  await page.goto("/how-it-works");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-PH");
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();

  await context.close();
});

test("the signed-in app is translated too, not just the marketing site", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Work email").fill("owner@demo.test");
  await page.getByLabel("Password").fill("DemoPass123!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard/);

  await page.getByLabel(SWITCHER.en).selectOption("ko");

  // Navigation, page chrome and the dashboard's own copy all follow.
  await expect(page.getByRole("link", { name: "대시보드" })).toBeVisible();
  await expect(page.getByText("사용 가능 크레딧").first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ko-KR");
});
