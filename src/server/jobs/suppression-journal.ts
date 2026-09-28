import "@/server/load-env";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { db, client } from "@/server/db";
import { suppressions } from "@/server/db/schema";

/**
 * Opt-out journal.
 *
 * Exists because of a finding from the restore rehearsal: restoring a backup
 * loses every opt-out recorded since it was taken, AND loses the audit log that
 * would say which ones to re-apply. Both live in the same database. The runbook
 * step "re-apply every suppression recorded since the backup" was therefore not
 * executable from the database alone.
 *
 * This writes a copy that is meant to be stored SOMEWHERE ELSE — object
 * storage, a different provider, anywhere that does not share a failure domain
 * with the primary database. Export on a schedule; import after a restore.
 *
 *   npm run export-suppressions -- ./backups/opt-outs.json
 *   npm run import-suppressions -- ./backups/opt-outs.json
 *
 * The file contains keyed hashes and display masks, never plain numbers, so it
 * is not a contact list. It is only useful with the key that produced it, which
 * is why key rotation and this file have to be kept in step.
 */

type JournalEntry = {
  scope: "ORGANIZATION" | "PLATFORM";
  organizationId: string | null;
  numberHash: string;
  numberMasked: string;
  keyVersion: number;
  reason: string;
  source: string;
  evidenceRef: string | null;
  createdAt: string;
};

type Journal = {
  version: 1;
  exportedAt: string;
  entryCount: number;
  /** Detects truncation or tampering between export and import. */
  checksum: string;
  entries: JournalEntry[];
};

function checksumOf(entries: JournalEntry[]): string {
  const canonical = entries
    .map((e) => `${e.scope}|${e.organizationId ?? ""}|${e.numberHash}|${e.createdAt}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

export async function exportSuppressions(path: string): Promise<Journal> {
  const rows = await db.select().from(suppressions);

  const entries: JournalEntry[] = rows.map((row) => ({
    scope: row.scope,
    organizationId: row.organizationId,
    numberHash: row.numberHash,
    numberMasked: row.numberMasked,
    keyVersion: row.keyVersion,
    reason: row.reason,
    source: row.source,
    evidenceRef: row.evidenceRef,
    createdAt: row.createdAt.toISOString(),
  }));

  const journal: Journal = {
    version: 1,
    exportedAt: new Date().toISOString(),
    entryCount: entries.length,
    checksum: checksumOf(entries),
    entries,
  };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(journal, null, 2), "utf8");
  return journal;
}

export type ImportSummary = {
  read: number;
  restored: number;
  alreadyPresent: number;
};

/**
 * Re-applies a journal after a restore.
 *
 * Insert-only and idempotent: an opt-out already present is left alone, and
 * nothing is ever removed. Re-applying a stale journal can only over-suppress,
 * which is the safe direction to fail in.
 */
export async function importSuppressions(path: string): Promise<ImportSummary> {
  const raw = await readFile(path, "utf8");
  const journal = JSON.parse(raw) as Journal;

  if (journal.version !== 1) {
    throw new Error(`Unsupported journal version ${journal.version}`);
  }
  if (checksumOf(journal.entries) !== journal.checksum) {
    throw new Error(
      "Journal checksum does not match its contents. The file is truncated or altered; do not use it.",
    );
  }
  if (journal.entries.length !== journal.entryCount) {
    throw new Error("Journal entry count does not match its contents.");
  }

  let restored = 0;
  let alreadyPresent = 0;

  for (const entry of journal.entries) {
    const inserted = await db
      .insert(suppressions)
      .values({
        scope: entry.scope,
        organizationId: entry.organizationId,
        numberHash: entry.numberHash,
        numberMasked: entry.numberMasked,
        keyVersion: entry.keyVersion,
        reason: entry.reason,
        source: entry.source,
        evidenceRef: entry.evidenceRef,
        createdAt: new Date(entry.createdAt),
      })
      .onConflictDoNothing()
      .returning({ id: suppressions.id });

    if (inserted.length > 0) restored += 1;
    else alreadyPresent += 1;
  }

  return { read: journal.entries.length, restored, alreadyPresent };
}

if (process.argv[1]?.includes("suppression-journal")) {
  const mode = process.env.JOURNAL_MODE ?? "export";
  const path = process.argv[2] ?? "./backups/opt-outs.json";

  if (mode === "import") {
    const summary = await importSuppressions(path);
    console.log(
      `Read ${summary.read} entries: ${summary.restored} restored, ${summary.alreadyPresent} already present.`,
    );
    if (summary.restored > 0) {
      console.log(
        "\nThose opt-outs were missing from the database. Investigate why before sending anything.",
      );
    }
  } else {
    const journal = await exportSuppressions(path);
    console.log(`Exported ${journal.entryCount} opt-out(s) to ${path}`);
    console.log(
      "Store this OUTSIDE the primary database. It is the only way to re-apply\n" +
        "opt-outs after a restore — the audit log cannot help, it is restored too.",
    );
  }

  await client.end({ timeout: 5 });
}
