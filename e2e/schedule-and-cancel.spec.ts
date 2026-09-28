import { expect, test, type Page } from "@playwright/test";

/**
 * Required test 14, scheduling path: schedule a campaign for later, confirm it
 * is not dispatched, then stop it and check the report is honest about what was
 * prevented.
 *
 * Uses the seeded Demo Business, which already has an approved sender.
 */

const OWNER = "owner@demo.test";
const PASSWORD = "DemoPass123!";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard/);
}

/** A local datetime string a few hours ahead, in the shape the input expects. */
function laterToday(): string {
  const at = new Date(Date.now() + 6 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

test("a scheduled campaign waits, and stopping it reports truthfully", async ({ page }) => {
  await login(page, OWNER);

  await page.goto("/app/send");
  await page
    .getByLabel("Mobile numbers")
    .fill(["+639170000701", "+639170000702", "+639170000703"].join("\n"));
  await page.getByRole("button", { name: "Continue to message" }).click();

  await page.getByLabel("Message").fill("Reminder: your appointment is tomorrow at 10am.");

  // Schedule rather than send now.
  await page.getByLabel("Schedule for later").check();
  await page.getByLabel("Scheduled date and time").fill(laterToday());

  await page.getByLabel("I am authorized to contact these recipients.").check();
  await page.getByRole("button", { name: "Review message" }).click();

  await expect(page.getByRole("heading", { name: "Review and confirm" })).toBeVisible();
  // The review states when it will go, in Asia/Manila.
  await expect(page.getByText("(Asia/Manila)").first()).toBeVisible();

  await page.getByRole("button", { name: /^Schedule \d+ messages$/ }).click();
  await expect(page).toHaveURL(/\/app\/campaigns\/[0-9a-f-]+/);

  /* --- It is scheduled, and the worker leaves it alone ------------------- */

  await expect(page.getByText("Scheduled").first()).toBeVisible();
  // Funds are already held for a scheduled send.
  await expect(page.getByText("Recipients included").first()).toBeVisible();

  // Nothing should be accepted: its time has not come.
  await expect(page.getByText("Waiting").first()).toBeVisible();

  await page.goto("/app/campaigns?filter=scheduled");
  await expect(page.getByRole("heading", { name: "Campaigns" })).toBeVisible();
  await expect(page.getByText("Scheduled").first()).toBeVisible();

  /* --- Stop it ----------------------------------------------------------- */

  await page.goBack();
  await page.getByRole("button", { name: "Stop campaign" }).click();
  await page.getByRole("button", { name: "Yes, stop" }).click();

  // The report persists on the campaign page rather than vanishing with the
  // button that triggered it.
  await expect(page.getByText("Campaign stopped").first()).toBeVisible();
  // All three were prevented, because none had reached the provider.
  await expect(page.getByText("3 messages prevented")).toBeVisible();
  await page.reload();
  await expect(page.getByText("3 messages prevented")).toBeVisible();

  /* --- The hold came back ------------------------------------------------ */

  await page.goto("/app/credits");
  await expect(page.getByText("Hold released").first()).toBeVisible();
});
