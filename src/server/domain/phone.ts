/**
 * Philippine mobile number handling.
 *
 * This validates FORMAT ONLY. It does not and cannot tell you whether a number
 * is active, who owns it, which carrier holds it today (numbers are portable,
 * so a prefix proves nothing), or whether a message can reach it.
 */

/** The only accepted normalized shape. */
export const NORMALIZED_PATTERN = /^\+639\d{9}$/;

/** Separators that are stripped before validation. Nothing else is removed. */
const ALLOWED_SEPARATORS = /[ \t()\- ‐‑‒–—]/g;

export type PhoneRejection =
  | "EMPTY"
  | "CONTAINS_LETTERS"
  | "INVALID_CHARACTERS"
  | "MULTIPLE_PLUS"
  | "FOREIGN_NUMBER"
  | "LANDLINE_OR_NON_MOBILE"
  | "TOO_SHORT"
  | "TOO_LONG"
  | "MALFORMED";

export type PhoneResult =
  | { ok: true; normalized: string; masked: string }
  | { ok: false; reason: PhoneRejection };

/** +63 917 *** 4567 */
export function maskNormalized(normalized: string): string {
  const d = normalized.slice(3); // 9171234567
  return `+63 ${d.slice(0, 3)} *** ${d.slice(6)}`;
}

export function normalizePhone(input: string): PhoneResult {
  if (input == null) return { ok: false, reason: "EMPTY" };

  const stripped = input.replace(ALLOWED_SEPARATORS, "").trim();
  if (stripped === "") return { ok: false, reason: "EMPTY" };

  if (/[A-Za-z]/.test(stripped)) return { ok: false, reason: "CONTAINS_LETTERS" };

  const plusCount = (stripped.match(/\+/g) ?? []).length;
  if (plusCount > 1) return { ok: false, reason: "MULTIPLE_PLUS" };
  if (plusCount === 1 && !stripped.startsWith("+")) return { ok: false, reason: "MALFORMED" };

  // After separators are gone only an optional leading + and digits may remain.
  // Extensions ("x12", "#12"), decimals and any other punctuation land here.
  if (!/^\+?\d+$/.test(stripped)) return { ok: false, reason: "INVALID_CHARACTERS" };

  const hasPlus = stripped.startsWith("+");
  const digits = hasPlus ? stripped.slice(1) : stripped;

  // An explicit country code that is not +63 is a foreign destination.
  if (hasPlus && !digits.startsWith("63")) return { ok: false, reason: "FOREIGN_NUMBER" };

  let national: string; // expected to be 10 digits beginning with 9
  if (digits.startsWith("63")) {
    national = digits.slice(2);
  } else if (digits.startsWith("0")) {
    national = digits.slice(1);
  } else {
    national = digits;
  }

  if (!/^\d+$/.test(national) || national.length === 0) {
    return { ok: false, reason: "MALFORMED" };
  }

  // Philippine mobile service numbers are 9XX; anything else (landline area
  // codes such as 2, 32, 82, service numbers) is out of scope for this product.
  // Checked before length: a Manila landline is nine digits, and telling the
  // user "not a mobile number" is more use than "too few digits".
  if (!national.startsWith("9")) return { ok: false, reason: "LANDLINE_OR_NON_MOBILE" };

  if (national.length < 10) return { ok: false, reason: "TOO_SHORT" };
  if (national.length > 10) return { ok: false, reason: "TOO_LONG" };

  const normalized = `+63${national}`;
  if (!NORMALIZED_PATTERN.test(normalized)) return { ok: false, reason: "MALFORMED" };

  return { ok: true, normalized, masked: maskNormalized(normalized) };
}

export const REJECTION_TEXT: Record<PhoneRejection, string> = {
  EMPTY: "Blank value",
  CONTAINS_LETTERS: "Contains letters",
  INVALID_CHARACTERS: "Contains characters that are not digits",
  MULTIPLE_PLUS: "More than one + sign",
  FOREIGN_NUMBER: "Not a Philippine number",
  LANDLINE_OR_NON_MOBILE: "Not a Philippine mobile number",
  TOO_SHORT: "Too few digits",
  TOO_LONG: "Too many digits",
  MALFORMED: "Not a valid number format",
};

/** Manual paste: comma, semicolon, newline (and tabs) separate entries. */
export function splitPastedNumbers(raw: string): string[] {
  return raw
    .split(/[\n\r,;\t]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
