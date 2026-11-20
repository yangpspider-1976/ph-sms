"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/server/auth/context";
import {
  defaultTemplate,
  EmailTemplateError,
  isEmailTemplateKey,
  resetEmailTemplate,
  saveEmailTemplate,
} from "@/server/domain/email-templates";
import { isLocale } from "@/i18n/config";
import { enServerText } from "@/i18n/locales/en-server-text";

export type EmailTemplateResult = {
  ok: boolean;
  message: string;
  /** After a reset: the default wording, for the editor to show. */
  template?: { subject: string; body: string };
};

export async function saveEmailTemplateAction(formData: FormData): Promise<EmailTemplateResult> {
  const admin = await requirePlatformAdmin();
  const key = formData.get("key");
  const locale = formData.get("locale");
  const subject = formData.get("subject");
  const body = formData.get("body");
  if (!isEmailTemplateKey(key) || !isLocale(locale) || typeof subject !== "string" || typeof body !== "string") {
    return { ok: false, message: enServerText.updateNotValid };
  }
  try {
    await saveEmailTemplate({ key, locale, subject, body, actorUserId: admin.id });
    revalidatePath("/admin/emails");
    return { ok: true, message: enServerText.emailTemplateSaved };
  } catch (error) {
    if (error instanceof EmailTemplateError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function resetEmailTemplateAction(key: string, locale: string): Promise<EmailTemplateResult> {
  const admin = await requirePlatformAdmin();
  if (!isEmailTemplateKey(key) || !isLocale(locale)) {
    return { ok: false, message: enServerText.updateNotValid };
  }
  await resetEmailTemplate({ key, locale, actorUserId: admin.id });
  revalidatePath("/admin/emails");
  // The default comes from here, so the editor need not load both dictionaries
  // into the browser to show it: the email's language may not be the page's.
  return { ok: true, message: enServerText.emailTemplateReset, template: defaultTemplate(key, locale) };
}
