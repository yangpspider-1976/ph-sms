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

export type ConfigActionResult = { ok: boolean; message: string };

const valueSchema = z.object({
  key: z.enum(EDITABLE_KEYS),
  value: z.coerce.number().int(),
});

export async function setConfigValueAction(formData: FormData): Promise<ConfigActionResult> {
  const admin = await requirePlatformAdmin();

  const parsed = valueSchema.safeParse({
    key: formData.get("key"),
    value: formData.get("value"),
  });
  if (!parsed.success) {
    return { ok: false, message: "That setting or value is not valid." };
  }

  try {
    await setConfigValue({
      key: parsed.data.key,
      value: parsed.data.value,
      actorUserId: admin.id,
    });
    revalidatePath("/admin/settings");
    return { ok: true, message: "Saved. It applies to the next send." };
  } catch (err) {
    if (err instanceof ConfigError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function clearConfigValueAction(key: string): Promise<ConfigActionResult> {
  const admin = await requirePlatformAdmin();

  const parsed = z.enum(EDITABLE_KEYS).safeParse(key);
  if (!parsed.success) return { ok: false, message: "That setting is not valid." };

  await clearConfigValue({ key: parsed.data as EditableKey, actorUserId: admin.id });
  revalidatePath("/admin/settings");
  return { ok: true, message: "Restored to the built-in default." };
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
      message: `Saved. ${parsed.data.rules.length} rules are now in force.`,
    };
  } catch (err) {
    if (err instanceof ConfigError) return { ok: false, message: err.message };
    throw err;
  }
}
