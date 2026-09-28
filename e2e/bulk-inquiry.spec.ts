import { expect, test, type Page } from "@playwright/test";

/**
 * Required test 14, inquiry path: a promotional request goes through the public
 * inquiry form and lands in the admin pipeline — and moving it along that
 * pipeline never queues an SMS.
 */

const PASSWORD = "DemoPass123!";

async function loginAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill("admin@phsms.test");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

test("a bulk inquiry reaches the admin pipeline without sending anything", async ({ page }) => {
  const company = `Bulk Co ${Date.now().toString(36)}`;

  /* --- Public form -------------------------------------------------------- */

  await page.goto("/bulk");
  await expect(page.getByRole("heading", { name: /Bulk and promotional/ })).toBeVisible();

  // The form refuses to take a recipient list, and says so.
  await expect(page.getByText("Do not send us your recipient list")).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);

  await page.getByLabel("Business name").fill(company);
  await page.getByLabel("Contact name").fill("Sample Contact");
  await page.getByLabel("Email").fill("contact@example.test");
  await page.getByLabel("Messages per send").fill("25000");
  await page.getByLabel("How often").fill("Monthly");
  await page.getByLabel("Message purpose").selectOption("PROMOTIONAL");
  await page
    .getByLabel("Who receives these messages?")
    .fill("Customers who opted in to marketing at checkout.");
  await page.getByLabel("How did they agree to hear from you?").fill("Checkout opt-in");
  await page
    .getByLabel("Sample message")
    .fill("Our sale runs until Sunday. Visit any branch for details.");

  await page.getByRole("button", { name: "Request a quote" }).click();
  await expect(page.getByText("Request received")).toBeVisible();

  /* --- It appears in the admin pipeline ----------------------------------- */

  await loginAdmin(page);
  await page.goto("/admin/inquiries");

  await expect(page.getByText(company).first()).toBeVisible();
  await expect(page.getByText("These are CRM records only")).toBeVisible();

  // Scope to this inquiry's card via an explicit hook rather than guessing at
  // the DOM shape.
  const card = page.locator(`[data-company="${company}"]`);
  await expect(card).toBeVisible();
  await expect(card.getByText("Promotional").first()).toBeVisible();

  /* --- Moving it to CONTRACTED does not send anything --------------------- */

  const before = await page.evaluate(async () => {
    const res = await fetch("/admin/activity");
    return res.status;
  });
  expect(before).toBe(200);

  await card.getByRole("combobox").selectOption("CONTRACTED");
  await card.getByRole("button", { name: "Update" }).click();

  await expect(page.getByText("No SMS was sent.").first()).toBeVisible();

  /* --- Confirm no campaign was created for it ----------------------------- */

  await page.goto("/admin/activity");
  await expect(page.getByRole("heading", { name: "SMS activity" })).toBeVisible();
  // The inquiry's company never appears as a campaign.
  await expect(page.getByText(company)).toHaveCount(0);
});
