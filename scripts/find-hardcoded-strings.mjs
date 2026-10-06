#!/usr/bin/env node
/**
 * Finds user-visible text that is still written into a component instead of
 * coming from a dictionary.
 *
 * Deliberately a heuristic. It looks for the two shapes that actually reach a
 * customer's screen — text between JSX tags, and the string props that render
 * as text — and it is tuned to be quiet about the things that are not copy:
 * class names, hrefs, ids, and single words that are values rather than labels.
 *
 * Used both as a migration worklist and as the basis for the guard test, so it
 * prints machine-readable output when asked.
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { relative } from "node:path";

/** Props whose value is rendered to the user. */
const TEXT_PROPS = [
  "title",
  "description",
  "label",
  "hint",
  "placeholder",
  "subtitle",
  "aria-label",
  "error",
  "emptyTitle",
];

/** Attributes that carry machinery, never copy. */
const IGNORED_PROPS = new Set([
  "className",
  "href",
  "id",
  "htmlFor",
  "name",
  "type",
  "value",
  "key",
  "role",
  "src",
  "alt",
  "rel",
  "target",
  "method",
  "action",
  "autoComplete",
  "inputMode",
  "pattern",
  "accept",
  "tone",
  "variant",
  "size",
  "tint",
  "scope",
  "spellCheck",
  "data-testid",
]);

/** Values that are design tokens rather than words a reader sees. */
const DESIGN_TOKENS = new Set([
  "neutral",
  "info",
  "success",
  "warning",
  "danger",
  "brand",
  "violet",
  "teal",
  "navy",
  "primary",
  "secondary",
  "ghost",
]);

/** Object keys whose string value is rendered, e.g. `{ label: "Features" }`. */
const TEXT_KEYS = ["label", "title", "description", "hint", "placeholder", "subtitle", "body"];

