import { describe, expect, it } from "vitest";
import { scan } from "../../scripts/find-hardcoded-strings.mjs";

/**
 * Guard against untranslatable text creeping back in.
 *
 * The spec asks for an architecture that takes a new locale file "without
 * hard-coded UI text". A dictionary satisfies that only for as long as people
 * keep using it, so this fails the build the moment a component starts
 * rendering a literal again.
 *
 * It is a heuristic, deliberately. The alternative — a linter rule that
 * understands JSX properly — would be more precise and much slower to run,
 * and this catches the mistake that actually happens: someone types a label
 * straight into a component.
 */

/**
 * Text that is legitimately a literal.
 *
 * Each entry is a value, not copy: it reads the same in every language, so
 * routing it through a dictionary would add a translation nobody can change.
 */
const ALLOWED: Array<{ file: string; text: string; why: string }> = [
  {
    file: "src/app/(auth)/login/demo-logins.tsx",
    text: "DemoPass123!",
    why: "A password for the seeded demo accounts, not a label.",
  },
  {
    file: "src/app/(auth)/signup/signup-form.tsx",
    text: "https://",
    why: "A URL scheme shown as an input prefix.",
  },
];

function isAllowed(file: string, text: string): boolean {
  return ALLOWED.some((entry) => entry.file === file && entry.text === text);
}

describe("no hard-coded UI text", () => {
  it("every user-visible string comes from a dictionary", () => {
    const offenders = scan()
      .flatMap(({ file, findings }) =>
        findings
          .filter((finding) => !isAllowed(file, finding.text))
          .map((finding) => `${file}:${finding.line}  ${finding.kind}: ${finding.text}`),
      )
      .sort();

    expect(offenders).toEqual([]);
  });

  it("the allowlist has no stale entries", () => {
    // An allowlist that outlives the line it excused quietly widens over time.
    const present = new Set(
      scan().flatMap(({ file, findings }) => findings.map((f) => `${file}\u0000${f.text}`)),
    );

    const stale = ALLOWED.filter(
      (entry) => !present.has(`${entry.file}\u0000${entry.text}`),
    ).map((entry) => `${entry.file}: ${entry.text}`);

    expect(stale).toEqual([]);
  });
});
