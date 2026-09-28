import "server-only";
import { and, count, desc, eq, inArray, lt } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import { contacts, importRows, imports } from "@/server/db/schema";
import { MOCK_DEFAULTS, type AppConfig } from "@/server/config";
import { currentKeyVersion, decrypt, encrypt, numberHash } from "@/server/security/crypto";
import { maskNormalized } from "./phone";
import { parseContactCsv, type CsvParseResult } from "./csv";
import { findSuppressedNumbers } from "./suppression";
import { recordAudit } from "@/server/audit";

/**
 * Contact imports.
 *
 * Importing never touches the suppression list. Deleting a contact does not
 * remove its opt-out either — the two are separate records on purpose, so a
 * customer cannot clear opt-outs by deleting and re-importing a list.
 */

export type ImportPreview = {
  importId: string;
  counts: {
    rawRows: number;
    eligible: number;
    blank: number;
    invalid: number;
    duplicate: number;
    suppressed: number;
    overCeiling: number;
  };
  unknownColumns: string[];
  /**
   * What each column in the file was taken to mean (REC-02). Shown before the
   * import so the customer can see a mistake — a file whose `last_name` column
   * is really a middle name is not something the parser can detect.
   */
  columnMapping: Array<{ header: string; field: string; used: boolean }>;
  sample: Array<{
    sourceRowNumber: number;
    masked: string | null;
    raw: string;
    status: string;
    reason: string | null;
  }>;
};

export type ImportOutcome =
  | { ok: true; preview: ImportPreview }
  | { ok: false; code: string; message: string; detail?: string[] };

/**
 * Parses an upload and stores the result for review.
 *
 * Nothing is added to the contact list here: the customer confirms the preview
 * first. The original file is stored encrypted and is deleted by the retention
 * job.
 */
export async function createImport(input: {
  organizationId: string;
  userId: string;
  filename: string;
  bytes: Buffer;
  acknowledgedUnknownColumns?: boolean;
  config?: AppConfig;
}): Promise<ImportOutcome> {
  const config = input.config ?? MOCK_DEFAULTS;

  const parsed: CsvParseResult = parseContactCsv(input.bytes, config, {
    acknowledgedUnknownColumns: input.acknowledgedUnknownColumns,
  });

  if (!parsed.ok) {
    return { ok: false, code: parsed.code, message: parsed.message, detail: parsed.detail };
  }

  // Opt-outs are applied to the preview so the counts the customer confirms are
  // the real ones.
  const eligibleRows = parsed.rows.filter((r) => r.status === "ELIGIBLE" && r.normalized);
  const suppressed = await findSuppressedNumbers(
    db,
    input.organizationId,
    eligibleRows.map((r) => r.normalized!),
  );

  const expiresAt = new Date(Date.now() + config.uploadRetentionHours * 3_600_000);

  return db.transaction(async (tx) => {
    const [record] = await tx
      .insert(imports)
      .values({
        organizationId: input.organizationId,
        createdBy: input.userId,
        filename: input.filename.slice(0, 200),
        byteSize: input.bytes.length,
        status: "READY",
        // Encrypted at rest, deleted on the retention schedule. Never logged.
        originalEncrypted: encrypt(input.bytes.toString("utf8")),
        ignoredColumns: parsed.unknownColumns,
        rawRowCount: parsed.counts.rawRows,
        blankCount: parsed.counts.blank,
        invalidCount: parsed.counts.invalid,
        duplicateCount: parsed.counts.duplicate,
        expiresAt,
      })
      .returning({ id: imports.id });

    const importId = record!.id;
    let eligible = 0;
    let suppressedCount = 0;

    const rows = parsed.rows.map((row) => {
      let status = row.status as (typeof importRows.$inferInsert)["status"];
      let reason = row.reasonDetail;

      if (row.status === "ELIGIBLE" && row.normalized) {
        if (suppressed.has(row.normalized)) {
          status = "SUPPRESSED";
          reason = "This number has opted out";
          suppressedCount += 1;
        } else {
          eligible += 1;
        }
      }

      return {
        importId,
        organizationId: input.organizationId,
        sourceRowNumber: row.sourceRowNumber,
        rawValue: row.rawValue.slice(0, 64),
        numberHash: row.normalized ? numberHash(row.normalized) : null,
        numberEncrypted: row.normalized ? encrypt(row.normalized) : null,
        numberMasked: row.normalized ? maskNormalized(row.normalized) : null,
        status,
        reasonDetail: reason,
        firstName: row.firstName,
        lastName: row.lastName,
        custom: row.custom,
        consentSource: row.consentSource,
        consentDate: row.consentDate,
      };
    });

    if (rows.length > 0) await tx.insert(importRows).values(rows);

    await tx
      .update(imports)
      .set({ eligibleCount: eligible, suppressedCount })
      .where(eq(imports.id, importId));

    await recordAudit(
      {
        action: "contacts.import_previewed",
        organizationId: input.organizationId,
        actorUserId: input.userId,
        objectType: "import",
        objectId: importId,
        metadata: { rows: parsed.counts.rawRows, eligible, suppressed: suppressedCount },
      },
      tx,
    );

    const sample = rows.slice(0, 25).map((r) => ({
      sourceRowNumber: r.sourceRowNumber,
      masked: r.numberMasked,
      raw: r.rawValue ?? "",
      status: r.status as string,
      reason: r.reasonDetail ?? null,
    }));

    return {
      ok: true,
      preview: {
        importId,
        counts: {
          rawRows: parsed.counts.rawRows,
          eligible,
          blank: parsed.counts.blank,
          invalid: parsed.counts.invalid,
          duplicate: parsed.counts.duplicate,
          suppressed: suppressedCount,
          overCeiling: 0,
        },
        unknownColumns: parsed.unknownColumns,
        columnMapping: describeColumns(parsed.headers),
        sample,
      },
    };
  });
}

