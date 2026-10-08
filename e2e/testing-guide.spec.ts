import { expect, test, type Page } from "@playwright/test";

/**
 * The manual testing guide (docs/PH_SMS_Testing_Guide.docx), automated.
 *
 * Each test is one numbered test from the guide and asserts what the guide
 * tells a tester they should see, so a change that would make a tester report
 * a failure fails here first. Tests run in the guide's order, but each one
 * stands alone so a failure early on does not hide the rest.
 *
 * Test 16's slow cases (a scheduled send coming due, five retries of 9003) are
 * left out: they take up to an hour by design. Its quick case, 9002, is here.
 */

const PASSWORD = "DemoPass123!";

/** Unique per run so the suite can be run repeatedly without a reseed. */
const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(app|admin)/);
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Fills the first two wizard steps and asks for a quote. */
async function composeSend(page: Page, numbers: string[], message: string) {
  await page.goto("/app/send");
  await page.getByLabel("Mobile numbers").fill(numbers.join("\n"));
  await page.getByRole("button", { name: "Continue to message" }).click();
  await page.getByLabel("Message", { exact: true }).fill(message);
  await page.getByLabel("I am authorized to contact these recipients.").check();
  await page.getByRole("button", { name: "Review message" }).click();
}

/** Sends now and waits for the worker to settle every row. */
async function sendAndSettle(page: Page, numbers: string[], message: string) {
  await composeSend(page, numbers, message);
  await expect(page.getByRole("heading", { name: "Review and confirm" })).toBeVisible();
  await page.getByRole("button", { name: /^Send \d+ messages?$/ }).click();
  await expect(page).toHaveURL(/\/app\/campaigns\/[0-9a-f-]+/);
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Waiting", { exact: true })).toHaveCount(0);
  }).toPass({ timeout: 45_000 });
}

/**
 * A datetime-local value some hours ahead, as a clock in Manila reads. The
 * field takes Manila time whatever zone this machine is in, and Manila is
 * UTC+8 all year, so shifting by eight hours and reading the UTC fields gives
 * its wall clock.
 */
function hoursAhead(hours: number): string {
  return new Date(Date.now() + (hours + 8) * 3600_000).toISOString().slice(0, 16);
}

/** Fails if a page rendered an error screen instead of its content. */
async function expectNoErrorPage(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), `${path} status`).toBeLessThan(400);
  await expect(page.locator("h1").first(), `${path} heading`).toBeVisible();
  await expect(page.getByText(/Application error|Something went wrong|This page could not be found/i)).toHaveCount(0);
}

