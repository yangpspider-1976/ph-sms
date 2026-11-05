"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/server/auth/context";
import {
  clearConfigValue,
  ConfigError,
  EDITABLE_KEYS,
  setConfigValue,
  setContentPolicy,
  type EditableKey,
} from "@/server/domain/app-config";
import { contentPolicySchema } from "@/server/domain/content-checks";
import { enServerText } from "@/i18n/locales/en-server-text";

export type ConfigActionResult = { ok: boolean; message: string };

const valueSchema = z.object({
  key: z.enum(EDITABLE_KEYS),
  value: z.coerce.number().int(),
});

// The settings editor's messages are built from the server-text dictionary, so
// the editor can show them in the reader's language.
export async function setConfigValueAction(formData: FormData): Promise<ConfigActionResult> {
  const admin = await requirePlatformAdmin();

  const parsed = valueSchema.safeParse({
    key: formData.get("key"),
    value: formData.get("value"),
  });
  if (!parsed.success) {
    return { ok: false, message: enServerText.settingOrValueNotValid };
  }

  try {
    await setConfigValue({
      key: parsed.data.key,
      value: parsed.data.value,
      actorUserId: admin.id,
    });
    revalidatePath("/admin/settings");
    return { ok: true, message: enServerText.settingSaved };
  } catch (err) {
    if (err instanceof ConfigError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function clearConfigValueAction(key: string): Promise<ConfigActionResult> {
  const admin = await requirePlatformAdmin();

  const parsed = z.enum(EDITABLE_KEYS).safeParse(key);
  if (!parsed.success) return { ok: false, message: enServerText.settingNotValid };

  await clearConfigValue({ key: parsed.data as EditableKey, actorUserId: admin.id });
  revalidatePath("/admin/settings");
  return { ok: true, message: enServerText.settingRestored };
}

/**
 * Saves the content policy.
 *
 * The rules arrive as JSON from the editor because a rule is a small structure,
 * not a flat field. It is parsed here and again in the domain; neither trusts
 * the other.
 */
export async function setContentPolicyAction(raw: string): Promise<ConfigActionResult> {
  const admin = await requirePlatformAdmin();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, message: "That is not valid JSON." };
  }

  const parsed = contentPolicySchema.safeParse(parsedJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      message: issue ? `${issue.path.join(".") || "policy"}: ${issue.message}` : "That policy is not valid.",
    };
  }

  try {
    await setContentPolicy({ policy: parsed.data, actorUserId: admin.id });
    revalidatePath("/admin/abuse");
    return {
      ok: true,
      message: enServerText.policySaved(String(parsed.data.rules.length)),
    };
  } catch (err) {
    if (err instanceof ConfigError) return { ok: false, message: err.message };
    throw err;
  }
}
