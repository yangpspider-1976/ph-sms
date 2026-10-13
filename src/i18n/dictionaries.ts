import "server-only";
import { en, type Dictionary } from "./locales/en";
import { ko } from "./locales/ko";
import { DEFAULT_LOCALE, type Locale } from "./config";

/**
 * Every dictionary, keyed by locale, for the server.
 *
 * Server components render from here through `getI18n()`. The browser never
 * imports this module: client components get the reader's dictionary alone,
 * through client-dictionaries.ts, and still read it synchronously. Importing
 * this table in a client component used to ship every language to every page;
 * `server-only` turns that mistake into a build error.
 */
export const DICTIONARIES: Record<Locale, Dictionary> = { en, ko };

export function dictionaryFor(locale: Locale | undefined): Dictionary {
  return DICTIONARIES[locale ?? DEFAULT_LOCALE] ?? DICTIONARIES[DEFAULT_LOCALE];
}

export type { Dictionary };
