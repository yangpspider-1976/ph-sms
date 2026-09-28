"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, LOCALE_TAGS, type Locale } from "./config";
import { dictionaryFor, type Dictionary } from "./dictionaries";

/**
 * Dictionary access for client components.
 *
 * Only the locale string crosses the server/client boundary. The dictionary
 * itself is looked up here, because it contains functions and functions cannot
 * be serialized into a client component's props.
 */

type I18nValue = { locale: Locale; tag: string; t: Dictionary };

const I18nContext = createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  tag: LOCALE_TAGS[DEFAULT_LOCALE],
  t: dictionaryFor(DEFAULT_LOCALE),
});

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <I18nContext.Provider
      value={{ locale, tag: LOCALE_TAGS[locale], t: dictionaryFor(locale) }}
    >
      {children}
    </I18nContext.Provider>
  );
}

/** The current dictionary. */
export function useT(): Dictionary {
  return useContext(I18nContext).t;
}

/** Locale and its BCP 47 tag, for components that format values themselves. */
export function useLocale(): { locale: Locale; tag: string } {
  const { locale, tag } = useContext(I18nContext);
  return { locale, tag };
}
