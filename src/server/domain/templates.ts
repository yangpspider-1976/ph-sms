import "server-only";
import { and, desc, eq, isNull, max } from "drizzle-orm";
import { db } from "@/server/db";
import { templates } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";

/**
 * Message templates.
 *
 * A template is a name with a history: saving under a name that already exists
 * adds a version rather than changing the old one, so a campaign sent last
 * month can still be explained. Wherever templates are offered, each name
 * appears once, at its latest version.
 *
 * Every query here is scoped by organization. A template id arriving from a
 * browser is never trusted on its own.
 */

export type TemplateSummary = {
  id: string;
  name: string;
  body: string;
  version: number;
  createdAt: Date;
};

/** Saves the text as the next version of the named template. */
export async function saveTemplate(input: {
  organizationId: string;
  userId: string;
  name: string;
  body: string;
}): Promise<{ version: number }> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ version: max(templates.version) })
      .from(templates)
      .where(
        and(eq(templates.organizationId, input.organizationId), eq(templates.name, input.name)),
      );

    // Removed versions count: a template saved again after it was removed
    // carries on from its last version number rather than reusing one.
    const version = (existing?.version ?? 0) + 1;

    await tx.insert(templates).values({
      organizationId: input.organizationId,
      name: input.name,
      body: input.body,
      version,
      createdBy: input.userId,
    });

    await recordAudit(
      {
        action: "template.saved",
        organizationId: input.organizationId,
        actorUserId: input.userId,
        objectType: "template",
        metadata: { name: input.name, version },
      },
      tx,
    );

    return { version };
  });
}

/**
 * The latest version of each template that has not been removed, most
 * recently saved first.
 *
 * The latest version is picked before removed ones are left out, so removing a
 * template hides it outright instead of bringing back an older version.
 */
export async function listTemplates(
  organizationId: string,
  limit = 100,
): Promise<TemplateSummary[]> {
  const latest = db
    .selectDistinctOn([templates.name], {
      id: templates.id,
      name: templates.name,
      body: templates.body,
      version: templates.version,
      createdAt: templates.createdAt,
      archivedAt: templates.archivedAt,
    })
    .from(templates)
    .where(eq(templates.organizationId, organizationId))
    .orderBy(templates.name, desc(templates.version))
    .as("latest");

  return db
    .select({
      id: latest.id,
      name: latest.name,
      body: latest.body,
      version: latest.version,
      createdAt: latest.createdAt,
    })
    .from(latest)
    .where(isNull(latest.archivedAt))
    .orderBy(desc(latest.createdAt))
    .limit(limit);
}

/**
 * Removes a template: every version of it, so an older one does not take its
 * place. The rows are archived, not deleted, and past campaigns keep their own
 * copy of the text either way. Returns false when there is nothing of this
 * organization's left to remove.
 */
export async function archiveTemplate(input: {
  organizationId: string;
  userId: string;
  templateId: string;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [template] = await tx
      .select({ name: templates.name })
      .from(templates)
      .where(
        and(
          eq(templates.id, input.templateId),
          eq(templates.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!template) return false;

    const now = new Date();
    const archived = await tx
      .update(templates)
      .set({ archivedAt: now, updatedAt: now })
      .where(
        and(
          eq(templates.organizationId, input.organizationId),
          eq(templates.name, template.name),
          isNull(templates.archivedAt),
        ),
      )
      .returning({ version: templates.version });
    if (archived.length === 0) return false;

    await recordAudit(
      {
        action: "template.archived",
        organizationId: input.organizationId,
        actorUserId: input.userId,
        objectType: "template",
        objectId: input.templateId,
        metadata: { name: template.name, versions: archived.length },
      },
      tx,
    );

    return true;
  });
}