/** Human wording for each column the platform understands. */
const COLUMN_MEANINGS: Record<string, string> = {
  phone_number: "Mobile number",
  first_name: "First name",
  last_name: "Last name",
  consent_source: "How they agreed to hear from you",
  consent_date: "When they agreed",
  custom_1: "Custom field 1",
  custom_2: "Custom field 2",
  custom_3: "Custom field 3",
  custom_4: "Custom field 4",
  custom_5: "Custom field 5",
};

/** Maps the file's headers to what the import will do with each (REC-02). */
function describeColumns(headers: string[]): ImportPreview["columnMapping"] {
  return headers.map((header) => {
    const meaning = COLUMN_MEANINGS[header];
    return {
      header,
      field: meaning ?? "Ignored",
      used: Boolean(meaning),
    };
  });
}

/**
 * Commits a reviewed import into the contact list.
 *
 * Only rows that are still eligible are written, and the suppression list is
 * re-checked at this point in case someone opted out while the preview was on
 * screen.
 */
export async function commitImport(input: {
  importId: string;
  organizationId: string;
  userId: string;
}): Promise<{ added: number; updated: number; skippedSuppressed: number }> {
  return db.transaction(async (tx) => {
    const record = (
      await tx
        .select()
        .from(imports)
        .where(
          and(eq(imports.id, input.importId), eq(imports.organizationId, input.organizationId)),
        )
        .limit(1)
    )[0];
    if (!record) throw new Error("Import not found");

    const rows = await tx
      .select()
      .from(importRows)
      .where(
        and(eq(importRows.importId, input.importId), eq(importRows.status, "ELIGIBLE")),
      );

    // Re-checked from the plain number so a key rotation cannot let an
    // opted-out recipient back onto the list.
    const usable = rows.filter((r) => r.numberHash && r.numberEncrypted && r.numberMasked);
    const plainByRow = new Map(usable.map((r) => [r.id, decrypt(r.numberEncrypted!)]));
    const suppressed = await findSuppressedNumbers(tx, input.organizationId, [
      ...plainByRow.values(),
    ]);

    let added = 0;
    let updated = 0;
    let skippedSuppressed = 0;

    for (const row of usable) {
      // Narrowed here rather than by the filter above: filtering does not
      // change the element type, and these columns are non-null downstream.
      const { numberEncrypted, numberMasked } = row;
      if (!numberEncrypted || !numberMasked) continue;

      const plain = plainByRow.get(row.id);
      if (!plain || suppressed.has(plain)) {
        skippedSuppressed += 1;
        continue;
      }

      // Re-importing an existing contact updates its details; it never revives
      // an opt-out, because opt-outs live in a different table entirely.
      const result = await tx
        .insert(contacts)
        .values({
          organizationId: input.organizationId,
          // Re-hashed under the current key, so a commit during a rotation
          // writes the new key version rather than carrying the old one over.
          numberHash: numberHash(plain),
          numberEncrypted,
          numberMasked,
          keyVersion: currentKeyVersion(),
          firstName: row.firstName,
          lastName: row.lastName,
          custom: row.custom,
          consentSource: row.consentSource,
          consentDate: row.consentDate ? new Date(row.consentDate) : null,
        })
        .onConflictDoUpdate({
          target: [contacts.organizationId, contacts.numberHash],
          set: {
            firstName: row.firstName,
            lastName: row.lastName,
            custom: row.custom,
            consentSource: row.consentSource,
            updatedAt: new Date(),
          },
        })
        .returning({ created: contacts.createdAt, updatedAt: contacts.updatedAt });

      const returned = result[0];
      if (returned && returned.created.getTime() === returned.updatedAt.getTime()) added += 1;
      else updated += 1;
    }

    await recordAudit(
      {
        action: "contacts.import_committed",
        organizationId: input.organizationId,
        actorUserId: input.userId,
        objectType: "import",
        objectId: input.importId,
        metadata: { added, updated, skippedSuppressed },
      },
      tx,
    );

    return { added, updated, skippedSuppressed };
  });
}

