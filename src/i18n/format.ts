import { LOCALE_TAGS, type Locale } from "./config";

/**
 * Locale-aware formatting.
 *
 * The time zone never changes: this is a Philippine platform, every timestamp
 * a customer sees is Asia/Manila, and showing a Korean reader a Seoul time for
 * a Manila send would be worse than useless. What the locale changes is how the
 * date is written, not which moment it names.
 *
 * The currency never changes either. Amounts are Philippine pesos; a Korean
 * reader gets Korean date order and Korean digit grouping conventions, but the
 * peso stays a peso.
 */

export const PLATFORM_TIME_ZONE = "Asia/Manila";

export function formatDateTime(
  at: Date | string | null | undefined,
  locale: Locale,
  fallback = "—",
): string {
  if (!at) return fallback;
  const value = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(value.getTime())) return fallback;

  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    timeZone: PLATFORM_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function formatDate(
  at: Date | string | null | undefined,
  locale: Locale,
  fallback = "—",
): string {
  if (!at) return fallback;
  const value = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(value.getTime())) return fallback;

  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    timeZone: PLATFORM_TIME_ZONE,
    dateStyle: "medium",
  }).format(value);
}

/**
 * Manila's offset from UTC. The Philippines has no daylight saving, so one
 * constant is the whole rule; a test holds it against PLATFORM_TIME_ZONE.
 */
const PLATFORM_UTC_OFFSET_MINUTES = 8 * 60;

/**
 * The moment a `datetime-local` value names, read as platform time.
 *
 * Such a value carries no time zone, and `new Date(value)` fills one in from
 * the browser. A field labelled Asia/Manila then meant Seoul time on a computer
 * in Seoul: 14:00 typed there was scheduled for 13:00 in Manila.
 *
 * Returns null unless the value is a complete, real date and time.
 */
export function platformWallTimeToDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/.exec(value);
  if (!match) return null;

  const [, y, mo, d, h, mi, s = "0"] = match;
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const wall = new Date(Date.UTC(Number(y), month - 1, day, hour, minute, Number(s)));
  // Date.UTC rolls an impossible date forward (31 February becomes 3 March).
  // Sending on a day nobody asked for is worse than refusing the value.
  if (
    wall.getUTCMonth() !== month - 1 ||
    wall.getUTCDate() !== day ||
    wall.getUTCHours() !== hour ||
    wall.getUTCMinutes() !== minute
  ) {
    return null;
  }

  return new Date(wall.getTime() - PLATFORM_UTC_OFFSET_MINUTES * 60_000);
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale]).format(value);
}

/**
 * Money, from integer centavos.
 *
 * Built from the integer rather than divided into a float: money is stored in
 * centavos precisely so it never passes through a binary fraction.
 */
export function formatMoney(centavos: number, locale: Locale): string {
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const pesos = new Intl.NumberFormat(LOCALE_TAGS[locale]).format(Math.floor(abs / 100));
  const rest = String(abs % 100).padStart(2, "0");
  return `${sign}₱${pesos}.${rest}`;
}
