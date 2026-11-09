/**
 * Local development/test PostgreSQL server.
 *
 * The deployment target is an ordinary PostgreSQL server reached through
 * DATABASE_URL (see docker-compose.yml). This script only exists so the app,
 * its migrations and its concurrency tests can run on a machine that has
 * neither Docker nor a system PostgreSQL installed. It is dev-only and is
 * never imported by application code.
 *
 *   node scripts/dev-db.mjs start    # start (foreground, Ctrl+C to stop)
 *   node scripts/dev-db.mjs up       # start, print URL, exit (leaves server running)
 *   node scripts/dev-db.mjs stop     # stop a server started with `up`
 *   node scripts/dev-db.mjs reset    # delete the cluster and re-create it
 */
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolve(root, ".pgdata");

export const DEV_DB = {
  user: "ph_sms",
  password: "ph_sms_dev",
  port: Number(process.env.DEV_DB_PORT ?? 54329),
  database: "ph_sms",
  testDatabase: "ph_sms_test",
  e2eDatabase: "ph_sms_e2e",
};

export const devDatabaseUrl = (db = DEV_DB.database) =>
  `postgres://${DEV_DB.user}:${DEV_DB.password}@127.0.0.1:${DEV_DB.port}/${db}`;

export function createServer() {
  return new EmbeddedPostgres({
    databaseDir: dataDir,
    user: DEV_DB.user,
    password: DEV_DB.password,
    port: DEV_DB.port,
    persistent: true,
    // UTF-8, as the hosted database is. Without this, initdb on Windows takes
    // the system code page (WIN1252), which cannot store Korean.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
    onError: () => {},
  });
}

/** Start the cluster, creating it and the databases on first use. */
export async function startServer() {
  const pg = createServer();
  const fresh = !existsSync(dataDir);
  if (fresh) await pg.initialise();
  await pg.start();
  const admin = postgres(devDatabaseUrl("postgres"), { max: 1, onnotice: () => {} });
  try {
    await ensureUtf8Database(admin, DEV_DB.database, { disposable: false });
    await ensureUtf8Database(admin, DEV_DB.testDatabase, { disposable: true });
    await ensureUtf8Database(admin, DEV_DB.e2eDatabase, { disposable: true });
  } finally {
    await admin.end();
  }
  return pg;
}

/**
 * Creates a database as UTF-8, whatever the cluster's own default.
 *
 * A cluster initialised before `initdbFlags` above is WIN1252, and so is every
 * database it created. The test databases are migrated and seeded afresh by
 * every run, so one in another encoding is re-created. The development
 * database holds whatever was put in it, so it is only reported.
 */
async function ensureUtf8Database(admin, name, { disposable }) {
  const rows = await admin`
    select pg_encoding_to_char(encoding) as encoding from pg_database where datname = ${name}`;
  const encoding = rows[0]?.encoding;
  if (encoding === "UTF8") return;
  if (encoding && !disposable) {
    console.warn(
      `${name} stores text as ${encoding}, so Korean cannot be saved in it. ` +
        "`node scripts/dev-db.mjs reset` re-creates the cluster as UTF-8, deleting its data.",
    );
    return;
  }
  if (encoding) {
    await admin.unsafe(`drop database "${name}" with (force)`);
    console.log(`re-creating ${name} as UTF-8 (it was ${encoding})`);
  }
  await admin.unsafe(
    `create database "${name}" encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`,
  );
}

const command = process.argv[2] ?? "start";

if (command === "reset") {
  if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
  console.log("removed", dataDir);
} else if (command === "stop") {
  const pg = createServer();
  await pg.stop();
  console.log("stopped");
} else {
  const pg = await startServer();
  console.log(`postgres ready on port ${DEV_DB.port}`);
  console.log(`DATABASE_URL=${devDatabaseUrl()}`);
  console.log(`TEST_DATABASE_URL=${devDatabaseUrl(DEV_DB.testDatabase)}`);
  console.log(`E2E_DATABASE_URL=${devDatabaseUrl(DEV_DB.e2eDatabase)}`);
  if (command === "up") {
    process.exit(0); // leave the server running in the background
  }
  const shutdown = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
