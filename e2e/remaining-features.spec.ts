import { expect, test, type Browser, type Page } from "@playwright/test";

async function login(page: Page, email = "owner@demo.test") {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("DemoPass123!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(email === "admin@phsms.test" ? /\/admin/ : /\/app\//);
}

/** Sets the promotional route on Admin → Settings, in a window of its own. */
async function setPromotionalRoute(browser: Browser, route: "Bulk quote only (default)" | "Allow normal sending, with recorded consent") {
  const context = await browser.newContext();
  const admin = await context.newPage();
  await login(admin, "admin@phsms.test");
  await admin.goto("/admin/settings");
  await admin.getByLabel(route, { exact: false }).check();
  await admin.getByRole("button", { name: "Save", exact: true }).click();
  await expect(admin.getByText(/^Saved\. (Promotional messages now go|Businesses may now send)/)).toBeVisible();
  await context.close();
}

test("promotions go to the bulk quote until an admin allows them", async ({ page }) => {
  await login(page);
  await page.goto("/app/send");
  await page.getByLabel("Mobile numbers").fill("09170000871");
  await page.getByRole("button", { name: "Continue to message" }).click();
  await expect(page.getByText("Sending a promotion? Promotional messages go through a bulk quote.")).toBeVisible();
  await expect(page.getByLabel("Message purpose", { exact: true })).toHaveCount(0);
});

test("custom columns feed a reviewed personalized promotional send", async ({ page, browser }) => {
  await setPromotionalRoute(browser, "Allow normal sending, with recorded consent");
  await login(page);
  await page.goto("/app/contacts");
  await page.getByLabel(/Choose a CSV file/).setInputFiles({
    name: "mapped-consent.csv", mimeType: "text/csv",
    buffer: Buffer.from("Destination,Given name,Permission evidence\n09170000871,Ana,Marketing signup form\n09170000872,Ben,Marketing signup form\n"),
  });
  await page.getByRole("button", { name: "Upload and preview" }).click();
  await expect(page.getByText("Match your columns", { exact: true })).toBeVisible();
  await page.getByLabel("Import the column Destination as").selectOption("phone_number");
  await page.getByLabel("Import the column Permission evidence as").selectOption("consent_source");
  await page.getByRole("button", { name: "Preview with these columns" }).click();
  await page.getByRole("button", { name: "Import 2 contacts" }).click();
  await expect(page.getByText("Import complete", { exact: true })).toBeVisible();

  await page.goto("/app/send");
  await page.getByLabel("Mobile numbers").fill("09170000871\n09170000872");
  await page.getByRole("button", { name: "Continue to message" }).click();
  await page.getByLabel("Message purpose", { exact: true }).selectOption("PROMOTIONAL");
  await page.getByLabel("Message", { exact: true }).fill("Hello {{first_name}}, see our new collection in store. To opt out, contact our team.");
  await page.getByLabel("I am authorized to contact these recipients.").check();
  await page.getByRole("button", { name: "Review message" }).click();
  await expect(page.getByRole("heading", { name: "Personalized message samples" })).toBeVisible();
  await expect(page.getByText("Hello Ana, see our new collection in store. To opt out, contact our team.", { exact: true })).toBeVisible();
  await expect(page.getByText("Hello Ben, see our new collection in store. To opt out, contact our team.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Send 2 messages", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/campaigns\/[0-9a-f-]+$/);
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Waiting", { exact: true })).toHaveCount(0);
  }).toPass({ timeout: 45_000 });

  // Back to the default, so later tests see the bulk-quote route.
  await setPromotionalRoute(browser, "Bulk quote only (default)");
});

test("admin email wording saves and restores, and pricing is editable", async ({ page }) => {
  await login(page, "admin@phsms.test");
  await page.goto("/admin/emails");
  const subject = page.getByLabel("Subject", { exact: true });
  const original = await subject.inputValue();
  await subject.fill("Demo verification wording");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Custom wording", { exact: true })).toBeVisible();
  await page.reload();
  await expect(subject).toHaveValue("Demo verification wording");
  await page.getByRole("button", { name: "Restore default", exact: true }).click();
  await expect(subject).toHaveValue(original);

  await page.goto("/admin/pricing");
  const row = page.getByRole("row").filter({ hasText: "Price per segment (centavos)" });
  await row.getByRole("button", { name: "Change", exact: true }).click();
  await row.getByRole("spinbutton").fill("125");
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row.getByText("125", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Restore default", exact: true }).click();
  await expect(row.getByRole("button", { name: "Restore default", exact: true })).toHaveCount(0);
});

test("Korean sample downloads remain importable", async ({ page }) => {
  await login(page);
  await page.getByLabel("Change language").selectOption("ko");
  const file = await page.evaluate(async () => {
    const response = await fetch("/app/exports?kind=template");
    return { status: response.status, body: await response.text() };
  });
  expect(file.status).toBe(200);
  expect(file.body).toContain("수신 동의 경로");
  expect(file.body).toContain("마케팅 수신 동의 양식");
  await page.getByLabel("언어 변경").selectOption("en");
  await page.goto("/app/contacts");
  await page.getByLabel(/Choose a CSV file/).setInputFiles({ name: "korean-sample.csv", mimeType: "text/csv", buffer: Buffer.from(file.body) });
  await page.getByRole("button", { name: "Upload and preview" }).click();
  await expect(page.getByRole("button", { name: "Import 1 contact", exact: true })).toBeVisible();
});
