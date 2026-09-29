import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db, resetDb } from "@/test/db";
import { createTenant, NUMBERS, type Tenant } from "@/test/fixtures";
import { auditEvents, contacts, imports, importRows, suppressions } from "@/server/db/schema";
import { MOCK_DEFAULTS } from "@/server/config";
import {
  commitImport,
  createImport,
  deleteContacts,
  expireImports,
  listContacts,
} from "./contacts";
import { addSuppression } from "./suppression";
import {
  exportCampaignReport,
  exportContacts,
  exportImportErrors,
  exportSuppressions,
} from "./exports";
import { numberHash } from "@/server/security/crypto";

/**
 * Requirement 12: deleting and re-importing a contact must not clear its
 * opt-out, opt-outs must not leak between tenants, and export and retention
 * actions must be audited.
 */

const csv = (body: string) => Buffer.from(body, "utf8");

const LIST = csv(
  [
    "phone_number,first_name,last_name",
    `${NUMBERS.ok(1)},Ana,Reyes`,
    `${NUMBERS.ok(2)},Ben,Santos`,
    `${NUMBERS.ok(3)},Cara,Cruz`,
  ].join("\n"),
);

let tenant: Tenant;

async function importAndCommit(bytes = LIST) {
  const outcome = await createImport({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    filename: "list.csv",
    bytes,
  });
  if (!outcome.ok) throw new Error(`import failed: ${outcome.code}`);
  const result = await commitImport({
    importId: outcome.preview.importId,
    organizationId: tenant.organizationId,
    userId: tenant.userId,
  });
  return { preview: outcome.preview, result };
}

beforeEach(async () => {
  await resetDb();
  tenant = await createTenant();
});
afterAll(closeDb);

