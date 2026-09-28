import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { contactGroupMembers, contactGroups, contacts } from "@/server/db/schema";
import { isUniqueViolation } from "./wallet";
import { recordAudit } from "@/server/audit";
import { decrypt } from "@/server/security/crypto";

/**
 * Contact groups.
 *
 * A group is a saved audience: a named set of contacts that can be picked in
 * the send wizard instead of pasting numbers again. Membership is a join table
 * rather than a column on the contact, because a contact belongs to as many
 * groups as the customer likes and the send path needs to read the list from
 * the group's side.
 *
 * Every query here is scoped by organization. A group id arriving from a
 * browser is never trusted on its own.
 */

export class GroupError extends Error {
  constructor(
    message: string,
    readonly code: "DUPLICATE_NAME" | "NOT_FOUND" | "INVALID_NAME",
  ) {
    super(message);
    this.name = "GroupError";
  }
}

export type GroupSummary = {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  updatedAt: Date;
};

export async function listGroups(organizationId: string): Promise<GroupSummary[]> {
  const rows = await db
    .select({
      id: contactGroups.id,
      name: contactGroups.name,
      description: contactGroups.description,
      updatedAt: contactGroups.updatedAt,
      memberCount: sql<number>`count(${contactGroupMembers.contactId})::int`,
    })
    .from(contactGroups)
    .leftJoin(contactGroupMembers, eq(contactGroupMembers.groupId, contactGroups.id))
    .where(eq(contactGroups.organizationId, organizationId))
    .groupBy(
      contactGroups.id,
      contactGroups.name,
      contactGroups.description,
      contactGroups.updatedAt,
    )
    .orderBy(contactGroups.name);

  return rows;
}

export async function createGroup(input: {
  organizationId: string;
  userId: string;
  name: string;
  description?: string | null;
}): Promise<GroupSummary> {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new GroupError("Give the group a name.", "INVALID_NAME");
  }

  try {
    const [group] = await db
      .insert(contactGroups)
      .values({
        organizationId: input.organizationId,
        name,
        description: input.description?.trim() || null,
        createdBy: input.userId,
      })
      .returning();

    await recordAudit({
      action: "contacts.group_created",
      organizationId: input.organizationId,
      actorUserId: input.userId,
      objectType: "contact_group",
      objectId: group!.id,
      metadata: { name },
    });

    return { ...group!, memberCount: 0 };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new GroupError(`You already have a group called "${name}".`, "DUPLICATE_NAME");
    }
    throw err;
  }
}

