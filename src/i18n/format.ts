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
