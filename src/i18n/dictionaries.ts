import { en, type Dictionary } from "./locales/en";
import { ko } from "./locales/ko";
import { DEFAULT_LOCALE, type Locale } from "./config";

/**
 * Every dictionary, keyed by locale.
 *
 * Imported statically rather than loaded on demand. Two languages of plain
 * strings is a small amount of JavaScript, and a static import means a client
 * component can read its dictionary synchronously — no loading state on the
 * first paint of every screen.
 */
export const DICTIONARIES: Record<Locale, Dictionary> = { en, ko };

export function dictionaryFor(locale: Locale | undefined): Dictionary {
  return DICTIONARIES[locale ?? DEFAULT_LOCALE] ?? DICTIONARIES[DEFAULT_LOCALE];
}

export type { Dictionary };
