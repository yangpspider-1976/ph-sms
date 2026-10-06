import { describe, expect, it } from "vitest";
import { findInSource, scan } from "../../scripts/find-hardcoded-strings.mjs";

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

  it("sees copy in the shapes Prettier leaves it in", () => {
    // Every one of these reached a Korean reader in English: the scan only
    // looked for `>text<` on a single line, and Prettier wraps most copy.
    const source = [
      `const NAV = [{ href: "/features", label: "Features" }];`,
      `export const metadata = { title: "Pricing" };`,
      `<Link href="/login">`,
      `  Log in`,
      `</Link>`,
      `<p className="x">`,
      `  Send to Philippine mobile numbers. Enter recipients manually`,
      `  or upload a CSV.`,
      `</p>`,
      `<Button>{pending ? "Stopping…" : "Yes, stop"}</Button>`,
      `<span>Export report`,
      `{/* A comment that starts`,
      `   With a capital is not copy */}`,
      `const total: Record<string, number> = {};`,
    ].join("\n");

    expect(findInSource(source).map((f) => f.text)).toEqual([
      "Features",
      "Pricing",
      "Log in",
      "Send to Philippine mobile numbers. Enter recipients manually",
      "Stopping…",
      "Yes, stop",
      "Export report",
    ]);
  });

  it("sees copy that shares its line with a value", () => {
    // About fifty strings got past the shapes above, because the text sat next
    // to an icon or an expression, inside a template literal, or was a stored
    // value printed as it is. The lines after the gap are the same shapes in
    // code that is not copy, and must stay quiet.
    const source = [
      "<IconDownload size={15} /> Export report",
      "{campaign.includedCount} recipients · {campaign.purpose.toLowerCase()}",
      "Version {template.version} · saved {when}",
      "<CardHeader title={`${rows.length} opted out`} />",
      'subtitle={count > 0 ? `${count} in review queue` : "Review queue"}',
      '  ? "There is one owner. The last owner cannot be removed or demoted."',
      "  : `${owners} owners.`",
      'setFileError("That file is empty.");',
      '"Partner request, response and error schemas, with sample payloads",',
      "<td>{entry.type.toLowerCase()}</td>",
      "",
      "const key = `test-${id}-${to}`;",
      "transform: `rotate(${rotate}deg)`,",
      "filled: sql<number>`count(*) filter (where ${x} = 'ACCEPTED')::int`,",
      "const describedBy = chosen ? `${id}-detail` : undefined;",
      "href={archived ? `/app/campaigns/${id}/archive` : `/app/campaigns/${id}`}",
      "{open ? <IconX size={18} /> : <IconMenu size={18} />}",
      "} satisfies Config;",
    ].join("\n");

    expect(findInSource(source).map((f) => `${f.line} ${f.text}`)).toEqual([
      "1 Export report",
      "2 recipients ·",
      "2 campaign.purpose.toLowerCase()",
      "3 · saved",
      "3 Version",
      "4 ${rows.length} opted out",
      "5 ${count} in review queue",
      "6 There is one owner. The last owner cannot be removed or demoted.",
      "7 ${owners} owners.",
      "8 That file is empty.",
      "9 Partner request, response and error schemas, with sample payloads",
      "10 entry.type.toLowerCase()",
    ]);
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
