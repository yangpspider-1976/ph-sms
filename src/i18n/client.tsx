"use client";

import dynamic from "next/dynamic";
import {
  createContext,
  use,
  useContext,
  useMemo,
  type ComponentType,
  type ReactNode,
} from "react";
import { LOCALE_TAGS, type Locale } from "./config";
import type { Dictionary } from "./dictionaries";
import { localizeServerText } from "./server-text";

/**
 * Dictionary access for client components.
 *
 * The browser loads the reader's language and nothing else. This file used to
 * import every dictionary statically, which put both languages into the
 * scripts of every page: about 54 KB compressed, half of it in a language the
 * reader had not chosen. Each language is now its own chunk, imported on
 * demand, and only the one being read is ever downloaded.
 *
 * Reads stay synchronous. The provider waits for the dictionary before it
 * renders anything below it, so a component never sees a missing dictionary
 * and no screen needs a loading state for its own labels. And the provider is
 * the same component whichever language it holds, so switching language
 * re-renders the page in place rather than remounting it and losing whatever
 * was typed.
 */

const LOADERS: Record<Locale, () => Promise<Dictionary>> = {
  en: () => import("./locales/en").then((module) => module.en),
  ko: () => import("./locales/ko").then((module) => module.ko),
};

/**
 * Dictionaries already loaded, and loads in flight. Module-level, so each
 * language is fetched once per tab (and once per server process); a
 * dictionary never changes after it loads.
 */
const loaded = new Map<Locale, Dictionary>();
const loading = new Map<Locale, Promise<Dictionary>>();

function load(locale: Locale): Promise<Dictionary> {
  let promise = loading.get(locale);
  if (!promise) {
    promise = LOADERS[locale]().then(
      (dictionary) => {
        loaded.set(locale, dictionary);
        return dictionary;
      },
      (error: unknown) => {
        // A failed chunk load is not cached, so the next render tries again.
        loading.delete(locale);
        throw error;
      },
    );
    loading.set(locale, promise);
  }
  return promise;
}

/**
 * Renders nothing; exists for its side effect. A `dynamic()` component adds a
 * preload for its module's chunk to the page while it is rendered on the
 * server, so the browser fetches the reader's dictionary alongside the page's
 * other scripts instead of discovering it only once they have run. The
 * dictionary itself still comes from `load()` above: same module, same chunk.
 */
const Nothing = () => null;
const PRELOAD: Record<Locale, ComponentType> = {
  en: dynamic(() => import("./locales/en").then(() => Nothing)),
  ko: dynamic(() => import("./locales/ko").then(() => Nothing)),
};

type I18nValue = { locale: Locale; tag: string; t: Dictionary };

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  // Suspends only while this language's chunk is on its way: once per tab per
  // language, and during a language switch inside the refresh's transition,
  // which keeps the current page on screen until the new language is ready.
  const t = loaded.get(locale) ?? use(load(locale));
  // Stable across re-renders of the root layout (every refresh renders it),
  // so components that read the dictionary re-render only when it changes.
  const value = useMemo(() => ({ locale, tag: LOCALE_TAGS[locale], t }), [locale, t]);
  const Preload = PRELOAD[locale];

  return (
    <I18nContext.Provider value={value}>
      <Preload />
      {children}
    </I18nContext.Provider>
  );
}

function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useT() and useLocale() need an <I18nProvider> above them, which the root layout renders.");
  }
  return value;
}

/** The current dictionary. */
export function useT(): Dictionary {
  return useI18n().t;
}

/** Locale and its BCP 47 tag, for components that format values themselves. */
export function useLocale(): { locale: Locale; tag: string } {
  const { locale, tag } = useI18n();
  return { locale, tag };
}

type LocalizeServerText = {
  (text: string): string;
  (text: string | null | undefined): string | null;
};

/**
 * A message the server composed in English, in the reader's language (see
 * server-text.ts). Client components translate through this hook rather than
 * importing server-text.ts themselves, which keeps the English message list in
 * the bundle every page already loads. When only the pages that translate
 * messages included it, the bundler computed a page-specific variant of the
 * English dictionary's chunk for them, and the preload it emitted named a
 * chunk that was never written: a 404 on every visit to those pages.
 */
export function useServerText(): LocalizeServerText {
  const { t } = useI18n();
  return useMemo(
    () => ((text: string | null | undefined) => localizeServerText(text, t)) as LocalizeServerText,
    [t],
  );
}
