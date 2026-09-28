
import "@/server/load-env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url =
  process.env.DATABASE_URL ?? "postgres://ph_sms:ph_sms_dev@127.0.0.1:54329/ph_sms";

const sql = postgres(url, { max: 1 });

try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("migrations applied:", url.replace(/:[^:@]+@/, ":***@"));
} finally {
  await sql.end();
}
