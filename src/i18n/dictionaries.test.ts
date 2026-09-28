import { describe, expect, it } from "vitest";
import { DICTIONARIES } from "./dictionaries";
import { en } from "./locales/en";
import { DEFAULT_LOCALE, isLocale, LOCALES, negotiateLocale } from "./config";

/**
 * Dictionary integrity.
 *
 * TypeScript already refuses to compile a locale that is missing a key, so
 * these tests cover what types cannot: a translation quietly left in English,
 * an empty string, or a function that takes a different number of arguments in
 * one language than another and so drops a value from the sentence.
 */

type Node = Record<string, unknown>;

/** Every leaf path in a dictionary, as dotted keys. */
function paths(node: Node, prefix = ""): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object") {
      out.push(...paths(value as Node, path));
    } else {
      out.push(path);
    }
  }
  return out.sort();
}

function at(node: Node, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc as Node)?.[key], node);
}

/**
 * Strings that are legitimately the same in every language: punctuation, and
 * product or protocol names that are not translated.
 */
const SHARED_BY_DESIGN = new Set([
  "common.dash",
  // An email address is written the same way in both languages.
  "auth.login.emailPlaceholder",
  "settings.team.emailPlaceholder",
  // A filename, not prose.
  "publicExtra.uploadCardFileName",
]);

describe("dictionary structure", () => {
  for (const locale of LOCALES) {
    it(`${locale} has exactly the keys the source defines`, () => {
      expect(paths(DICTIONARIES[locale] as Node)).toEqual(paths(en as Node));
    });

    it(`${locale} has no empty values`, () => {
      const empty = paths(DICTIONARIES[locale] as Node).filter((path) => {
        const value = at(DICTIONARIES[locale] as Node, path);
        return typeof value === "string" && value.trim().length === 0;
      });
      expect(empty).toEqual([]);
    });

    it(`${locale} functions take the same arguments as the source`, () => {
      const mismatched = paths(en as Node).filter((path) => {
        const source = at(en as Node, path);
        const translated = at(DICTIONARIES[locale] as Node, path);
        if (typeof source !== "function") return false;
        // A translation that takes fewer arguments has dropped a value out of
        // the sentence — the number or name simply never appears.
        return typeof translated !== "function" || translated.length !== source.length;
      });
      expect(mismatched).toEqual([]);
    });
  }
});

describe("translation coverage", () => {
  for (const locale of LOCALES.filter((l) => l !== DEFAULT_LOCALE)) {
    it(`${locale} has no strings left in English`, () => {
      const untranslated = paths(en as Node).filter((path) => {
        if (SHARED_BY_DESIGN.has(path)) return false;
        const source = at(en as Node, path);
        const translated = at(DICTIONARIES[locale] as Node, path);
        return typeof source === "string" && source === translated;
      });

      expect(untranslated).toEqual([]);
    });

    it(`${locale} renders every templated string without leaving a gap`, () => {
      for (const path of paths(en as Node)) {
        const translated = at(DICTIONARIES[locale] as Node, path);
        if (typeof translated !== "function") continue;

        // Called with stand-in values of each kind the dictionary uses.
        const args = Array.from({ length: translated.length }, (_, i) =>
          i === 0 && translated.length === 1 ? "SAMPLE" : 7,
        );
        const result = (translated as (...a: unknown[]) => unknown)(...args);

        expect(typeof result, path).toBe("string");
        expect(String(result).trim().length, path).toBeGreaterThan(0);
        expect(String(result), path).not.toContain("undefined");
      }
    });
  }
});

describe("negotiateLocale", () => {
  it("picks the highest-quality supported language", () => {
    expect(negotiateLocale("ko;q=0.9,en;q=0.8")).toBe("ko");
    expect(negotiateLocale("en;q=0.9,ko;q=0.8")).toBe("en");
  });

  it("matches a regional tag to its base language", () => {
    expect(negotiateLocale("ko-KR,ko;q=0.9")).toBe("ko");
    expect(negotiateLocale("en-US")).toBe("en");
  });

  it("skips languages the platform does not have", () => {
    // Tagalog first, but it is not translated yet, so Korean wins rather than
    // the request falling all the way back to English.
    expect(negotiateLocale("tl-PH,ko;q=0.7")).toBe("ko");
  });

  it("falls back to the default rather than guessing", () => {
    expect(negotiateLocale(null)).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale("")).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale("fr-FR,de;q=0.8")).toBe(DEFAULT_LOCALE);
  });

  it("survives a malformed header", () => {
    expect(negotiateLocale(",,;q=,")).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale("ko;q=notanumber")).toBe("ko");
  });
});

describe("isLocale", () => {
  it("accepts supported locales only", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ko")).toBe(true);
    expect(isLocale("ko-KR")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
