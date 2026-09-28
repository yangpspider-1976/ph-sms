"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { templates } from "@/server/db/schema";
import { authorize } from "@/server/auth/context";
import { validateMessageBody } from "@/server/domain/segments";
import { getEffectiveConfig } from "@/server/domain/app-config";
import { recordAudit } from "@/server/audit";

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

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ version: max(templates.version) })
      .from(templates)
      .where(
        and(
          eq(templates.organizationId, auth.ctx.org.organizationId),
          eq(templates.name, parsed.data.name),
        ),
      );

    const version = (existing[0]?.version ?? 0) + 1;

    await tx.insert(templates).values({
      organizationId: auth.ctx.org.organizationId,
      name: parsed.data.name,
      body: parsed.data.body,
      version,
      createdBy: auth.ctx.user.id,
    });

    await recordAudit(
      {
        action: "template.saved",
        organizationId: auth.ctx.org.organizationId,
        actorUserId: auth.ctx.user.id,
        objectType: "template",
        metadata: { name: parsed.data.name, version },
      },
      tx,
    );
  });

  revalidatePath("/app/templates");
  return { ok: true, message: "Template saved." };
}

/** Archives a template. Past campaigns keep their own copy of the text. */
export async function archiveTemplateAction(templateId: string): Promise<TemplateResult> {
  const auth = await authorize("templates.manage");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  await db
    .update(templates)
    .set({ archivedAt: new Date() })
    .where(
      and(
        eq(templates.id, templateId),
        eq(templates.organizationId, auth.ctx.org.organizationId),
      ),
    );

  revalidatePath("/app/templates");
  return { ok: true, message: "Template archived." };
}

/** Latest version of each template, newest first. */
export async function listTemplates(organizationId: string) {
  return db
    .select()
    .from(templates)
    .where(eq(templates.organizationId, organizationId))
    .orderBy(desc(templates.createdAt))
    .limit(100);
}
