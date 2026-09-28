import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Migrates the dedicated test database once per run. */
export async function setup() {
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgres://ph_sms:ph_sms_dev@127.0.0.1:54329/ph_sms_test";
  const sql = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  } finally {
    await sql.end();
  }
}
