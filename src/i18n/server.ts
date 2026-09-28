import "server-only";
import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  LOCALE_TAGS,
  negotiateLocale,
  type Locale,
} from "./config";
import { dictionaryFor, type Dictionary } from "./dictionaries";

/**
 * Locale for the current request.
 *
 * An explicit choice wins: once someone has picked a language, their browser's
 * preference stops overriding it. Otherwise `Accept-Language` decides, so a
 * Korean-speaking visitor sees Korean on their first visit without having to
 * find the switcher.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const chosen = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;

  try {
    const hdrs = await headers();
    return negotiateLocale(hdrs.get("accept-language"));
  } catch {
    // Headers are unavailable in some rendering contexts; the default is fine.
    return DEFAULT_LOCALE;
  }
}

/** The dictionary for the current request. */
export async function getDictionary(): Promise<Dictionary> {
  return dictionaryFor(await getLocale());
}

/** Locale and dictionary together, for the common case of needing both. */
export async function getI18n(): Promise<{
  locale: Locale;
  tag: string;
  t: Dictionary;
}> {
  const locale = await getLocale();
  return { locale, tag: LOCALE_TAGS[locale], t: dictionaryFor(locale) };
}
