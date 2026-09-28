/**
 * Localization.
 *
 * The platform ships English and Korean. Adding a language is one file plus one
 * entry here — the dictionary is a typed object, so a new locale that is
 * missing a string does not compile. That is deliberate: a runtime key lookup
 * would let an untranslated screen reach a customer and show a raw key.
 *
 * Locale is carried in a cookie rather than in the URL. That keeps the existing
 * route structure intact and works the same for the marketing site and the
 * signed-in app. If per-language URLs are needed later for search indexing,
 * a `[locale]` segment can be added on top of this without changing any of the
 * strings.
 */

export const LOCALES = ["en", "ko"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** The cookie the switcher writes and the server reads. */
export const LOCALE_COOKIE = "locale";

/** One year: a language choice is not something to ask about every week. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const LOCALE_NAMES: Record<Locale, string> = {
  // Each language is named in itself, because someone looking for their own
  // language is not necessarily reading the one currently on screen.
  en: "English",
  ko: "한국어",
};

/**
 * The BCP 47 tag for `<html lang>` and for `Intl` formatting.
 *
 * English is `en-PH`, not `en-US`: this platform is Philippine, and the date,
 * number and currency conventions that follow from the tag should be too.
 */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: "en-PH",
  ko: "ko-KR",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Picks the best locale from an `Accept-Language` header.
 *
 * Quality values are honoured, and a regional tag matches its base language so
 * `ko-KR` finds `ko`. Falls back to the default rather than guessing.
 */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const quality = q ? Number.parseFloat(q.split("=")[1] ?? "1") : 1;
      return { tag: (tag ?? "").trim().toLowerCase(), quality: Number.isNaN(quality) ? 0 : quality };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const entry of ranked) {
    const base = entry.tag.split("-")[0]!;
    if (isLocale(entry.tag)) return entry.tag;
    if (isLocale(base)) return base;
  }

  return DEFAULT_LOCALE;
}
