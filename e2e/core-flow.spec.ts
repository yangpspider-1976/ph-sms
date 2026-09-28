import { expect, test, type Page } from "@playwright/test";

/**
 * Required test 14 — the core journey, in a real browser:
 *
 *   signup → demo email verification → admin business approval → demo funding
 *   → sender approval → CSV preview → reviewed send → mock results → ledger
 *
 * The dispatch worker is running (started by the global setup), so the results
 * this asserts are produced by the same code path production would use, not by
 * a test helper writing rows.
 */

const PASSWORD = "DemoPass123!";
const DEMO_PASSWORD = "DemoPass123!";

/** Unique per run so the suite can be run repeatedly without a reseed. */
const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

async function logout(page: Page) {
  // No logout control is built yet; clearing the cookie is equivalent.
  await page.context().clearCookies();
}

test.describe("core journey", () => {
  test("a new business signs up, is approved, and sends a campaign", async ({ page }) => {
    const id = stamp();
    const email = `owner-${id}@example.test`;
    const company = `E2E Traders ${id}`;
    const senderId = `E2E${id.slice(0, 5).toUpperCase()}`;

    /* --- 1. Signup ----------------------------------------------------- */

    await page.goto("/signup");
    await page.getByLabel("Your name").fill("E2E Owner");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByLabel("Registered business name").fill(company);
    await page.getByLabel("SEC / DTI registration no.").fill(`E2E-${id}`);
    await page.getByLabel("Business address").fill("1 Sample Street, Makati City");
    await page.getByLabel("Industry").fill("Retail");
    await page
      .getByLabel("What do you intend to send?")
      .fill("Order and delivery updates to customers who opted in at checkout.");
    await page.getByRole("button", { name: "Submit for review" }).click();

    await expect(page).toHaveURL(/\/verify-email/);
    await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();

    /* --- 2. Verify the email through the local mail sink ---------------- */

    // Nothing is emailed in mock mode; the sink shows the link instead.
    await expect(page.getByText("Local mail sink (demo)").first()).toBeVisible();
    await page.getByRole("link", { name: "Open verification link" }).first().click();
    await expect(page.getByText("Your email address is verified.").first()).toBeVisible();

    /* --- 3. Signed in, but not yet approved ----------------------------- */

    await login(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/app\/account-status/);
    await expect(page.getByText("Your business is being reviewed").first()).toBeVisible();
    await logout(page);

    /* --- 4. A platform admin approves the business ---------------------- */

    await login(page, "admin@phsms.test");
    await expect(page).toHaveURL(/\/admin/);

    await page.goto("/admin/verification");
    const queueRow = page.locator("div").filter({ hasText: company }).last();
    await expect(queueRow).toBeVisible();

    // Approve is the default decision; record it for this business.
    await page.getByRole("button", { name: new RegExp(`Record for E2E`) }).first().click();
    await expect(page.getByText("Recorded", { exact: false }).first()).toBeVisible();
    await logout(page);

    /* --- 5. Approval granted demo funding ------------------------------- */

    await login(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/app\/dashboard/);
    await expect(page.getByText("Available credit").first()).toBeVisible();
    // Approval credits demo funding, so the balance is no longer zero.
    await expect(page.getByText("₱1,000.00").first()).toBeVisible();

    /* --- 6. Apply for a sender identity and approve it in demo mode ----- */

    await page.goto("/app/settings/senders");
    await expect(page.getByText("You cannot send yet").first()).toBeVisible();

    await page.getByLabel("Sender ID").fill(senderId);
    await page
      .getByLabel("How does this relate to your business?")
      .fill("This is our registered trading name, used on our storefront and receipts.");
    await page.getByRole("button", { name: "Apply for review" }).click();
    await expect(page.getByText("Submitted for review").first()).toBeVisible();

    await page.getByTestId("demo-approve-sender").first().click();
    await expect(page.getByText("Approved", { exact: false }).first()).toBeVisible();

    /* --- 7. Compose a send with recipients pasted in -------------------- */

    await page.goto("/app/send");
    await expect(page.getByRole("heading", { name: "Send SMS" })).toBeVisible();

    // One ordinary number, one the mock provider rejects, one duplicate.
    await page.getByLabel("Mobile numbers").fill(
      ["+639170000801", "+639170009001", "+639170000801", "not-a-number"].join("\n"),
    );

    // The preview reports the exclusions before anything is priced.
    await expect(page.getByText("Rows entered").first()).toBeVisible();
    await page.getByRole("button", { name: "Continue to message" }).click();

    await page
      .getByLabel("Message")
      .fill("Your order is ready for pickup until 8pm today. Thank you!");

    await page.getByLabel("I am authorized to contact these recipients.").check();
    await page.getByRole("button", { name: "Review message" }).click();

    /* --- 8. The quote is the binding offer ------------------------------ */

    await expect(page.getByRole("heading", { name: "Review and confirm" })).toBeVisible();
    await expect(page.getByText("Maximum authorized cost").first()).toBeVisible();
    await expect(page.getByText("Excluded before pricing", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: /^Send \d+ messages$/ }).click();

    /* --- 9. Results, produced by the real worker ------------------------ */

    await expect(page).toHaveURL(/\/app\/campaigns\/[0-9a-f-]+/);
    await expect(page.getByText("Accepted by provider").first()).toBeVisible();

    // The worker polls once a second; give it room, then reload.
    await expect(async () => {
      await page.reload();
      await expect(page.getByText("Accepted by provider").first()).toBeVisible();
      // The good number is accepted; the 9001 number is rejected by the mock.
      await expect(page.getByText("Rejected").first()).toBeVisible();
    }).toPass({ timeout: 45_000 });

    // Accepted is not claimed as delivered.
    await expect(
      page.getByText("Finished means no dispatch work remains").first(),
    ).toBeVisible();

    /* --- 10. The ledger reconciles -------------------------------------- */

    await page.goto("/app/credits");
    await expect(page.getByRole("heading", { name: "Credits & billing" })).toBeVisible();
    await expect(page.getByText("Held for sends").first()).toBeVisible();

    // A hold, a charge for the accepted message and a release for the rejected.
    await expect(page.getByText("Held for a send").first()).toBeVisible();
    await expect(page.getByText("Charged for messages").first()).toBeVisible();
    await expect(page.getByText("Hold released").first()).toBeVisible();
  });
});