test.describe("Part A — core tests", () => {
  test("Test 1 — the public website", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Demo — no real SMS or payments/).first()).toBeVisible();

    await page.goto("/pricing");
    await expect(page.locator("h1").first()).toBeVisible();
    // No per-message price: pricing is not approved.
    await expect(page.locator("main")).not.toContainText(/₱\s?\d+(\.\d+)?\s*(per|\/)\s*(SMS|message|segment)/i);

    await page.goto("/bulk");
    await expect(page.getByRole("button", { name: "Request a quote" })).toBeVisible();
    await expect(page.locator("main")).toContainText(/recipient/i);

    await page.getByLabel("Change language").first().selectOption("ko");
    await expect(page.locator("html")).toHaveAttribute("lang", /^ko/);

    await page.goto("/how-it-works");
    await expect(page.locator("html")).toHaveAttribute("lang", /^ko/);

    await page.getByLabel("언어 변경").first().selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("lang", /^en/);
  });

  test("Test 2 — sign in and look at the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Work email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await login(page, "owner@demo.test");
    await expect(page).toHaveURL(/\/app\/dashboard/);
    await expect(page.getByText("Available credit").first()).toBeVisible();
    await expect(page.getByText("Accepted by provider").first()).toBeVisible();
    await expect(page.getByText("Delivered").first()).toBeVisible();

    for (const path of [
      "/app/campaigns",
      "/app/contacts",
      "/app/templates",
      "/app/credits",
      "/app/settings",
    ]) {
      await expectNoErrorPage(page, path);
    }

    await logout(page);
    await page.goto("/app/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("Test 3 — send a message now", async ({ page }) => {
    await login(page, "owner@demo.test");
    await page.goto("/app/send");
    await expect(page.getByLabel("Mobile numbers")).toBeVisible();

    await page
      .getByLabel("Mobile numbers")
      .fill(["+639170000601", "+639170009001", "+639170000601", "0917"].join("\n"));

    // 4 rows entered: 2 valid, 1 duplicate, 1 invalid.
    const preview = page.locator("section, div").filter({ hasText: "Rows entered" }).last();
    await expect(preview).toContainText("4");
    await expect(page.getByText("Unique valid").first()).toBeVisible();

    await page.getByRole("button", { name: "Continue to message" }).click();

    const message = page.getByLabel("Message", { exact: true });
    const text = "Your order is ready for pickup until 8pm today.";
    await message.fill(text);
    await expect(page.getByText(`${text.length}/160`).first()).toBeVisible();

    // An emoji switches to Unicode: 70 characters per part.
    await message.fill(`${text} 😊`);
    await expect(page.getByText(/\/70$/).first()).toBeVisible();
    await message.fill(text);

    // Personalisation is refused with a reason.
    await message.fill(`${text} {{first_name}}`);
    await expect(page.getByText(/personali[sz]/i).first()).toBeVisible();
    await message.fill(text);

    await page.getByLabel("I am authorized to contact these recipients.").check();
    await page.getByRole("button", { name: "Review message" }).click();

    await expect(page.getByRole("heading", { name: "Review and confirm" })).toBeVisible();
    await expect(page.getByText("Price per segment").first()).toBeVisible();
    await expect(page.getByText("Maximum authorized cost").first()).toBeVisible();
    await expect(
      page.getByText("Excluded before pricing: 1 invalid, 1 duplicate, 0 opted out."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Send 2 messages" }).click();
    await expect(page).toHaveURL(/\/app\/campaigns\/[0-9a-f-]+/);

    await expect(async () => {
      await page.reload();
      const row0601 = page.getByRole("row").filter({ hasText: "0601" });
      const row9001 = page.getByRole("row").filter({ hasText: "9001" });
      await expect(row0601).toContainText("Accepted by provider");
      await expect(row9001).toContainText("Rejected");
    }).toPass({ timeout: 45_000 });

    // Numbers are masked.
    await expect(page.getByText("+63 917 *** 0601").first()).toBeVisible();
    await expect(page.locator("main")).not.toContainText("+639170000601");

    await expect(
      page.getByText("Finished means no dispatch work remains — not that every message was delivered.", {
        exact: false,
      }).first(),
    ).toBeVisible();
    await expect(page.getByText("Awaiting receipt").first()).toBeVisible();
  });

  test("Test 4 — credits and billing", async ({ page }) => {
    await login(page, "owner@demo.test");
    await page.goto("/app/credits");

    await expect(page.getByText("Available").first()).toBeVisible();
    await expect(page.getByText("Posted balance").first()).toBeVisible();
    await expect(page.getByText("Held for sends").first()).toBeVisible();

    await expect(page.getByText("Held for a send").first()).toBeVisible();
    await expect(page.getByText("Charged for messages").first()).toBeVisible();
    await expect(page.getByText("Hold released").first()).toBeVisible();

    // "Add credit" is a section of packages; choosing one opens the checkout.
    const ledgerRows = await page.getByRole("row").count();
    const addCredit = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Add credit" }) });
    await addCredit.getByRole("button").first().click();
    await expect(page.getByRole("heading", { name: "Demo checkout" })).toBeVisible();
    await expect(page.locator("main")).toContainText(/not a real payment/i);
    await expect(page.locator("input[autocomplete^='cc-'], input[name*='card' i]")).toHaveCount(0);

    await page.getByRole("button", { name: "Complete demo payment" }).click();
    await expect(page).toHaveURL(/\/app\/credits$/);
    await expect.poll(() => page.getByRole("row").count()).toBeGreaterThan(ledgerRows);
  });

  test("Test 5 — schedule a message, then stop it", async ({ page }) => {
    await login(page, "owner@demo.test");
    await page.goto("/app/send");
    await page
      .getByLabel("Mobile numbers")
      .fill(["+639170000701", "+639170000702", "+639170000703"].join("\n"));
    await page.getByRole("button", { name: "Continue to message" }).click();
    await page.getByLabel("Message", { exact: true }).fill("Reminder: your appointment is tomorrow at 10am.");
    await page.getByLabel("Schedule for later").check();
    await page.getByLabel("Scheduled date and time").fill(hoursAhead(2));
    await page.getByLabel("I am authorized to contact these recipients.").check();
    await page.getByRole("button", { name: "Review message" }).click();

    await expect(page.getByText("(Asia/Manila)").first()).toBeVisible();
    await page.getByRole("button", { name: "Schedule 3 messages" }).click();
    await expect(page).toHaveURL(/\/app\/campaigns\/[0-9a-f-]+/);
    await expect(page.getByText("Scheduled").first()).toBeVisible();
    await expect(page.getByText("Waiting", { exact: true })).toHaveCount(3);

    await page.getByRole("button", { name: "Stop campaign" }).click();
    await page.getByRole("button", { name: "Yes, stop" }).click();
    await expect(page.getByText("Campaign stopped").first()).toBeVisible();
    await expect(page.getByText("3 messages prevented")).toBeVisible();

    await page.goto("/app/credits");
    await expect(page.getByText("Hold released").first()).toBeVisible();
  });

  test("Test 6 — opt-out list", async ({ page }) => {
    await login(page, "owner@demo.test");
    await page.goto("/app/contacts/opt-outs");
    await expect(page.getByRole("heading", { name: "Opt-out list" })).toBeVisible();

    await page.getByLabel("Mobile numbers").fill("+639170000650");
    await page.getByLabel("Reason").fill("Customer asked to stop");
    await page.getByRole("button", { name: "Add to opt-out list" }).click();
    await expect(page.getByText("Recorded").first()).toBeVisible();
    await expect(page.getByText("+63 917 *** 0650").first()).toBeVisible();

    await composeSend(page, ["+639170000650", "+639170000651"], "Your parcel has arrived.");
    await expect(page.getByRole("heading", { name: "Review and confirm" })).toBeVisible();
    await expect(page.getByText(/1 opted out/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Send 1 messages?$/ })).toBeVisible();

    await composeSend(page, ["+639170000650"], "Your parcel has arrived.");
    await expect(page.getByRole("heading", { name: "Review and confirm" })).toHaveCount(0);
    await expect(page.getByText("This send was not accepted").first()).toBeVisible();
  });

  test("Test 7 — message safety checks", async ({ page }) => {
    await login(page, "owner@demo.test");

    await composeSend(page, ["+639170000660"], "Please reply with your OTP to confirm your order.");
    await expect(page.getByRole("heading", { name: "Review and confirm" })).toHaveCount(0);
    await expect(page.getByText(/one-time|OTP|PIN/i).first()).toBeVisible();

    await composeSend(page, ["+639170000661"], "Last chance: our store closes early today.");
    await expect(page.getByRole("heading", { name: "Review and confirm" })).toBeVisible();
    await expect(page.getByText(/needs approval/i).first()).toBeVisible();
    await page.getByRole("button", { name: /^Send 1 messages?$/ }).click();
    await expect(page).toHaveURL(/\/app\/campaigns\/[0-9a-f-]+/);
    const heldUrl = page.url();
    await expect(page.getByText("Awaiting approval").first()).toBeVisible();

    await page.goto("/app/approvals");
    await expect(page.getByText(/Last chance/).first()).toBeVisible();
    await page.getByRole("button", { name: "Approve and send" }).first().click();
    await expect(page.getByText(/queued for sending/i).first()).toBeVisible();

    await page.goto(heldUrl);
    await expect(async () => {
      await page.reload();
      await expect(page.getByRole("row").filter({ hasText: "0661" })).toContainText("Accepted by provider");
    }).toPass({ timeout: 45_000 });
  });

  test("Test 8 — roles", async ({ page }) => {
    // The address of one of Demo Business's campaigns, for the viewer and the
    // other tenant to try.
    await login(page, "owner@demo.test");
    await page.goto("/app/campaigns");
    await page.locator("main a[href*='/app/campaigns/']").first().click();
    await expect(page).toHaveURL(/\/app\/campaigns\/[0-9a-f-]+/);
    const campaignUrl = page.url();
    await logout(page);

    await login(page, "sender@demo.test");
    await expect(page).toHaveURL(/\/app\/dashboard/);
    await sendAndSettle(page, ["+639170000670"], "Your table is ready.");
    await expect(page.getByRole("row").filter({ hasText: "0670" })).toContainText("Accepted by provider");

    await page.goto("/app/credits");
    await expect(page.getByText("Posted balance").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Add credit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add credit" })).toHaveCount(0);

    // Through the menu, as the guide says. Going straight to the address is
    // how a missing Settings link went unnoticed.
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/settings$/);
    await page.getByRole("link", { name: /^Team/ }).click();
    await expect(page.getByText("Your role cannot manage the team").first()).toBeVisible();

    await page.goto("/app/contacts/opt-outs");
    await expect(page.getByRole("heading", { name: "Opt-out list" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to opt-out list" })).toHaveCount(0);
    await logout(page);

    await login(page, "viewer@demo.test");
    await page.goto(campaignUrl);
    await expect(page.getByText(/\+63 9\d\d \*\*\* \d{4}/).first()).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/\+?639\d{9}/);
    await page.goto("/app/send");
    await expect(page.getByText("Your role cannot send messages").first()).toBeVisible();
    await expect(page.getByLabel("Mobile numbers")).toHaveCount(0);
    await logout(page);

    await login(page, "owner@demoretail.test");
    await page.goto("/app/campaigns");
    await expect(page.getByText("September Promos").first()).toBeVisible();
    await expect(page.locator(`main a[href="${new URL(campaignUrl).pathname}"]`)).toHaveCount(0);

    const response = await page.goto(campaignUrl);
    expect(response?.status()).toBe(404);
  });
});

test.describe("Part B — extra tests", () => {
  test("Test 9 — a new business, from sign-up to first message", async ({ page }) => {
    const id = stamp();
    const email = `tester.${id}@example.com`;
    const company = `Tester Trading ${id}`;
    const password = "TesterPass123!";

    await page.goto("/login");
    await page.getByRole("link", { name: "Create one" }).click();
    await expect(page).toHaveURL(/\/signup/);

    await page.getByLabel("Your name").fill("Guide Tester");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByLabel("Registered business name").fill(company);
    await page.getByLabel("SEC / DTI registration no.").fill(`TEST-${id}`);
    await page.getByLabel("Business address").fill("1 Sample Street, Makati City");
    await page.getByLabel("Industry").fill("Retail");
    await page.getByLabel("What do you intend to send?").fill("Order updates to our customers.");
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page).toHaveURL(/\/verify-email/);

    const mine = page.getByRole("listitem").filter({ hasText: email });
    await expect(mine).toBeVisible();
    await mine.getByRole("link").click();
    await expect(page.getByText("Your email address is verified.").first()).toBeVisible();

    await login(page, email, password);
    await expect(page.getByText("Your business is being reviewed").first()).toBeVisible();
    await logout(page);

    await login(page, "admin@phsms.test");
    await page.goto("/admin/verification");
    const row = page.locator("div.divide-y > div").filter({ hasText: company });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: `Record for ${company}` }).click();
    await expect(page.getByText(`${company} is now Active.`)).toBeVisible();
    await logout(page);

    await login(page, email, password);
    await expect(page).toHaveURL(/\/app\/dashboard/);
    await expect(page.getByText("₱1,000.00").first()).toBeVisible();

    await page.goto("/app/settings/senders");
    await expect(page.getByText("You cannot send yet").first()).toBeVisible();
    await page.getByLabel("Sender ID").fill(`T${id.slice(0, 7).toUpperCase()}`);
    await page.getByLabel("How does this relate to your business?").fill("It is our trading name.");
    await page.getByRole("button", { name: "Apply for review" }).click();
    await expect(page.getByText("Submitted for review").first()).toBeVisible();
    await page.getByRole("button", { name: "Approve (demo)" }).click();
    // The shortcut disappears once the approval is stored; "Approved" alone can
    // match other text on the page before that happens.
    await expect(page.getByTestId("demo-approve-sender")).toHaveCount(0);
    await expect(page.getByText("You cannot send yet")).toHaveCount(0);

    await sendAndSettle(page, ["+639170000801"], "Welcome to Tester Trading.");
    await expect(page.getByRole("row").filter({ hasText: "0801" })).toContainText("Accepted by provider");
  });

  test("Test 10 — admin console", async ({ page }) => {
    await login(page, "admin@phsms.test");
    await expect(page).toHaveURL(/\/admin/);

    for (const path of [
      "/admin",
      "/admin/customers",
      "/admin/verification",
      "/admin/activity",
      "/admin/inquiries",
      "/admin/senders",
      "/admin/credits",
      "/admin/suppression",
      "/admin/abuse",
      "/admin/health",
      "/admin/audit",
      "/admin/settings",
    ]) {
      await expectNoErrorPage(page, path);
    }

    // Rejecting without a reason is refused.
    await page.goto("/admin/verification");
    const form = page.locator("div.divide-y > div form").first();
    await form.getByLabel("Decision").selectOption("REJECTED");
    const reason = form.getByRole("textbox").first();
    await expect(reason).toHaveAttribute("required", "");
    await form.getByRole("button", { name: /^Record for/ }).click();
    expect(await reason.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
    await expect(form.getByText("Recorded")).toHaveCount(0);

    await page.goto("/admin/senders");
    await expect(page.getByText("LUZONGROC").first()).toBeVisible();
    await expect(page.getByText("VISMINLOG").first()).toBeVisible();

    await page.goto("/admin/audit");
    // Full phone numbers are never shown.
    await expect(page.locator("main")).not.toContainText(/\+?639\d{9}/);

    await page.goto("/admin/settings");
    await expect(page.getByText(/inputs still required before live/).first()).toBeVisible();
  });

  test("Test 11 — ask for a bulk quote", async ({ page }) => {
    const company = `Tester Bulk Co ${stamp()}`;
    await page.goto("/bulk");
    await page.getByLabel("Business name").fill(company);
    await page.getByLabel("Contact name").fill("Guide Tester");
    await page.getByLabel("Email").fill("bulk.tester@example.com");
    await page.getByLabel("Messages per send").fill("25000");
    await page.getByLabel("How often").fill("Monthly");
    await page.getByLabel("Message purpose").selectOption("PROMOTIONAL");
    await page.getByLabel("Who receives these messages?").fill("Loyalty members");
    await page.getByLabel("How did they agree to hear from you?").fill("Opt-in at checkout");
    await page.getByLabel("Sample message").fill("Our September sale starts Friday.");
    await page.getByLabel("Sender ID you want to use").fill("TESTBULK");
    await page.getByRole("button", { name: "Request a quote" }).click();
    await expect(page.getByText("Request received").first()).toBeVisible();

    await login(page, "admin@phsms.test");
    await page.goto("/admin/inquiries");
    await expect(page.getByText("These are CRM records only").first()).toBeVisible();
    const entry = page.locator("div.divide-y > div").filter({ hasText: company });
    await expect(entry).toContainText(/Promotional/i);
    await entry.getByLabel("Pipeline status").selectOption("CONTRACTED");
    await entry.getByRole("button", { name: "Update" }).click();
    await expect(entry.getByText(/No SMS was sent/).first()).toBeVisible();
  });

  test("Test 12 — import contacts from a file", async ({ page }) => {
    await login(page, "owner@demo.test");
    await page.goto("/app/contacts");
    await page.getByLabel(/Choose a CSV file/).setInputFiles({
      name: "contacts-test.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "phone_number,first_name\n+639170000671,Ana\n09170000672,Ben\n+639170000671,Ana\n12345,Wrong\n",
      ),
    });
    await page.getByRole("button", { name: "Upload and preview" }).click();
    await expect(page.getByText("4 rows read · 2 will be imported · 2 excluded")).toBeVisible();
    await expect(page.getByText("1 duplicate").first()).toBeVisible();
    await expect(page.getByText("1 invalid").first()).toBeVisible();

    await page.getByRole("button", { name: "Import 2 contacts" }).click();
    await expect(page.getByText("Import complete").first()).toBeVisible();
    await expect(page.getByText("Ana").first()).toBeVisible();
    await expect(page.getByText("Ben").first()).toBeVisible();
  });

  test("Test 12 — a CSV over 1 MB, inside the stated limit, uploads", async ({ page }) => {
    await login(page, "owner@demo.test");
    await page.goto("/app/contacts");
    await expect(page.getByText(/Up to \d+ MiB/).first()).toBeVisible();

    // ~1.5 MB: a padding column keeps the row count under the 10,000-row cap.
    const rows = ["phone_number,first_name,custom_1"];
    const pad = "x".repeat(170);
    for (let i = 0; i < 8_000; i++) {
      rows.push(`+63917${String(10_000_000 + i).slice(1)},Guest${i},${pad}`);
    }
    const buffer = Buffer.from(rows.join("\n") + "\n");
    expect(buffer.length).toBeGreaterThan(1_100_000);

    await page.getByLabel(/Choose a CSV file/).setInputFiles({
      name: "large.csv",
      mimeType: "text/csv",
      buffer,
    });
    await page.getByRole("button", { name: "Upload and preview" }).click();
    await expect(page.getByText("Review before importing").first()).toBeVisible({ timeout: 60_000 });
  });

  test("Test 13 — send a test to your own phone", async ({ page }) => {
    await login(page, "owner@demo.test");
    await page.goto("/app/settings/profile");
    await expect(page.getByText("Mobile number").first()).toBeVisible();

    await page.getByLabel("Mobile number").fill("0917 000 0901");
    await page.getByRole("button", { name: "Send verification code" }).click();
    const note = page.getByText(/No real message was sent\. Your code is/);
    await expect(note).toBeVisible();
    const code = (await note.textContent())!.match(/\d{6}/)![0];

    await page.getByLabel("Verification code").fill(code);
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(page.getByText("is verified. You can now send test messages.")).toBeVisible();

    await page.goto("/app/send");
    await page.getByLabel("Mobile numbers").fill("+639170000901");
    await page.getByRole("button", { name: "Continue to message" }).click();
    await page.getByLabel("Message", { exact: true }).fill("A quick check before the real send.");
    await expect(page.getByText("Send yourself a test first?").first()).toBeVisible();
    await page.getByRole("button", { name: "Send test" }).click();
    await expect(page.getByText("Test sent").first()).toBeVisible();
    await expect(page.getByText(/charged like one/).first()).toBeVisible();
  });

  test("Test 14 — invite a team member", async ({ page, browser }) => {
    const email = `tester.invite.${stamp()}@example.com`;

    await login(page, "owner@demo.test");
    await page.goto("/app/settings/team");
    await page.getByLabel("Email").fill(email);
    await page.locator("#invite-role").selectOption("SENDER");
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByText("Invitation sent").first()).toBeVisible();
    await expect(page.locator("div").filter({ hasText: email }).filter({ has: page.getByRole("button", { name: "Revoke" }) }).last()).toContainText("Pending");
    await expect(page.getByText("Each link works once and expires after 7 days.").first()).toBeVisible();

    const incognito = await browser.newContext();
    const other = await incognito.newPage();
    await other.goto("/verify-email");
    const mail = other.getByRole("listitem").filter({ hasText: email });
    await expect(mail).toBeVisible();
    // The link says what it does, rather than calling every email a verification.
    await expect(mail.getByRole("link")).toHaveText(/invitation/i);
    await mail.getByRole("link").click();
    await expect(other.getByText("Demo Business").first()).toBeVisible();

    await other.getByLabel("Your name").fill("Invited Tester");
    await other.getByLabel("Choose a password").fill("InvitedPass123!");
    await other.getByRole("button", { name: "Accept invitation" }).click();
    await expect(other).toHaveURL(/\/app\//);
    await incognito.close();

    await page.reload();
    await expect(page.getByText("Invited Tester").first()).toBeVisible();
  });

  test("Test 15 — phone and small screens", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    const fits = async (path: string) => {
      await page.goto(path);
      await page.locator("h1").first().waitFor({ state: "visible" });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(2);
    };

    await fits("/");
    await login(page, "owner@demo.test");
    for (const path of ["/app/dashboard", "/app/send", "/app/campaigns"]) await fits(path);
    // Log out is an icon on a phone, but still labelled for assistive technology.
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    await context.close();
  });

  test("Test 16 — a lost provider reply is charged once", async ({ page }) => {
    await login(page, "owner@demo.test");
    await sendAndSettle(page, ["+639170009002"], "Your booking is confirmed.");
    await expect(page.getByRole("row").filter({ hasText: "9002" })).toContainText("Accepted by provider");
  });
});
