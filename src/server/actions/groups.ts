"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/server/auth/context";
import {
  addToGroup,
  createGroup,
  deleteGroup,
  GroupError,
  groupRecipients,
  listGroups,
  removeFromGroup,
  renameGroup,
} from "@/server/domain/groups";
import { updateContact } from "@/server/domain/contacts";

export type GroupResult = { ok: boolean; message: string; groupId?: string };

const nameSchema = z.object({
  name: z.string().min(1, "Give the group a name.").max(80),
  description: z.string().max(300).optional(),
});

export async function createGroupAction(formData: FormData): Promise<GroupResult> {
  const auth = await authorize("contacts.manage");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const parsed = nameSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That was not valid." };
  }

  try {
    const group = await createGroup({
      organizationId: auth.ctx.org.organizationId,
      userId: auth.ctx.user.id,
      name: parsed.data.name,
      description: parsed.data.description,
    });
    revalidatePath("/app/contacts/groups");
    return { ok: true, message: `"${group.name}" created.`, groupId: group.id };
  } catch (err) {
    if (err instanceof GroupError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function renameGroupAction(formData: FormData): Promise<GroupResult> {
  const auth = await authorize("contacts.manage");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const groupId = z.string().uuid().safeParse(formData.get("groupId"));
  const parsed = nameSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  if (!groupId.success || !parsed.success) {
    return { ok: false, message: "That change was not valid." };
  }

  try {
    await renameGroup({
      organizationId: auth.ctx.org.organizationId,
      userId: auth.ctx.user.id,
      groupId: groupId.data,
      name: parsed.data.name,
      description: parsed.data.description,
    });
    revalidatePath("/app/contacts/groups");
    revalidatePath(`/app/contacts/groups/${groupId.data}`);
    return { ok: true, message: "Saved." };
  } catch (err) {
    if (err instanceof GroupError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function deleteGroupAction(groupId: string): Promise<GroupResult> {
  const auth = await authorize("contacts.manage");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const parsed = z.string().uuid().safeParse(groupId);
  if (!parsed.success) return { ok: false, message: "That group is not valid." };

  try {
    await deleteGroup({
      organizationId: auth.ctx.org.organizationId,
      userId: auth.ctx.user.id,
      groupId: parsed.data,
    });
    revalidatePath("/app/contacts/groups");
    // Deleting a group never deletes contacts, and the screen says so.
    return { ok: true, message: "Group deleted. The contacts in it were kept." };
  } catch (err) {
    if (err instanceof GroupError) return { ok: false, message: err.message };
    throw err;
  }
}

const membershipSchema = z.object({
  groupId: z.string().uuid(),
  contactIds: z.array(z.string().uuid()).max(5000),
});

export async function addToGroupAction(raw: unknown): Promise<GroupResult> {
  const auth = await authorize("contacts.manage");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const parsed = membershipSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "That selection was not valid." };

  try {
    const { added } = await addToGroup({
      organizationId: auth.ctx.org.organizationId,
      userId: auth.ctx.user.id,
      groupId: parsed.data.groupId,
      contactIds: parsed.data.contactIds,
    });
    revalidatePath("/app/contacts");
    revalidatePath(`/app/contacts/groups/${parsed.data.groupId}`);
    const skipped = parsed.data.contactIds.length - added;
    return {
      ok: true,
      message:
        skipped > 0
          ? `${added} added. ${skipped} ${skipped === 1 ? "was" : "were"} already in the group.`
          : `${added} contact${added === 1 ? "" : "s"} added.`,
    };
  } catch (err) {
    if (err instanceof GroupError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function removeFromGroupAction(raw: unknown): Promise<GroupResult> {
  const auth = await authorize("contacts.manage");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const parsed = membershipSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "That selection was not valid." };

  const { removed } = await removeFromGroup({
    organizationId: auth.ctx.org.organizationId,
    userId: auth.ctx.user.id,
    groupId: parsed.data.groupId,
    contactIds: parsed.data.contactIds,
  });

  revalidatePath(`/app/contacts/groups/${parsed.data.groupId}`);
  return {
    ok: true,
    message: `${removed} removed from the group. ${removed === 1 ? "It is" : "They are"} still in your contacts.`,
  };
}

export type ContactResult = { ok: boolean; message: string };

const contactSchema = z.object({
  contactId: z.string().uuid(),
  firstName: z.string().max(120).optional(),
  lastName: z.string().max(120).optional(),
  consentSource: z.string().max(300).optional(),
  tags: z.string().max(600).optional(),
});

/** Corrects a contact's details. The number is not editable — see the domain. */
export async function updateContactAction(formData: FormData): Promise<ContactResult> {
  const auth = await authorize("contacts.manage");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const parsed = contactSchema.safeParse({
    contactId: formData.get("contactId"),
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    consentSource: String(formData.get("consentSource") ?? ""),
    tags: String(formData.get("tags") ?? ""),
  });
  if (!parsed.success) return { ok: false, message: "That change was not valid." };

  const result = await updateContact({
    organizationId: auth.ctx.org.organizationId,
    userId: auth.ctx.user.id,
    contactId: parsed.data.contactId,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    consentSource: parsed.data.consentSource,
    tags: (parsed.data.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
  });

  if (!result.ok) return { ok: false, message: "That contact no longer exists." };

  revalidatePath("/app/contacts");
  revalidatePath(`/app/contacts/${parsed.data.contactId}`);
  return { ok: true, message: "Saved." };
}

export type GroupRecipientsResult =
  | { ok: true; numbers: string[]; name: string }
  | { ok: false; message: string };

/**
 * Loads a group's numbers for the send wizard.
 *
 * The numbers do reach the browser, exactly as they do when a sender pastes a
 * list or picks a CSV. They are re-normalized, de-duplicated and re-checked
 * against the opt-out list on the server when the quote is issued, so nothing
 * here is trusted.
 */
export async function loadGroupRecipientsAction(
  groupId: string,
): Promise<GroupRecipientsResult> {
  const auth = await authorize("campaign.send");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const parsed = z.string().uuid().safeParse(groupId);
  if (!parsed.success) return { ok: false, message: "That group is not valid." };

  const groups = await listGroups(auth.ctx.org.organizationId);
  const group = groups.find((g) => g.id === parsed.data);
  if (!group) return { ok: false, message: "That group no longer exists." };

  const numbers = await groupRecipients({
    organizationId: auth.ctx.org.organizationId,
    groupId: parsed.data,
  });

  if (numbers.length === 0) {
    return { ok: false, message: `"${group.name}" has no contacts in it yet.` };
  }

  return { ok: true, numbers, name: group.name };
}
