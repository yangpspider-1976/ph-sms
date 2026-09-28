/**
 * Prepares a connection string for postgres.js.
 *
 * postgres.js forwards any URL parameter it does not recognise to the server
 * as a setting. Neon's connection strings carry `channel_binding=require`,
 * which is a client-side option in libpq, and the server rejects it as an
 * unrecognized configuration parameter. Every connection fails.
 *
 * Dropping it does not weaken the connection. postgres.js authenticates with
 * plain SCRAM-SHA-256 and never does channel binding, and TLS is still
 * governed by `sslmode`.
 */
export function forPostgresJs(connectionString: string): string {
  const url = new URL(connectionString);
  if (!url.searchParams.has("channel_binding")) return connectionString;
  url.searchParams.delete("channel_binding");
  return url.toString();
}
