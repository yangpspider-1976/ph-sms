import { expect, test, type Page } from "@playwright/test";

/**
 * Responsive layout.
 *
 * Checks the thing that actually breaks on a phone: horizontal overflow. A
 * page the user has to scroll sideways to read is the common failure, and it
 * is invisible on a desktop.
 *
 * Wide content — tables, the audit log — is allowed to scroll, but only inside
 * its own container, never by pushing the page body sideways.
 */

const VIEWPORTS = [
  { name: "phone", width: 375, height: 812 },   // iPhone-class
  { name: "tablet", width: 768, height: 1024 },
];

const PASSWORD = "DemoPass123!";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(app|admin)/);
}

/** True when the document itself scrolls sideways. */
async function bodyOverflows(page: Page): Promise<{ overflows: boolean; by: number }> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const overflow = doc.scrollWidth - doc.clientWidth;
    // A pixel or two is rounding, not a layout fault.
    return { overflows: overflow > 2, by: overflow };
  });
}

/** Elements sticking out past the viewport, ignoring ones in a scroll container. */
async function offendingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const bad: string[] = [];

    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.right <= viewport + 2) continue;

      // Allowed if it or an ancestor scrolls horizontally on purpose.
      let node: HTMLElement | null = el;
      let excused = false;
      while (node && node !== document.body) {
        const overflowX = window.getComputedStyle(node).overflowX;
        if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden") {
          excused = true;
          break;
        }
        node = node.parentElement;
      }
      if (excused) continue;

      const label =
        el.tagName.toLowerCase() +
        (el.className && typeof el.className === "string"
          ? `.${el.className.split(/\s+/).slice(0, 3).join(".")}`
          : "");
      bad.push(`${label} (right edge ${Math.round(rect.right)}px > ${viewport}px)`);
      if (bad.length >= 5) break;
    }
    return bad;
  });
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width}px)`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("public pages do not scroll sideways", async ({ page }) => {
      for (const path of ["/", "/pricing", "/bulk", "/login", "/signup"]) {
        await page.goto(path);
        await page.locator("h1").first().waitFor({ state: "visible" });
        const { overflows, by } = await bodyOverflows(page);
        if (overflows) {
          const offenders = await offendingElements(page);
          throw new Error(
            `${path} overflows by ${by}px at ${viewport.width}px:\n  ${offenders.join("\n  ")}`,
          );
        }
      }
    });

    test("customer portal does not scroll sideways", async ({ page }) => {
      await login(page, "owner@demo.test");
      for (const path of [
        "/app/dashboard",
        "/app/send",
        "/app/campaigns",
        "/app/contacts",
        "/app/credits",
        "/app/settings/team",
      ]) {
        await page.goto(path);
        await page.locator("h1").first().waitFor({ state: "visible" });
        const { overflows, by } = await bodyOverflows(page);
        if (overflows) {
          const offenders = await offendingElements(page);
          throw new Error(
            `${path} overflows by ${by}px at ${viewport.width}px:\n  ${offenders.join("\n  ")}`,
          );
        }
      }
    });

    test("admin console does not scroll sideways", async ({ page }) => {
      await login(page, "admin@phsms.test");
      for (const path of ["/admin", "/admin/customers", "/admin/audit", "/admin/settings"]) {
        await page.goto(path);
        await page.locator("h1").first().waitFor({ state: "visible" });
        const { overflows, by } = await bodyOverflows(page);
        if (overflows) {
          const offenders = await offendingElements(page);
          throw new Error(
            `${path} overflows by ${by}px at ${viewport.width}px:\n  ${offenders.join("\n  ")}`,
          );
        }
      }
    });
  });
}

test.describe("phone usability", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the send wizard is usable on a phone", async ({ page }) => {
    await login(page, "owner@demo.test");
    await page.goto("/app/send");

    // The primary control must be reachable without sideways scrolling.
    const field = page.getByLabel("Mobile numbers");
    await expect(field).toBeVisible();
    await field.fill("+639170000905");
    await expect(page.getByText("Rows entered").first()).toBeVisible();

    const button = page.getByRole("button", { name: "Continue to message" });
    await expect(button).toBeVisible();

    // And it must not be pushed off-screen.
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375 + 2);
  });

  test("wide tables scroll inside their own container", async ({ page }) => {
    await login(page, "admin@phsms.test");
    await page.goto("/admin/audit");
    await page.locator("h1").first().waitFor({ state: "visible" });

    // The page must not scroll, even though the table is wider than the screen.
    const { overflows } = await bodyOverflows(page);
    expect(overflows).toBe(false);
  });
});
