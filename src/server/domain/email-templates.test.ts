import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, db, resetDb } from "@/test/db";
import { createTenant, type Tenant } from "@/test/fixtures";
import { auditEvents, emailTemplates } from "@/server/db/schema";
import {
  defaultTemplate, EmailTemplateError, fillTemplate, isEmailTemplateKey,
  listEmailTemplates, renderEmail, resetEmailTemplate, saveEmailTemplate, templateFor,
} from "./email-templates";

let tenant: Tenant;
beforeEach(async () => { await resetDb(); tenant = await createTenant(); });
afterAll(closeDb);

describe("editable email templates", () => {
  it("lists all five defaults in both languages without storing overrides", async () => {
    const rows = await listEmailTemplates();
    expect(rows).toHaveLength(10);
    expect(rows.every((row) => !row.template.custom)).toBe(true);
    expect(await templateFor("verify", "ko")).toMatchObject(defaultTemplate("verify", "ko"));
    expect(await db.select().from(emailTemplates)).toHaveLength(0);
  });

  it("uses an override for its language and restores the default with an audit trail", async () => {
    await saveEmailTemplate({ key: "invite", locale: "ko", subject: "{{organization}} 초대", body: "{{role}} 역할로 참여하세요.", actorUserId: tenant.userId });
    expect(await renderEmail("invite", "ko", { organization: "Example", role: "발송자" })).toEqual({ subject: "Example 초대", body: "발송자 역할로 참여하세요." });
    expect(await templateFor("invite", "en")).toMatchObject({ ...defaultTemplate("invite", "en"), custom: false });
    await resetEmailTemplate({ key: "invite", locale: "ko", actorUserId: tenant.userId });
    expect(await templateFor("invite", "ko")).toMatchObject({ ...defaultTemplate("invite", "ko"), custom: false });
    const events = await db.select().from(auditEvents);
    expect(events.map((event) => event.action)).toContain("admin.email_template_saved");
    expect(events.map((event) => event.action)).toContain("admin.email_template_reset");
  });

  it.each([
    { subject: "Test", body: "{{unsupported}}" },
    { subject: "Test", body: "{{organization name}}" },
    { subject: "Test", body: "{{organization" },
    { subject: "Test\rBcc: hidden@example.test", body: "Hello" },
    { subject: " ", body: "Hello" },
    { subject: "x".repeat(201), body: "Hello" },
    { subject: "Test", body: "x".repeat(5001) },
  ])("rejects invalid template content without saving: $subject", async ({ subject, body }) => {
    await expect(saveEmailTemplate({ key: "invite", locale: "en", subject, body, actorUserId: tenant.userId })).rejects.toBeInstanceOf(EmailTemplateError);
    expect(await db.select().from(emailTemplates)).toHaveLength(0);
  });

  it("substitutes values once and removes an empty optional line", () => {
    expect(fillTemplate("Hello {{name}}\n{{about}}\nDone", { name: "{{status}}", status: "Never substituted", about: "" })).toBe("Hello {{status}}\nDone");
  });

  it("removes injected line breaks from rendered subjects", async () => {
    const result = await renderEmail("invite", "en", { organization: "Example\r\nBcc: other@example.test", role: "Sender" });
    expect(result.subject).not.toMatch(/[\r\n]/);
  });

  it("rejects prototype properties as template keys", () => {
    expect(isEmailTemplateKey("toString")).toBe(false);
    expect(isEmailTemplateKey("__proto__")).toBe(false);
    expect(isEmailTemplateKey("verify")).toBe(true);
  });
});
