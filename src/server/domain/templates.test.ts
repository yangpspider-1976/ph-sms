import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, db, resetDb } from "@/test/db";
import { createTenant, type Tenant } from "@/test/fixtures";
import { templates } from "@/server/db/schema";
import { archiveTemplate, listTemplates, saveTemplate } from "./templates";

/**
 * Message templates. Saving under a name adds a version, so what matters is
 * that a template is offered once, at its latest text, that removing it removes
 * every version, and that another organization's templates stay out of reach.
 */

let tenant: Tenant;

function save(name: string, body: string, t: Tenant = tenant) {
  return saveTemplate({ organizationId: t.organizationId, userId: t.userId, name, body });
}

function archive(templateId: string, t: Tenant = tenant) {
  return archiveTemplate({ organizationId: t.organizationId, userId: t.userId, templateId });
}

beforeEach(async () => {
  await resetDb();
  tenant = await createTenant();
});
afterAll(closeDb);

describe("listTemplates", () => {
  it("offers each template once, at its latest version", async () => {
    await save("Pickup", "Your order is ready.");
    await save("Pickup", "Your order is ready for pickup until 8pm.");
    await save("Closing", "We close early today.");

    const list = await listTemplates(tenant.organizationId);

    expect(list.map((t) => [t.name, t.version])).toEqual([
      ["Closing", 1],
      ["Pickup", 2],
    ]);
    expect(list.find((t) => t.name === "Pickup")!.body).toBe(
      "Your order is ready for pickup until 8pm.",
    );
  });

  it("puts the most recently saved first, and stops at the limit", async () => {
    await save("First", "One");
    await save("Second", "Two");
    await save("First", "One, revised");

    const list = await listTemplates(tenant.organizationId, 1);
    expect(list.map((t) => [t.name, t.body])).toEqual([["First", "One, revised"]]);
  });

  it("shows only the organization's own templates", async () => {
    const other = await createTenant();
    await save("Theirs", "Not yours.", other);
    await save("Ours", "Yours.");

    const list = await listTemplates(tenant.organizationId);
    expect(list.map((t) => t.name)).toEqual(["Ours"]);
  });
});

describe("archiveTemplate", () => {
  it("removes every version, so an older one does not come back", async () => {
    await save("Promo", "Old text");
    await save("Promo", "New text");
    const [latest] = await listTemplates(tenant.organizationId);

    await expect(archive(latest!.id)).resolves.toBe(true);
    await expect(listTemplates(tenant.organizationId)).resolves.toEqual([]);

    // Archived, not deleted: what was saved is still on record.
    const rows = await db.select().from(templates);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.archivedAt !== null)).toBe(true);
  });

  it("lets the name be used again, as the next version", async () => {
    await save("Promo", "Old text");
    const [first] = await listTemplates(tenant.organizationId);
    await archive(first!.id);

    await expect(save("Promo", "Fresh text")).resolves.toEqual({ version: 2 });

    const list = await listTemplates(tenant.organizationId);
    expect(list.map((t) => [t.body, t.version])).toEqual([["Fresh text", 2]]);
  });

  it("says so when the template is already gone", async () => {
    await save("Promo", "Text");
    const [promo] = await listTemplates(tenant.organizationId);
    await archive(promo!.id);

    await expect(archive(promo!.id)).resolves.toBe(false);
  });

  it("cannot remove another organization's template", async () => {
    const other = await createTenant();
    await save("Theirs", "Not yours.", other);
    const [theirs] = await listTemplates(other.organizationId);

    await expect(archive(theirs!.id)).resolves.toBe(false);
    await expect(listTemplates(other.organizationId)).resolves.toHaveLength(1);
  });
});
