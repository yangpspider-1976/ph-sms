import { sql } from "drizzle-orm";
import { db, client } from "@/server/db";

/**
 * Tables truncated between tests.
 *
 * Discovered from the database rather than listed by hand: a hand-written list
 * silently stops covering a table the moment one is added, and the symptom is
 * rows leaking between test cases far away from the change that caused it.
 * Truncated in one statement so foreign keys do not dictate an order.
 */
let cachedTables: string[] | null = null;

async function truncatableTables(): Promise<string[]> {
  if (cachedTables) return cachedTables;

  const rows = await db.execute<{ table_name: string }>(sql`
    select table_name
      from information_schema.tables
     where table_schema = 'public'
       and table_type = 'BASE TABLE'
       -- Drizzle's own bookkeeping; wiping it would re-run every migration.
       and table_name not like '__drizzle%'
  `);

  cachedTables = rows.map((r) => `"${r.table_name}"`);
  return cachedTables;
}

export async function resetDb(): Promise<void> {
  const tables = await truncatableTables();
  await db.execute(sql.raw(`truncate table ${tables.join(", ")} restart identity cascade`));
}

export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}

export { db };
