"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/server/auth/context";
import { validateMessageBody } from "@/server/domain/segments";
import { getEffectiveConfig } from "@/server/domain/app-config";
import { archiveTemplate, saveTemplate } from "@/server/domain/templates";
import { isUuid } from "@/server/uuid";
import { enServerText } from "@/i18n/locales/en-server-text";

export type TemplateResult = { ok: boolean; message: string };

const schema = z.object({
  name: z.string().min(2, "Give the template a name.").max(120),
  body: z.string().min(1, "Write the message.").max(2000),
});

/**
 * Saves a template.
 *
 * Templates store plain text and are versioned: editing one writes a new
 * version rather than mutating the old, so a campaign sent last month can still
 * be explained. Variable syntax is rejected here for the same reason it is
 * rejected in the composer — nothing interpolates it yet, so it would be sent
 * literally.
 */
export async function saveTemplateAction(formData: FormData): Promise<TemplateResult> {
  const auth = await authorize("templates.manage");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const parsed = schema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    body: String(formData.get("body") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That template is not valid." };
  }

  const check = validateMessageBody(parsed.data.body, {
    maxSegments: (await getEffectiveConfig()).maxSegmentsPerMessage,
    supportsNonBmp: true,
    supportsUnicode: true,
  });
  if (!check.ok) return { ok: false, message: check.message };

  await saveTemplate({
    organizationId: auth.ctx.org.organizationId,
    userId: auth.ctx.user.id,
    name: parsed.data.name,
    body: parsed.data.body,
  });

  revalidatePath("/app/templates");
  return { ok: true, message: "Template saved." };
}

/** Removes a template, every version of it. Past campaigns keep their own copy of the text. */
export async function archiveTemplateAction(templateId: string): Promise<TemplateResult> {
  const auth = await authorize("templates.manage");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  // The failure message comes from the server-text dictionary, so the page
  // can show it in the reader's language.
  if (!isUuid(templateId)) return { ok: false, message: enServerText.templateGone };

  const removed = await archiveTemplate({
    organizationId: auth.ctx.org.organizationId,
    userId: auth.ctx.user.id,
    templateId,
  });
  if (!removed) return { ok: false, message: enServerText.templateGone };

  revalidatePath("/app/templates");
  return { ok: true, message: "Template removed." };
}
