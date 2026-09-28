import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db, resetDb } from "@/test/db";
import { createTenant, NUMBERS, type Tenant } from "@/test/fixtures";
import { contacts } from "@/server/db/schema";
import { commitImport, createImport, getContact, updateContact } from "./contacts";
import {
  addToGroup,
  createGroup,
  deleteGroup,
  GroupError,
  groupRecipients,
  listGroupMembers,
  listGroups,
  removeFromGroup,
  renameGroup,
} from "./groups";

/**
 * Contact groups. The property that matters most is that a group is an
 * organization's own: ids travel through the browser, so every one of these
 * calls has to prove ownership rather than assume it.
 */

let tenant: Tenant;

const LIST = Buffer.from(
  [
    "phone_number,first_name",
    `${NUMBERS.ok(1)},Ana`,
    `${NUMBERS.ok(2)},Ben`,
    `${NUMBERS.ok(3)},Cara`,
  ].join("\n"),
  "utf8",
);

async function seedContacts(t: Tenant = tenant): Promise<string[]> {
  const outcome = await createImport({
    organizationId: t.organizationId,
    userId: t.userId,
    filename: "list.csv",
    bytes: LIST,
  });
  if (!outcome.ok) throw new Error(outcome.code);
  await commitImport({
    importId: outcome.preview.importId,
    organizationId: t.organizationId,
    userId: t.userId,
  });

  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.organizationId, t.organizationId));
  return rows.map((r) => r.id);
}

async function makeGroup(name = "Regulars") {
  return createGroup({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    name,
  });
}

beforeEach(async () => {
  await resetDb();
  tenant = await createTenant();
});
afterAll(closeDb);

describe("creating groups", () => {
  it("lists a new group with no members", async () => {
    await makeGroup();
    const groups = await listGroups(tenant.organizationId);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.memberCount).toBe(0);
  });

  it("refuses a duplicate name within the organization", async () => {
    await makeGroup("VIPs");
    await expect(makeGroup("VIPs")).rejects.toMatchObject({ code: "DUPLICATE_NAME" });
  });

  it("allows the same name in a different organization", async () => {
    await makeGroup("VIPs");
    const other = await createTenant();

    await expect(
      createGroup({
        organizationId: other.organizationId,
        userId: other.userId,
        name: "VIPs",
      }),
    ).resolves.toBeTruthy();
  });

  it("refuses a blank name", async () => {
    await expect(makeGroup("   ")).rejects.toMatchObject({ code: "INVALID_NAME" });
  });
});

