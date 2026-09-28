import "@/server/load-env";
import postgres from "postgres";

/**
 * Backup-restore rehearsal.
 *
 * The runbook claims a restore is safe if you re-apply retention and re-apply
 * the suppressions recorded since the backup. This script tests that claim
 * against a real database instead of trusting the prose.
 *
 * It works on throwaway databases (`ph_sms_rehearsal_*`) and never touches dev,
 * test or e2e data.
 *
 * The "backup" is taken with CREATE DATABASE ... TEMPLATE, a genuine physical
 * copy. `pg_dump` is not in the embedded PostgreSQL distribution used for local
 * development; on real infrastructure the backup would come from the managed
 * provider, and the hazard being tested is identical either way.
 *
 *   npm run rehearse-restore
 */

const ADMIN_URL =
  process.env.REHEARSAL_ADMIN_URL ??
  "postgres://ph_sms:ph_sms_dev@127.0.0.1:54329/postgres";

const LIVE = "ph_sms_rehearsal_live";
const BACKUP = "ph_sms_rehearsal_backup";

const urlFor = (dbName: string) => ADMIN_URL.replace(/\/[^/]+$/, `/${dbName}`);

type Step = { step: string; detail: string; ok: boolean };
const log: Step[] = [];

function record(step: string, detail: string, ok = true) {
  log.push({ step, detail, ok });
  console.log(`${ok ? "  ok  " : " FAIL "} ${step} — ${detail}`);
}

async function dropIfExists(admin: postgres.Sql, dbName: string) {
  await admin.unsafe(
    `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${dbName}' and pid <> pg_backend_pid()`,
  );
  await admin.unsafe(`drop database if exists ${dbName}`);
}

async function main() {
  const admin = postgres(ADMIN_URL, { max: 1 });

  console.log("Backup-restore rehearsal\n");

  /* --- 1. A live database with a customer's opt-out ---------------------- */

  await dropIfExists(admin, LIVE);
  await dropIfExists(admin, BACKUP);
  await admin.unsafe(`create database ${LIVE}`);

  let live = postgres(urlFor(LIVE), { max: 1 });
  await live.unsafe(`
    create table suppressions (
      id serial primary key,
      number_hash text not null unique,
      reason text not null,
      created_at timestamptz not null default now()
    );
    create table audit_events (
      id serial primary key,
      action text not null,
      object_id text,
      created_at timestamptz not null default now()
    );
  `);

  await live.unsafe(`
    insert into suppressions (number_hash, reason) values ('hash-before', 'opted out before backup');
    insert into audit_events (action, object_id) values ('suppression.added', 'hash-before');
  `);
  record("live database", "one opt-out recorded before the backup");

  /* --- 2. Take the backup ------------------------------------------------ */

  await live.end();
  await admin.unsafe(
    `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${LIVE}' and pid <> pg_backend_pid()`,
  );
  await admin.unsafe(`create database ${BACKUP} template ${LIVE}`);
  record("backup taken", `${BACKUP} copied from ${LIVE}`);

  /* --- 3. A customer opts out AFTER the backup --------------------------- */

  live = postgres(urlFor(LIVE), { max: 1 });
  await live.unsafe(`
    insert into suppressions (number_hash, reason) values ('hash-after', 'opted out after backup');
    insert into audit_events (action, object_id) values ('suppression.added', 'hash-after');
  `);
  record("after the backup", "a second customer asks to stop being messaged");

  /* --- 4. Disaster, then restore ----------------------------------------- */

  await live.end();
  await dropIfExists(admin, LIVE);
  await admin.unsafe(`create database ${LIVE} template ${BACKUP}`);
  record("restored", `${LIVE} recreated from ${BACKUP}`);

  /* --- 5. What survived? -------------------------------------------------- */

  live = postgres(urlFor(LIVE), { max: 1 });
  const after = await live.unsafe(
    `select number_hash from suppressions order by number_hash`,
  );
  const hashes = after.map((r: Record<string, unknown>) => r.number_hash as string);

  const lostOptOut = !hashes.includes("hash-after");
  record(
    "the hazard",
    lostOptOut
      ? "CONFIRMED — the opt-out recorded after the backup is gone. Sending would now reach someone who asked to stop."
      : "not reproduced (unexpected)",
    lostOptOut,
  );

  /* --- 6. Can the runbook's recovery step actually be carried out? -------- */

  const auditRows = await live.unsafe(
    `select object_id from audit_events where action = 'suppression.added'`,
  );
  const auditIds = auditRows.map((r: Record<string, unknown>) => r.object_id as string);
  const auditAlsoLost = !auditIds.includes("hash-after");

  record(
    "recovery source",
    auditAlsoLost
      ? "PROBLEM — the audit log lives in the same database, so the record of WHAT to re-apply was restored away too. The runbook's 're-apply suppressions recorded since the backup' is not executable from the database alone."
      : "the audit log survived and can drive the re-application",
    !auditAlsoLost,
  );

  /* --- 7. With an off-database export, recovery works -------------------- */

  // This is what the export is for: a copy held outside the database.
  const offDatabaseExport = [
    { number_hash: "hash-before", reason: "opted out before backup" },
    { number_hash: "hash-after", reason: "opted out after backup" },
  ];

  for (const row of offDatabaseExport) {
    await live.unsafe(
      `insert into suppressions (number_hash, reason) values ('${row.number_hash}', '${row.reason}')
       on conflict (number_hash) do nothing`,
    );
  }

  const recovered = await live.unsafe(`select number_hash from suppressions`);
  const recoveredHashes = recovered.map(
    (r: Record<string, unknown>) => r.number_hash as string,
  );
  const fixed = recoveredHashes.includes("hash-after");
  record(
    "recovery applied",
    fixed
      ? "re-applying an off-database opt-out export restored the missing opt-out"
      : "recovery failed",
    fixed,
  );

  /* --- Clean up ----------------------------------------------------------- */

  await live.end();
  await dropIfExists(admin, LIVE);
  await dropIfExists(admin, BACKUP);
  await admin.end();

  const failures = log.filter((l) => !l.ok);
  console.log(
    `\n${log.length - failures.length}/${log.length} steps as expected.` +
      (failures.length > 0
        ? `\n\nFindings to carry into the runbook:\n${failures
            .map((f) => `  - ${f.step}: ${f.detail}`)
            .join("\n")}`
        : ""),
  );
}

await main();
