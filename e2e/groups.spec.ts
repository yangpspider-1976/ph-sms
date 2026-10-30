import { expect, test, type Page } from "@playwright/test";

/**
 * Contact groups, as someone who manages contacts.
 *
 * The group page renders an extra panel for that role, and it failed for them
 * from the first release until 30 October 2026: the server page reached into a
 * client component (`GroupMembers.AddPanel`), which a server component sees
 * only as a module reference, so React was handed `undefined` to render. No
 * test opened a group as an owner, so nothing caught it.
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

test("an owner can open a group and add a contact to it", async ({ page }) => {
  const name = `E2E group ${stamp()}`;
  await login(page, "owner@demo.test");

  await page.goto("/app/contacts/groups");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create group" }).click();
  await page.getByRole("link", { name }).click();

  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("Nobody in this group yet")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add contacts" })).toBeVisible();

  await page.locator("main").getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Add 1 to group" }).click();

  await expect(page.getByText("Added", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1 contact", exact: true })).toBeVisible();
});