/** Words on a line of their own between JSX tags, as Prettier wraps them. */
const TEXT_LINE = /^[A-Z][^<>{}=;"`[\]|&]*$/;

/** Prose: lowercase letters, and not a SCREAMING value. */
function isProse(text) {
  return /[a-z]/.test(text) && !/^[A-Z0-9_ ]+$/.test(text);
}

/**
 * Blanks out comments, keeping line numbers. A JSX comment can run over several
 * lines whose prose starts with a capital, and it is not copy.
 *
 * String literals are matched first and kept, so `accept="image/*"` or a URL
 * in a string is not mistaken for the start of a comment.
 */
function stripComments(source) {
  return source.replace(
    /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (match) => (match.startsWith("/") ? match.replace(/[^\n]/g, " ") : match),
  );
}

export function findInSource(source) {
  const findings = [];
  const lines = stripComments(source).split("\n");

  // Import and type lines carry no copy.
  const isCode = lines.map((line) => {
    const trimmed = line.trim();
    return !(trimmed.startsWith("import ") || trimmed.startsWith("export type"));
  });

  lines.forEach((line, index) => {
    if (!isCode[index]) return;
    const trimmed = line.trim();

    // Text between JSX tags: >Some words<
    for (const match of line.matchAll(/>\s*([A-Z][^<>{}\n]{3,})\s*</g)) {
      const text = match[1].trim();
      if (/^[A-Z0-9_ ]+$/.test(text)) continue; // SCREAMING values, not copy
      findings.push({ line: index + 1, kind: "text", text });
    }

    // Text on a line of its own. Prettier moves JSX text onto its own line as
    // soon as the element is too long for one, so this is where most copy
    // lives — and the one-line pattern above never sees it. A bare identifier
    // is code, not copy, unless it closes an element on the next line.
    if (TEXT_LINE.test(trimmed) && isProse(trimmed) && !/^[A-Z_][A-Z0-9_]*\s*:/.test(trimmed)) {
      const identifier = /^[A-Za-z_$][\w$.]*,?$/.test(trimmed);
      const next = (lines[index + 1] ?? "").trim();
      if (!identifier || next.startsWith("</")) {
        findings.push({ line: index + 1, kind: "text", text: trimmed });
      }
    }

    // Text after an opening tag that runs to the end of the line: <p>Some words
    // An arrow (`=>`) or a comparison is not a tag.
    for (const match of line.matchAll(/(?<![=\s-])>([A-Z][^<>{}\n]{2,})$/g)) {
      const text = match[1].trim();
      if (isProse(text)) findings.push({ line: index + 1, kind: "text", text });
    }

    // Text that starts a line and runs into a tag or an expression:
    // Some words</p>   Some words <strong>   Some words {value}
    // One word into `<` is a generic type (`Record<…`), not copy, unless it is
    // a closing tag.
    const head = trimmed.match(/^([A-Z][^<>{}=;"`[\]()|&]*?)\s*(<\/|<|\{)/);
    if (head && isProse(head[1]) && (head[2] === "</" || /\s/.test(head[1]))) {
      findings.push({ line: index + 1, kind: "text", text: head[1].trim() });
    }

    // A string literal rendered as an expression, {"Some words"}, or either
    // branch of a ternary, {pending ? "Saving…" : "Save"}.
    const literals = [
      ...[...line.matchAll(/\{\s*"([A-Z][^"\n]{2,})"\s*\}/g)].map((m) => m[1]),
      ...[...line.matchAll(/\?\s*"([A-Z][^"\n]{2,})"\s*:\s*"([A-Z][^"\n]{2,})"/g)].flatMap((m) => [
        m[1],
        m[2],
      ]),
    ];
    for (const text of literals) {
      if (isProse(text)) findings.push({ line: index + 1, kind: "expression", text });
    }

    // Rendered object properties: { label: "Features" }, and page metadata.
    for (const match of line.matchAll(
      new RegExp(`\\b(${TEXT_KEYS.join("|")})\\s*:\\s*["'\`]([^"'\`\\n]{3,})["'\`]`, "g"),
    )) {
      const [, key, text] = match;
      if (!isProse(text) || DESIGN_TOKENS.has(text)) continue;
      findings.push({ line: index + 1, kind: key, text });
    }

    // Label maps: ENUM_VALUE: "Some words" inside a const object. These render
    // to the screen just like JSX text, and they hid from the first version of
    // this scan because they are object properties rather than markup.
    for (const match of line.matchAll(/^\s*([A-Z][A-Z0-9_]{2,})\s*:\s*["']([^"'\n]{4,})["']/g)) {
      const [, key, text] = match;
      if (!/[a-z]/.test(text)) continue;
      // Tone and variant maps look identical to label maps on one line, but a
      // design token is not copy and must not be translated.
      if (DESIGN_TOKENS.has(text)) continue;
      findings.push({ line: index + 1, kind: `label:${key}`, text });
    }

    // Rendered string props: title="Some words"
    for (const match of line.matchAll(/(\b[\w-]+)=["']([^"'\n]{4,})["']/g)) {
      const [, prop, text] = match;
      if (IGNORED_PROPS.has(prop)) continue;
      if (!TEXT_PROPS.includes(prop)) continue;
      if (!/[a-z]/.test(text)) continue;
      findings.push({ line: index + 1, kind: prop, text });
    }

    // Everything below is copy that shares its line with a value. The patterns
    // above want the text to stand alone, so some fifty strings got past them
    // and reached a Korean reader in English — "Export report" after an icon,
    // "{n} recipients · {purpose}", a heading built in a template literal.

    // Words after a self-closing tag or an expression: <Icon /> Export report,
    // {count} recipients · {purpose}. Only on a line that is plainly markup,
    // because `} else {` and `} from "x"` have the same shape in code.
    if (/^[<{]/.test(trimmed) || /^[A-Z·(]/.test(trimmed)) {
      for (const match of trimmed.matchAll(
        /(?:\/>|\})\s*([^<>{}=;"`[\]|&]*[A-Za-z]{3,}[^<>{}=;"`[\]|&]*?)\s*(?=$|<|\{)/g,
      )) {
        const text = match[1].trim();
        if (/^(as|satisfies|else|catch|finally|from|of|in)\b/.test(text)) continue;
        if (/^[,.)\]:?]/.test(text)) continue;
        findings.push({ line: index + 1, kind: "text", text });
      }
    }

    // One capitalised word, then a value: Version {x}. A lone word before `<`
    // is skipped above as a generic type; before `{` on a line with no code in
    // front of it, it is copy.
    const lead = trimmed.match(/^([A-Z][a-z]+)\s+\{[A-Za-z(]/);
    if (lead && !/[=;(]/.test(trimmed.slice(0, trimmed.indexOf("{")))) {
      findings.push({ line: index + 1, kind: "text", text: lead[1] });
    }

    // A template literal that is rendered: the value of a text prop, or a
    // branch of a ternary. SQL fragments, keys, paths and CSS values are
    // template literals as well, so the context decides, not the backticks.
    for (const match of line.matchAll(/`([^`\n]*)`/g)) {
      const words = match[1].replace(/\$\{[^}]*\}/g, " ").trim();
      // A word standing free, not part of an id such as `${id}-error`.
      if (!/(?<![-_\w])[A-Za-z]{3,}(?![-_\w])/.test(words)) continue;
      if (/^[/#.]|^https?:/.test(words)) continue;
      const before = line.slice(0, match.index);
      if (/\b(className|href|key|id|htmlFor|src|style)=\{[^}]*$/.test(before)) continue;
      const inTextProp = new RegExp(`\\b(${TEXT_PROPS.join("|")})=\\{[^}]*$`).test(before);
      const isBranch = /[?:]\s*$/.test(before) && (before.includes("?") || /^[?:]/.test(trimmed));
      if (inTextProp || isBranch) {
        findings.push({ line: index + 1, kind: "template", text: match[1] });
      }
    }

    // Either branch of a ternary, on a line of its own.
    const branch = trimmed.match(/^[?:]\s*"([A-Z][^"\n]{3,})"/);
    if (branch && isProse(branch[1])) {
      findings.push({ line: index + 1, kind: "expression", text: branch[1] });
    }

    // A message handed to a state setter is on screen a moment later.
    const setter = trimmed.match(/\bset[A-Z]\w*\(\s*"([A-Z][^"\n]{3,})"/);
    if (setter && isProse(setter[1])) {
      findings.push({ line: index + 1, kind: "expression", text: setter[1] });
    }

    // A sentence on a line of its own: an item in a list that is mapped to markup.
    const item = trimmed.match(/^"([A-Z][^"\n]{11,})",?$/);
    if (item && /\s/.test(item[1]) && isProse(item[1])) {
      findings.push({ line: index + 1, kind: "expression", text: item[1] });
    }

    // A stored value printed as it is: {row.status.toLowerCase()} shows
    // "pending_review" in every language. A label map in the dictionary does not.
    for (const match of line.matchAll(/\{\s*([\w.?]+\.toLowerCase\(\))\s*\}/g)) {
      findings.push({ line: index + 1, kind: "raw-value", text: match[1] });
    }
  });

  return findings;
}

export function scan(patterns = ["src/app/**/*.tsx", "src/components/**/*.tsx"]) {
  const files = patterns.flatMap((pattern) => globSync(pattern));
  const results = [];

  for (const file of files.sort()) {
    const findings = findInSource(readFileSync(file, "utf8"));
    if (findings.length > 0) {
      results.push({ file: relative(process.cwd(), file).replace(/\\/g, "/"), findings });
    }
  }

  return results;
}

if (process.argv[1]?.includes("find-hardcoded-strings")) {
  const results = scan();
  const total = results.reduce((sum, r) => sum + r.findings.length, 0);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const { file, findings } of results) {
      console.log(`\n${file}  (${findings.length})`);
      for (const finding of findings.slice(0, 40)) {
        console.log(`  ${String(finding.line).padStart(4)}  ${finding.kind}: ${finding.text}`);
      }
    }
    console.log(`\n${total} strings in ${results.length} files`);
  }
}