describe("importing", () => {
  it("previews without adding anything to the contact list", async () => {
    const outcome = await createImport({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      filename: "list.csv",
      bytes: LIST,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.preview.counts.eligible).toBe(3);
    // Nothing is committed until the customer confirms.
    expect(await listContacts(tenant.organizationId)).toHaveLength(0);
  });

  it("commits reviewed rows into the contact list", async () => {
    const { result } = await importAndCommit();
    expect(result.added).toBe(3);
    expect(await listContacts(tenant.organizationId)).toHaveLength(3);
  });

  it("re-importing the same list updates rather than duplicating", async () => {
    await importAndCommit();
    const second = await importAndCommit();

    expect(second.result.added).toBe(0);
    expect(second.result.updated).toBe(3);
    expect(await listContacts(tenant.organizationId)).toHaveLength(3);
  });

  it("stores the original encrypted and never in the clear", async () => {
    const outcome = await createImport({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      filename: "list.csv",
      bytes: LIST,
    });
    if (!outcome.ok) throw new Error("expected success");

    const record = (
      await db.select().from(imports).where(eq(imports.id, outcome.preview.importId))
    )[0]!;
    expect(record.originalEncrypted).not.toBeNull();
    expect(record.originalEncrypted).not.toContain("+639");
    expect(record.originalEncrypted!.startsWith("v1.")).toBe(true);
  });

  it("previews a file at the row cap", async () => {
    // One INSERT for every row ran past PostgreSQL's 65,534 bind-parameter
    // limit at about 4,700 rows, so a file under the 10,000-row cap failed.
    const lines = ["phone_number,first_name"];
    for (let i = 1; i <= MOCK_DEFAULTS.maxDataRows; i += 1) lines.push(`${NUMBERS.ok(i)},Guest`);

    const outcome = await createImport({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      filename: "cap.csv",
      bytes: csv(lines.join("\n")),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.preview.counts.eligible).toBe(MOCK_DEFAULTS.maxDataRows);
    const stored = await db
      .select({ id: importRows.id })
      .from(importRows)
      .where(eq(importRows.importId, outcome.preview.importId));
    expect(stored).toHaveLength(MOCK_DEFAULTS.maxDataRows);
  });

  it("surfaces a parse failure rather than importing a broken file", async () => {
    const outcome = await createImport({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      filename: "bad.csv",
      bytes: csv("mobile\n09171234567\n"),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("MISSING_REQUIRED_COLUMN");
    expect(await db.select().from(imports)).toHaveLength(0);
  });
});

describe("suppression survives the contact lifecycle", () => {
  // Requirement 12, the central case.
  it("deleting and re-importing a contact does not clear its opt-out", async () => {
    await importAndCommit();

    // The recipient opts out.
    await db.transaction((tx) =>
      addSuppression(tx, {
        normalized: NUMBERS.ok(2),
        scope: "ORGANIZATION",
        organizationId: tenant.organizationId,
        reason: "Asked to stop",
        source: "OPERATOR_INTAKE",
      }),
    );

    // The business deletes the whole contact list...
    const all = await listContacts(tenant.organizationId);
    await deleteContacts({
      organizationId: tenant.organizationId,
      contactIds: all.map((c) => c.id),
      userId: tenant.userId,
    });
    expect(await listContacts(tenant.organizationId)).toHaveLength(0);

    // The opt-out is still there.
    const stillSuppressed = await db
      .select()
      .from(suppressions)
      .where(eq(suppressions.organizationId, tenant.organizationId));
    expect(stillSuppressed).toHaveLength(1);

    // ...and re-imports the same file.
    const again = await importAndCommit();

    // The opted-out number is not re-added. It is excluded at preview time, so
    // it is reported there rather than as a commit-time skip.
    expect(again.result.added).toBe(2);
    expect(again.preview.counts.suppressed).toBe(1);
    expect(again.preview.counts.eligible).toBe(2);

    const rebuilt = await listContacts(tenant.organizationId);
    expect(rebuilt).toHaveLength(2);
    expect(rebuilt.map((c) => c.numberHash)).not.toContain(numberHash(NUMBERS.ok(2)));
  });

  it("marks opted-out rows in the preview rather than silently dropping them", async () => {
    await db.transaction((tx) =>
      addSuppression(tx, {
        normalized: NUMBERS.ok(3),
        scope: "ORGANIZATION",
        organizationId: tenant.organizationId,
        reason: "Asked to stop",
        source: "OPERATOR_INTAKE",
      }),
    );

    const outcome = await createImport({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      filename: "list.csv",
      bytes: LIST,
    });
    if (!outcome.ok) throw new Error("expected success");

    expect(outcome.preview.counts.eligible).toBe(2);
    expect(outcome.preview.counts.suppressed).toBe(1);

    const rows = await db
      .select()
      .from(importRows)
      .where(eq(importRows.importId, outcome.preview.importId));
    const flagged = rows.find((r) => r.status === "SUPPRESSED");
    expect(flagged?.reasonDetail).toMatch(/opted out/i);
  });

  it("a platform block also keeps a number out of the contact list", async () => {
    await db.transaction((tx) =>
      addSuppression(tx, {
        normalized: NUMBERS.ok(1),
        scope: "PLATFORM",
        organizationId: null,
        reason: "Platform safety block",
        source: "ADMIN",
      }),
    );

    const { result, preview } = await importAndCommit();
    expect(result.added).toBe(2);
    expect(preview.counts.suppressed).toBe(1);
  });

  // The commit-time re-check exists for the gap between reviewing a preview and
  // confirming it, which can be minutes.
  it("drops a recipient who opts out between the preview and the commit", async () => {
    const outcome = await createImport({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      filename: "list.csv",
      bytes: LIST,
    });
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.preview.counts.eligible).toBe(3);

    await db.transaction((tx) =>
      addSuppression(tx, {
        normalized: NUMBERS.ok(2),
        scope: "ORGANIZATION",
        organizationId: tenant.organizationId,
        reason: "Opted out while the preview was open",
        source: "OPERATOR_INTAKE",
      }),
    );

    const result = await commitImport({
      importId: outcome.preview.importId,
      organizationId: tenant.organizationId,
      userId: tenant.userId,
    });

    expect(result.added).toBe(2);
    expect(result.skippedSuppressed).toBe(1);
    expect(await listContacts(tenant.organizationId)).toHaveLength(2);
  });
});

describe("import error rows (REC-06)", () => {
  const MESSY = csv(
    [
      "phone_number,first_name",
      `${NUMBERS.ok(1)},Ana`,
      "not-a-number,Ben",
      `${NUMBERS.ok(1)},Ana again`,
      ",Blank",
    ].join("\n"),
  );

  async function previewMessy() {
    const outcome = await createImport({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      filename: "messy.csv",
      bytes: MESSY,
    });
    if (!outcome.ok) throw new Error(`import failed: ${outcome.code}`);
    return outcome.preview;
  }

  it("contains row number, masked number and reason", async () => {
    const preview = await previewMessy();

    const file = await exportImportErrors({
      organizationId: tenant.organizationId,
      actorUserId: tenant.userId,
      importId: preview.importId,
    });

    expect(file!.content).toContain("row_number,phone_number_masked,reason,detail");
    expect(file!.content).toContain("Not a valid Philippine mobile number");
    expect(file!.content).toContain("Appears more than once in this file");
  });

  it("does not include rows that imported cleanly", async () => {
    const preview = await previewMessy();

    const file = await exportImportErrors({
      organizationId: tenant.organizationId,
      actorUserId: tenant.userId,
      importId: preview.importId,
    });

    // Row 2 is the only good row; a correction worksheet that listed it would
    // be a copy of the contact list by another name.
    const rows = file!.content.trim().split("\n").slice(1);
    expect(rows.some((r) => r.startsWith("2,"))).toBe(false);
    expect(rows).toHaveLength(3);
  });

  it("never exposes a full number, even to an owner", async () => {
    const preview = await previewMessy();

    const file = await exportImportErrors({
      organizationId: tenant.organizationId,
      actorUserId: tenant.userId,
      importId: preview.importId,
    });

    expect(file!.content).not.toContain(NUMBERS.ok(1));
  });

  it("will not read another organization's import", async () => {
    const preview = await previewMessy();
    const other = await createTenant();

    const file = await exportImportErrors({
      organizationId: other.organizationId,
      actorUserId: other.userId,
      importId: preview.importId,
    });

    expect(file).toBeNull();
  });

  it("is written to the audit log", async () => {
    const preview = await previewMessy();
    await exportImportErrors({
      organizationId: tenant.organizationId,
      actorUserId: tenant.userId,
      importId: preview.importId,
    });

    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "export.import_errors"));
    expect(events).toHaveLength(1);
  });
});

describe("column mapping (REC-02)", () => {
  it("says what each column was taken to mean", async () => {
    const outcome = await createImport({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      filename: "mapped.csv",
      bytes: csv(
        [
          "phone_number,first_name,loyalty_tier",
          `${NUMBERS.ok(1)},Ana,Gold`,
        ].join("\n"),
      ),
      acknowledgedUnknownColumns: true,
    });
    if (!outcome.ok) throw new Error(outcome.code);

    expect(outcome.preview.columnMapping).toEqual([
      { header: "phone_number", field: "Mobile number", used: true },
      { header: "first_name", field: "First name", used: true },
      { header: "loyalty_tier", field: "Ignored", used: false },
    ]);
  });
});

describe("exports", () => {
  it("masks numbers by default and neutralizes formulas", async () => {
    await importAndCommit(
      csv(["phone_number,first_name", `${NUMBERS.ok(1)},=cmd|'/c calc'!A0`].join("\n")),
    );

    const file = await exportContacts({
      organizationId: tenant.organizationId,
      actorUserId: tenant.userId,
      scope: "MASKED",
    });

    expect(file.content).toContain("phone_number_masked");
    expect(file.content).toContain("+63 917 *** ");
    // The full number is absent.
    expect(file.content).not.toContain(NUMBERS.ok(1));
    // The formula cannot execute when opened.
    expect(file.content).toContain("'=cmd");
    expect(file.content).not.toMatch(/(^|,)=cmd/m);
  });

  it("a full export contains real numbers and is audited separately", async () => {
    await importAndCommit();

    const file = await exportContacts({
      organizationId: tenant.organizationId,
      actorUserId: tenant.userId,
      scope: "FULL",
    });

    // A +63 number would be read as a formula without escaping.
    expect(file.content).toContain(`'${NUMBERS.ok(1)}`);

    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "export.contacts_full"));
    expect(events).toHaveLength(1);
    expect(events[0]!.actorUserId).toBe(tenant.userId);
  });

  it("every export writes an audit record", async () => {
    await importAndCommit();
    await exportContacts({
      organizationId: tenant.organizationId,
      actorUserId: tenant.userId,
      scope: "MASKED",
    });
    await exportSuppressions({
      organizationId: tenant.organizationId,
      actorUserId: tenant.userId,
    });

    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.organizationId, tenant.organizationId));
    const actions = events.map((e) => e.action);
    expect(actions).toContain("export.contacts_masked");
    expect(actions).toContain("export.suppression");
  });

  it("an opt-out export is always masked", async () => {
    await db.transaction((tx) =>
      addSuppression(tx, {
        normalized: NUMBERS.ok(5),
        scope: "ORGANIZATION",
        organizationId: tenant.organizationId,
        reason: "Asked to stop",
        source: "OPERATOR_INTAKE",
      }),
    );

    const file = await exportSuppressions({
      organizationId: tenant.organizationId,
      actorUserId: tenant.userId,
    });
    expect(file.content).not.toContain(NUMBERS.ok(5));
    expect(file.content).toContain("+63 917 *** ");
  });

  it("cannot export another tenant's campaign report", async () => {
    const other = await createTenant();
    const file = await exportCampaignReport({
      campaignId: "00000000-0000-0000-0000-000000000000",
      organizationId: other.organizationId,
      actorUserId: other.userId,
      scope: "MASKED",
    });
    expect(file).toBeNull();
  });
});

describe("retention", () => {
  it("expires stored originals and rejected rows once the window passes", async () => {
    const outcome = await createImport({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      filename: "list.csv",
      bytes: LIST,
    });
    if (!outcome.ok) throw new Error("expected success");

    // Wind the clock past the retention window.
    await db
      .update(imports)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(imports.id, outcome.preview.importId));

    expect(await expireImports()).toBe(1);

    const record = (
      await db.select().from(imports).where(eq(imports.id, outcome.preview.importId))
    )[0]!;
    expect(record.status).toBe("EXPIRED");
    expect(record.originalEncrypted).toBeNull();

    const rows = await db
      .select()
      .from(importRows)
      .where(eq(importRows.importId, outcome.preview.importId));
    expect(rows).toHaveLength(0);
  });

  it("leaves an import inside its window alone", async () => {
    await createImport({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      filename: "list.csv",
      bytes: LIST,
    });
    expect(await expireImports()).toBe(0);
  });

  it("does not delete contacts when an import expires", async () => {
    const { preview } = await importAndCommit();
    await db
      .update(imports)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(imports.id, preview.importId));

    await expireImports();
    // The upload is gone; the contacts it created are not.
    expect(await listContacts(tenant.organizationId)).toHaveLength(3);
  });
});