export async function renameGroup(input: {
  organizationId: string;
  userId: string;
  groupId: string;
  name: string;
  description?: string | null;
}): Promise<void> {
  const name = input.name.trim();
  if (name.length === 0) throw new GroupError("Give the group a name.", "INVALID_NAME");

  try {
    const updated = await db
      .update(contactGroups)
      .set({ name, description: input.description?.trim() || null, updatedAt: new Date() })
      .where(
        and(
          eq(contactGroups.id, input.groupId),
          eq(contactGroups.organizationId, input.organizationId),
        ),
      )
      .returning({ id: contactGroups.id });

    if (updated.length === 0) throw new GroupError("That group no longer exists.", "NOT_FOUND");

    await recordAudit({
      action: "contacts.group_renamed",
      organizationId: input.organizationId,
      actorUserId: input.userId,
      objectType: "contact_group",
      objectId: input.groupId,
      metadata: { name },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new GroupError(`You already have a group called "${name}".`, "DUPLICATE_NAME");
    }
    throw err;
  }
}

/** Deletes the group only. The contacts in it are not touched. */
export async function deleteGroup(input: {
  organizationId: string;
  userId: string;
  groupId: string;
}): Promise<void> {
  const deleted = await db
    .delete(contactGroups)
    .where(
      and(
        eq(contactGroups.id, input.groupId),
        eq(contactGroups.organizationId, input.organizationId),
      ),
    )
    .returning({ id: contactGroups.id });

  if (deleted.length === 0) throw new GroupError("That group no longer exists.", "NOT_FOUND");

  await recordAudit({
    action: "contacts.group_deleted",
    organizationId: input.organizationId,
    actorUserId: input.userId,
    objectType: "contact_group",
    objectId: input.groupId,
  });
}

/**
 * Adds contacts to a group.
 *
 * Both the group and every contact are re-checked against this organization, so
 * a contact id from another tenant cannot be joined into this group. Existing
 * members are skipped rather than erroring, because adding a selection that
 * overlaps what is already there is a normal thing to do.
 */
export async function addToGroup(input: {
  organizationId: string;
  userId: string;
  groupId: string;
  contactIds: string[];
}): Promise<{ added: number }> {
  if (input.contactIds.length === 0) return { added: 0 };

  const [group] = await db
    .select({ id: contactGroups.id })
    .from(contactGroups)
    .where(
      and(
        eq(contactGroups.id, input.groupId),
        eq(contactGroups.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!group) throw new GroupError("That group no longer exists.", "NOT_FOUND");

  const owned = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.organizationId, input.organizationId),
        inArray(contacts.id, input.contactIds),
      ),
    );

  if (owned.length === 0) return { added: 0 };

  const inserted = await db
    .insert(contactGroupMembers)
    .values(
      owned.map((c) => ({
        groupId: input.groupId,
        contactId: c.id,
        organizationId: input.organizationId,
      })),
    )
    .onConflictDoNothing()
    .returning({ contactId: contactGroupMembers.contactId });

  await recordAudit({
    action: "contacts.group_members_added",
    organizationId: input.organizationId,
    actorUserId: input.userId,
    objectType: "contact_group",
    objectId: input.groupId,
    metadata: { added: inserted.length },
  });

  return { added: inserted.length };
}

export async function removeFromGroup(input: {
  organizationId: string;
  userId: string;
  groupId: string;
  contactIds: string[];
}): Promise<{ removed: number }> {
  if (input.contactIds.length === 0) return { removed: 0 };

  const removed = await db
    .delete(contactGroupMembers)
    .where(
      and(
        eq(contactGroupMembers.groupId, input.groupId),
        eq(contactGroupMembers.organizationId, input.organizationId),
        inArray(contactGroupMembers.contactId, input.contactIds),
      ),
    )
    .returning({ contactId: contactGroupMembers.contactId });

  await recordAudit({
    action: "contacts.group_members_removed",
    organizationId: input.organizationId,
    actorUserId: input.userId,
    objectType: "contact_group",
    objectId: input.groupId,
    metadata: { removed: removed.length },
  });

  return { removed: removed.length };
}

export type GroupMember = {
  contactId: string;
  masked: string;
  firstName: string | null;
  lastName: string | null;
};

/** Members of a group, masked. For the group's own screen. */
export async function listGroupMembers(input: {
  organizationId: string;
  groupId: string;
  limit?: number;
}): Promise<GroupMember[]> {
  const rows = await db
    .select({
      contactId: contacts.id,
      masked: contacts.numberMasked,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(contactGroupMembers)
    .innerJoin(contacts, eq(contacts.id, contactGroupMembers.contactId))
    .where(
      and(
        eq(contactGroupMembers.groupId, input.groupId),
        eq(contactGroupMembers.organizationId, input.organizationId),
      ),
    )
    .orderBy(contacts.numberMasked)
    .limit(input.limit ?? 500);

  return rows;
}

/**
 * The numbers in a group, for the send wizard.
 *
 * Returns real numbers because they are about to be sent to; this is the one
 * place a group's contents are decrypted, and the caller hands them straight to
 * `issueQuote`, which re-normalizes, de-duplicates and re-checks opt-outs.
 */
export async function groupRecipients(input: {
  organizationId: string;
  groupId: string;
}): Promise<string[]> {
  const rows = await db
    .select({ encrypted: contacts.numberEncrypted })
    .from(contactGroupMembers)
    .innerJoin(contacts, eq(contacts.id, contactGroupMembers.contactId))
    .where(
      and(
        eq(contactGroupMembers.groupId, input.groupId),
        eq(contactGroupMembers.organizationId, input.organizationId),
      ),
    );

  return rows.map((r) => decrypt(r.encrypted));
}
