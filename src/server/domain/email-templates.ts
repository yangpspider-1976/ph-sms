import "server-only";
import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import { emailTemplates } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { dictionaryFor } from "@/i18n/dictionaries";
import { isLocale, LOCALES, type Locale } from "@/i18n/config";
import { enServerText } from "@/i18n/locales/en-server-text";

/**
 * The emails the platform sends, as templates an admin can change.
 *
 * Each email is a subject and a body with {{placeholders}}. The dictionary's
 * wording is the default; an admin's own wording for one email in one
 * language is a row in `email_templates`, and removing the row restores the
 * default. Which placeholders an email may use is fixed here, because the
 * code supplies their values.
 */

export const EMAIL_TEMPLATES = {
  verify: [],
  invite: ["organization", "role"],
  supportReceived: ["reference", "subject", "category", "about", "details"],
  inquiryCustomer: ["name", "company", "status", "statusNote"],
  inquiryOperator: ["company", "status", "changedBy"],
} as const satisfies Record<string, readonly string[]>;

export type EmailTemplateKey = keyof typeof EMAIL_TEMPLATES;
export const EMAIL_TEMPLATE_KEYS = Object.keys(EMAIL_TEMPLATES) as EmailTemplateKey[];

type ValuesFor<K extends EmailTemplateKey> = Record<(typeof EMAIL_TEMPLATES)[K][number], string>;

export type EmailTemplate = { subject: string; body: string };

export const MAX_SUBJECT_LENGTH = 200;
export const MAX_BODY_LENGTH = 5_000;

export function isEmailTemplateKey(value: unknown): value is EmailTemplateKey {
  return typeof value === "string" && Object.hasOwn(EMAIL_TEMPLATES, value);
}

/** The dictionary's wording for an email. */
export function defaultTemplate(key: EmailTemplateKey, locale: Locale): EmailTemplate {
  return dictionaryFor(locale).emails.templates[key];
}

/** The wording an email is sent with now, and whether an admin wrote it. */
export async function templateFor(
  key: EmailTemplateKey,
  locale: Locale,
  tx: DbOrTx = db,
): Promise<EmailTemplate & { custom: boolean }> {
  const [row] = await tx
    .select({ subject: emailTemplates.subject, body: emailTemplates.body })
    .from(emailTemplates)
    .where(and(eq(emailTemplates.key, key), eq(emailTemplates.locale, locale)))
    .limit(1);
  return row ? { ...row, custom: true } : { ...defaultTemplate(key, locale), custom: false };
}

/**
 * Fills in a template. A line that holds nothing but a placeholder whose value
 * is empty is left out, so an optional line ("About: …") leaves no gap. Values
 * are inserted as they are and never read for placeholders themselves.
 */
export function fillTemplate(text: string, values: Record<string, string>): string {
  return text
    .split("\n")
    .filter((line) => {
      const only = /^\s*\{\{(\w+)\}\}\s*$/.exec(line);
      return !(only && (values[only[1]!] ?? "") === "");
    })
    .map((line) => line.replace(/\{\{(\w+)\}\}/g, (match, name: string) => values[name] ?? match))
    .join("\n");
}

/** An email ready to send, in the given language. */
export async function renderEmail<K extends EmailTemplateKey>(
  key: K,
  locale: Locale,
  values: ValuesFor<K>,
  tx?: DbOrTx,
): Promise<EmailTemplate> {
  const template = await templateFor(key, locale, tx);
  const filled = values as Record<string, string>;
  return {
    subject: fillTemplate(template.subject, filled).replace(/[\r\n]+/g, " ").trim(),
    body: fillTemplate(template.body, filled).trim(),
  };
}

export class EmailTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailTemplateError";
  }
}

/** Placeholders a template uses that its email cannot fill. */
export function unknownPlaceholders(key: EmailTemplateKey, text: string): string[] {
  const allowed: readonly string[] = EMAIL_TEMPLATES[key];
  const used = [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!);
  return [...new Set(used.filter((name) => !allowed.includes(name)))];
}

/** Saves an admin's wording for one email in one language. */
export async function saveEmailTemplate(input: {
  key: EmailTemplateKey;
  locale: Locale;
  subject: string;
  body: string;
  actorUserId: string;
}): Promise<void> {
  if (!isEmailTemplateKey(input.key) || !isLocale(input.locale)) {
    throw new EmailTemplateError(enServerText.updateNotValid);
  }
  const subject = input.subject.trim();
  const body = input.body.replace(/\r\n/g, "\n").trim();
  if (!subject || !body) throw new EmailTemplateError(enServerText.emailTemplateEmpty);
  // Reject malformed tokens as well as unknown names. Otherwise a typo such as
  // {{first name}} is silently mailed to every recipient as literal text.
  if (/[\r\n]/.test(subject) || /\{\{|\}\}/.test(`${subject}\n${body}`.replace(/\{\{\w+\}\}/g, ""))) {
    throw new EmailTemplateError(enServerText.emailTemplateInvalidSyntax);
  }
  if (subject.length > MAX_SUBJECT_LENGTH || body.length > MAX_BODY_LENGTH) {
    throw new EmailTemplateError(
      enServerText.emailTemplateTooLong(String(MAX_SUBJECT_LENGTH), String(MAX_BODY_LENGTH)),
    );
  }
  const unknown = unknownPlaceholders(input.key, `${subject}\n${body}`);
  if (unknown.length > 0) {
    const named = unknown.map((name) => `{{${name}}}`).join(", ");
    const allowed = EMAIL_TEMPLATES[input.key].map((name) => `{{${name}}}`).join(", ");
    throw new EmailTemplateError(
      allowed
        ? enServerText.emailTemplateUnknownPlaceholder(named, allowed)
        : enServerText.emailTemplateNoPlaceholders(named),
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(emailTemplates)
      .values({
        key: input.key,
        locale: input.locale,
        subject,
        body,
        updatedBy: input.actorUserId,
      })
      .onConflictDoUpdate({
        target: [emailTemplates.key, emailTemplates.locale],
        set: { subject, body, updatedBy: input.actorUserId, updatedAt: new Date() },
      });
    await recordAudit(
      {
        action: "admin.email_template_saved",
        actorUserId: input.actorUserId,
        actorKind: "PLATFORM_ADMIN",
        objectType: "email_template",
        objectId: `${input.key}:${input.locale}`,
      },
      tx,
    );
  });
}

/** Goes back to the dictionary's wording for one email in one language. */
export async function resetEmailTemplate(input: {
  key: EmailTemplateKey;
  locale: Locale;
  actorUserId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(emailTemplates)
      .where(and(eq(emailTemplates.key, input.key), eq(emailTemplates.locale, input.locale)));
    await recordAudit(
      {
        action: "admin.email_template_reset",
        actorUserId: input.actorUserId,
        actorKind: "PLATFORM_ADMIN",
        objectType: "email_template",
        objectId: `${input.key}:${input.locale}`,
      },
      tx,
    );
  });
}

/** Every email in every language, for the admin page. */
export async function listEmailTemplates(): Promise<
  Array<{ key: EmailTemplateKey; locale: Locale; template: EmailTemplate & { custom: boolean } }>
> {
  const rows = await db.select().from(emailTemplates);
  return EMAIL_TEMPLATE_KEYS.flatMap((key) =>
    LOCALES.map((locale) => {
      const row = rows.find((r) => r.key === key && r.locale === locale);
      return {
        key,
        locale,
        template: row
          ? { subject: row.subject, body: row.body, custom: true }
          : { ...defaultTemplate(key, locale), custom: false },
      };
    }),
  );
}
