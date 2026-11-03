import { expect, test, type Page } from "@playwright/test";

/**
 * Message templates, as someone who manages them.
 *
 * Saving under a name that already exists adds a version. Until 2 November
 * 2026 every version was listed, on the templates page and in the send wizard,
 * so a template saved twice appeared twice; and there was no way to remove one.
 */

/** Unique per run so the suite can be run repeatedly without a reseed. */
const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("DemoPass123!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

async function saveTemplate(page: Page, name: string, body: string) {
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Message").fill(body);
  await page.getByRole("button", { name: "Save template" }).click();
}

/** Opens the message step of the send wizard, where templates are offered. */
async function openMessageStep(page: Page) {
  await page.goto("/app/send");
  await page.getByLabel("Mobile numbers").fill("+639170000801");
  await page.getByRole("button", { name: "Continue to message" }).click();
  await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
}

test("a template saved twice is offered once, and can be removed", async ({ page }) => {
  const name = `E2E template ${stamp()}`;
  await login(page, "owner@demo.test");
  await page.goto("/app/templates");

  const entry = page.getByRole("listitem").filter({ hasText: name });

  await saveTemplate(page, name, "Doors open at 9am.");
  await expect(entry).toContainText("Version 1");
  await saveTemplate(page, name, "Doors open at 10am today.");
  await expect(entry).toContainText("Version 2");

  // One entry, with the latest text.
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText("Doors open at 10am today.");
  await expect(entry).not.toContainText("9am");

  // The send wizard offers it once too, with the same text.
  await openMessageStep(page);
  const chip = page.getByRole("button", { name, exact: true });
  await expect(chip).toHaveCount(1);
  await chip.click();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("Doors open at 10am today.");

  // Removing asks first, then takes it off the page.
  await page.goto("/app/templates");
  await entry.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(entry).toContainText("Messages already sent with it are not affected.");
  await entry.getByRole("button", { name: "Remove template" }).click();
  await expect(entry).toHaveCount(0);

  // An older version does not come back in its place, here or in the wizard.
  await page.reload();
  await expect(page.getByText(name)).toHaveCount(0);
  await openMessageStep(page);
  await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
});

test("someone who can only view templates is not offered Remove", async ({ page }) => {
  await login(page, "viewer@demo.test");
  await page.goto("/app/templates");

  await expect(page.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
});