export async function listContacts(organizationId: string, limit = 100) {
  return db
    .select()
    .from(contacts)
    .where(eq(contacts.organizationId, organizationId))
    .orderBy(desc(contacts.createdAt))
    .limit(limit);
}

export async function countContacts(organizationId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(contacts)
    .where(eq(contacts.organizationId, organizationId));
  return Number(rows[0]?.n ?? 0);
}

/**
 * Deletes contacts. Their suppression records are deliberately left alone: a
 * person who opted out stays opted out whether or not the business keeps their
 * contact row.
 */
export async function deleteContacts(input: {
  organizationId: string;
  contactIds: string[];
  userId: string;
}): Promise<number> {
  if (input.contactIds.length === 0) return 0;

  const deleted = await db
    .delete(contacts)
    .where(
      and(
        eq(contacts.organizationId, input.organizationId),
        inArray(contacts.id, input.contactIds),
      ),
    )
    .returning({ id: contacts.id });

  await recordAudit({
    action: "contacts.deleted",
    organizationId: input.organizationId,
    actorUserId: input.userId,
    objectType: "contacts",
    metadata: { count: deleted.length },
  });

  return deleted.length;
}

export async function listImports(organizationId: string, limit = 20) {
  return db
    .select()
    .from(imports)
    .where(eq(imports.organizationId, organizationId))
    .orderBy(desc(imports.createdAt))
    .limit(limit);
}

export async function getImportRows(
  importId: string,
  organizationId: string,
  limit = 200,
) {
  return db
    .select()
    .from(importRows)
    .where(
      and(
        eq(importRows.importId, importId),
        eq(importRows.organizationId, organizationId),
      ),
    )
    .orderBy(importRows.sourceRowNumber)
    .limit(limit);
}

/**
 * Retention: drops stored originals and rejected rows once their window is up.
 * Campaign snapshots are on a separate, longer schedule and are untouched here.
 */
export async function expireImports(tx: DbOrTx = db, now = new Date()): Promise<number> {
  const due = await tx
    .select({ id: imports.id })
    .from(imports)
    .where(and(lt(imports.expiresAt, now), eq(imports.status, "READY")));

  if (due.length === 0) return 0;
  const ids = due.map((d) => d.id);

  await tx.delete(importRows).where(inArray(importRows.importId, ids));
  await tx
    .update(imports)
    .set({ status: "EXPIRED", originalEncrypted: null })
    .where(inArray(imports.id, ids));

  return ids.length;
}

/**
 * Corrects the details on a contact.
 *
 * The number itself is deliberately NOT editable here. Changing a number in
 * place would move a consent record and any opt-out reasoning onto a different
 * person: the number is the identity of the record. To reach a different
 * number, add it as its own contact and delete this one.
 */
export async function updateContact(input: {
  organizationId: string;
  userId: string;
  contactId: string;
  firstName?: string | null;
  lastName?: string | null;
  consentSource?: string | null;
  tags?: string[];
}): Promise<{ ok: boolean }> {
  const updated = await db
    .update(contacts)
    .set({
      firstName: input.firstName?.trim() || null,
      lastName: input.lastName?.trim() || null,
      consentSource: input.consentSource?.trim() || null,
      tags: normalizeTags(input.tags),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contacts.id, input.contactId),
        eq(contacts.organizationId, input.organizationId),
      ),
    )
    .returning({ id: contacts.id });

  if (updated.length === 0) return { ok: false };

  await recordAudit({
    action: "contacts.updated",
    organizationId: input.organizationId,
    actorUserId: input.userId,
    objectType: "contact",
    objectId: input.contactId,
    // Field names only. The values are customer data and the audit log is
    // read by platform staff.
    metadata: { fields: ["firstName", "lastName", "consentSource", "tags"] },
  });

  return { ok: true };
}

/** Trimmed, de-duplicated, case-preserved, capped. Null when empty. */
function normalizeTags(tags: string[] | undefined): string[] | null {
  if (!tags) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed.slice(0, 40));
    if (out.length === 20) break;
  }
  return out.length > 0 ? out : null;
}

/** One contact, for its own screen. Masked; the number is never editable. */
export async function getContact(input: {
  organizationId: string;
  contactId: string;
}) {
  const [row] = await db
    .select({
      id: contacts.id,
      masked: contacts.numberMasked,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      tags: contacts.tags,
      consentSource: contacts.consentSource,
      consentDate: contacts.consentDate,
      createdAt: contacts.createdAt,
      updatedAt: contacts.updatedAt,
    })
    .from(contacts)
    .where(
      and(eq(contacts.id, input.contactId), eq(contacts.organizationId, input.organizationId)),
    )
    .limit(1);

  return row ?? null;
}
