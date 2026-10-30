/** A canonical UUID: the form every id in the database takes. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a value taken from a URL can be an id at all.
 *
 * Check it before querying. PostgreSQL rejects a malformed uuid with an error
 * rather than matching nothing, so an unchecked mistyped link becomes a
 * server error instead of "not found".
 */
export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}
