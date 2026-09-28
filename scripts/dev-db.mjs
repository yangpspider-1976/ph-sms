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
  for (const db of [DEV_DB.database, DEV_DB.testDatabase, DEV_DB.e2eDatabase]) {
    try {
      await pg.createDatabase(db);
    } catch (err) {
      if (!String(err?.message ?? err).includes("already exists")) throw err;
    }
  }
  return pg;
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
