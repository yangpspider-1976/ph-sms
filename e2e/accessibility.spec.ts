import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility audit.
 *
 * An automated scan finds roughly a third of real accessibility problems — it
 * catches contrast, labelling and structure, and cannot tell whether the page
 * makes sense read aloud. Passing this is a floor, not a certificate.
 *
 * Scoped to WCAG 2.1 A and AA, which is the usual procurement bar.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const PASSWORD = "DemoPass123!";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(app|admin)/);
}

async function scan(page: Page, path: string) {
  await page.goto(path);
  // Not networkidle: the App Router keeps connections open, so it never
  // settles. Waiting for the page's own heading is both faster and reliable.
  await page.locator("h1").first().waitFor({ state: "visible" });

  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  if (results.violations.length > 0) {
    const summary = results.violations
      .map(
        (v) =>
          `  [${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes
            .slice(0, 3)
            .map((n) => n.target.join(" "))
            .join("\n    ")}`,
      )
      .join("\n");
    throw new Error(`${results.violations.length} violation(s) on ${path}:\n${summary}`);
  }
}

test.describe("public pages", () => {
  for (const path of ["/", "/pricing", "/bulk", "/legal/privacy", "/login", "/signup"]) {
    test(`${path} has no WCAG A/AA violations`, async ({ page }) => {
      await scan(page, path);
    });
  }
});

test.describe("customer portal", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "owner@demo.test");
  });

  for (const path of [
    "/app/dashboard",
    "/app/send",
    "/app/campaigns",
    "/app/contacts",
    "/app/contacts/opt-outs",
    "/app/templates",
    "/app/credits",
    "/app/settings/team",
    "/app/settings/senders",
  ]) {
    test(`${path} has no WCAG A/AA violations`, async ({ page }) => {
      await scan(page, path);
    });
  }
});

test.describe("admin console", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "admin@phsms.test");
  });

  for (const path of [
    "/admin",
    "/admin/customers",
    "/admin/verification",
    "/admin/activity",
    "/admin/inquiries",
    "/admin/senders",
    "/admin/credits",
    "/admin/suppression",
    "/admin/audit",
    "/admin/settings",
  ]) {
    test(`${path} has no WCAG A/AA violations`, async ({ page }) => {
      await scan(page, path);
    });
  }
});

test.describe("keyboard operation", () => {
  test("the send wizard is reachable and operable by keyboard alone", async ({ page }) => {
    await login(page, "owner@demo.test");
    await page.goto("/app/send");

    // Tab until the recipients field has focus, then type into it.
    let focused = "";
    for (let i = 0; i < 40 && focused !== "numbers"; i += 1) {
      await page.keyboard.press("Tab");
      focused = await page.evaluate(() => document.activeElement?.id ?? "");
    }
    expect(focused).toBe("numbers");

    await page.keyboard.type("+639170000901");
    await expect(page.getByText("Rows entered").first()).toBeVisible();
  });

  test("focus is visible on interactive elements", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Work email").focus();

    // A visible focus indicator: something must change from the resting state.
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const style = window.getComputedStyle(el);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
      };
    });

    const hasIndicator =
      (outline.outlineStyle !== "none" && outline.outlineWidth !== "0px") ||
      (outline.boxShadow !== "none" && outline.boxShadow !== "");
    expect(hasIndicator).toBe(true);
  });
});
