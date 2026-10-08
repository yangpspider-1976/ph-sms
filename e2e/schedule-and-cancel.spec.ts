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

/**
 * What a clock in Manila reads `hours` from now, in the shape the input
 * expects. The field takes Manila time whatever zone this machine is in, and
 * Manila is UTC+8 all year, so shifting by eight hours and reading the UTC
 * fields gives its wall clock.
 */
function manilaInput(hours: number): string {
  return new Date(Date.now() + (hours + 8) * 3600_000).toISOString().slice(0, 16);
}

/** Fills the wizard as far as the send-time choice. */
async function composeUpToSendTime(page: Page, numbers: string[], message: string) {
  await page.goto("/app/send");
  await page.getByLabel("Mobile numbers").fill(numbers.join("\n"));
  await page.getByRole("button", { name: "Continue to message" }).click();
  await page.getByLabel("Message").fill(message);
}

test("a scheduled campaign waits, and stopping it reports truthfully", async ({ page }) => {
  await login(page, OWNER);

  await composeUpToSendTime(
    page,
    ["+639170000701", "+639170000702", "+639170000703"],
    "Reminder: your appointment is tomorrow at 10am.",
  );

  // Schedule rather than send now.
  await page.getByLabel("Schedule for later").check();
  await page.getByLabel("Scheduled date and time").fill(manilaInput(6));

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

for (const timezoneId of ["Asia/Seoul", "America/Los_Angeles"]) {
  test(`a time typed on a computer set to ${timezoneId} is still Manila time`, async ({ browser }) => {
    // The field is labelled Asia/Manila but used to take the computer's own
    // zone: 2:00 PM typed in Seoul was scheduled for 1:00 PM in Manila, and
    // from Los Angeles for 5:00 the next morning.
    const context = await browser.newContext({ timezoneId });
    const page = await context.newPage();
    await login(page, OWNER);

    await composeUpToSendTime(page, ["+639170000704"], "Your order is ready for pickup.");
    await page.getByLabel("Schedule for later").check();
    await page.getByLabel("Scheduled date and time").fill(`${manilaInput(24).slice(0, 10)}T14:00`);
    await page.getByLabel("I am authorized to contact these recipients.").check();
    await page.getByRole("button", { name: "Review message" }).click();

    await expect(page.getByRole("heading", { name: "Review and confirm" })).toBeVisible();
    await expect(page.getByText(/2:00\sPM \(Asia\/Manila\)/).first()).toBeVisible();
    await context.close();
  });
}

test("scheduling for later needs a time before it can be reviewed", async ({ page }) => {
  // With the box ticked and the time left empty, the review used to open as an
  // immediate send: the choice to schedule was dropped without a word.
  await login(page, OWNER);

  await composeUpToSendTime(page, ["+639170000704"], "Your order is ready for pickup.");
  await page.getByLabel("I am authorized to contact these recipients.").check();
  const review = page.getByRole("button", { name: "Review message" });
  await expect(review).toBeEnabled();

  await page.getByLabel("Schedule for later").check();
  await expect(review).toBeDisabled();

  await page.getByLabel("Scheduled date and time").fill(manilaInput(6));
  await expect(review).toBeEnabled();

  // Sending now never needed one.
  await page.getByLabel("Scheduled date and time").fill("");
  await expect(review).toBeDisabled();
  await page.getByLabel("Send now").check();
  await expect(review).toBeEnabled();
});