describe("membership", () => {
  it("adds contacts and counts them", async () => {
    const ids = await seedContacts();
    const group = await makeGroup();

    const { added } = await addToGroup({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      groupId: group.id,
      contactIds: ids,
    });

    expect(added).toBe(3);
    const groups = await listGroups(tenant.organizationId);
    expect(groups[0]!.memberCount).toBe(3);
  });

  it("skips contacts already in the group rather than failing", async () => {
    const ids = await seedContacts();
    const group = await makeGroup();

    await addToGroup({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      groupId: group.id,
      contactIds: ids,
    });
    const second = await addToGroup({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      groupId: group.id,
      contactIds: ids,
    });

    expect(second.added).toBe(0);
    expect((await listGroups(tenant.organizationId))[0]!.memberCount).toBe(3);
  });

  it("will not add another organization's contact", async () => {
    const group = await makeGroup();
    const other = await createTenant();
    const foreignIds = await seedContacts(other);

    const { added } = await addToGroup({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      groupId: group.id,
      contactIds: foreignIds,
    });

    // The ids are real, and they are simply not this organization's to use.
    expect(added).toBe(0);
    expect((await listGroups(tenant.organizationId))[0]!.memberCount).toBe(0);
  });

  it("will not add to another organization's group", async () => {
    const ids = await seedContacts();
    const other = await createTenant();
    const foreignGroup = await createGroup({
      organizationId: other.organizationId,
      userId: other.userId,
      name: "Theirs",
    });

    await expect(
      addToGroup({
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        groupId: foreignGroup.id,
        contactIds: ids,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("removes members without deleting the contacts", async () => {
    const ids = await seedContacts();
    const group = await makeGroup();
    await addToGroup({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      groupId: group.id,
      contactIds: ids,
    });

    const { removed } = await removeFromGroup({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      groupId: group.id,
      contactIds: [ids[0]!],
    });

    expect(removed).toBe(1);
    const stillThere = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, ids[0]!));
    expect(stillThere).toHaveLength(1);
  });

  it("lists members masked", async () => {
    const ids = await seedContacts();
    const group = await makeGroup();
    await addToGroup({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      groupId: group.id,
      contactIds: ids,
    });

    const members = await listGroupMembers({
      organizationId: tenant.organizationId,
      groupId: group.id,
    });

    expect(members).toHaveLength(3);
    for (const member of members) {
      expect(member.masked).not.toMatch(/\d{9}/);
    }
  });
});

describe("groupRecipients", () => {
  it("returns the real numbers for sending", async () => {
    const ids = await seedContacts();
    const group = await makeGroup();
    await addToGroup({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      groupId: group.id,
      contactIds: ids,
    });

    const recipients = await groupRecipients({
      organizationId: tenant.organizationId,
      groupId: group.id,
    });

    expect(recipients.sort()).toEqual([NUMBERS.ok(1), NUMBERS.ok(2), NUMBERS.ok(3)].sort());
  });

  it("returns nothing for another organization's group", async () => {
    const ids = await seedContacts();
    const group = await makeGroup();
    await addToGroup({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      groupId: group.id,
      contactIds: ids,
    });

    const other = await createTenant();
    const recipients = await groupRecipients({
      organizationId: other.organizationId,
      groupId: group.id,
    });

    expect(recipients).toEqual([]);
  });
});

describe("renaming and deleting", () => {
  it("refuses to rename another organization's group", async () => {
    const other = await createTenant();
    const foreign = await createGroup({
      organizationId: other.organizationId,
      userId: other.userId,
      name: "Theirs",
    });

    await expect(
      renameGroup({
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        groupId: foreign.id,
        name: "Mine now",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("keeps the contacts when the group is deleted", async () => {
    const ids = await seedContacts();
    const group = await makeGroup();
    await addToGroup({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      groupId: group.id,
      contactIds: ids,
    });

    await deleteGroup({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      groupId: group.id,
    });

    const remaining = await db
      .select()
      .from(contacts)
      .where(eq(contacts.organizationId, tenant.organizationId));
    expect(remaining).toHaveLength(3);
  });

  it("refuses to delete another organization's group", async () => {
    const other = await createTenant();
    const foreign = await createGroup({
      organizationId: other.organizationId,
      userId: other.userId,
      name: "Theirs",
    });

    await expect(
      deleteGroup({
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        groupId: foreign.id,
      }),
    ).rejects.toBeInstanceOf(GroupError);
  });
});

describe("editing a contact", () => {
  it("saves corrected details", async () => {
    const [id] = await seedContacts();

    await updateContact({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      contactId: id!,
      firstName: "Anna",
      lastName: "Reyes",
      consentSource: "Signed up in store",
      tags: ["vip", "manila"],
    });

    const contact = await getContact({
      organizationId: tenant.organizationId,
      contactId: id!,
    });
    expect(contact!.firstName).toBe("Anna");
    expect(contact!.tags).toEqual(["vip", "manila"]);
  });

  it("de-duplicates tags regardless of case", async () => {
    const [id] = await seedContacts();

    await updateContact({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      contactId: id!,
      tags: ["VIP", "vip", " VIP ", "Manila"],
    });

    const contact = await getContact({
      organizationId: tenant.organizationId,
      contactId: id!,
    });
    expect(contact!.tags).toEqual(["VIP", "Manila"]);
  });

  it("will not edit another organization's contact", async () => {
    const other = await createTenant();
    const [foreignId] = await seedContacts(other);

    const result = await updateContact({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      contactId: foreignId!,
      firstName: "Changed",
    });

    expect(result.ok).toBe(false);
    const untouched = await getContact({
      organizationId: other.organizationId,
      contactId: foreignId!,
    });
    expect(untouched!.firstName).not.toBe("Changed");
  });
});
