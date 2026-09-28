import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { forPostgresJs } from "./url";

/**
 * One pooled client per process. Next.js dev reloads modules, so the client is
 * cached on globalThis to avoid exhausting connections.
 */
const globalForDb = globalThis as unknown as {
  __phSmsClient?: ReturnType<typeof postgres>;
};

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return forPostgresJs(url);
}

export const client =
  globalForDb.__phSmsClient ??
  postgres(connectionString(), {
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idle_timeout: 20,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__phSmsClient = client;

export const db = drizzle(client, { schema, casing: "snake_case" });

export type Db = typeof db;
/** Transaction handle type, so domain services can take either. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export { schema };
