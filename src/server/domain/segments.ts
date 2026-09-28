/**
 * Message segmentation.
 *
 * These are the MOCK provider's rules. They are the ordinary GSM 03.38 / UCS-2
 * values and are good enough to build and test against, but the real partner's
 * encoding and charging rules override them once the contract exists — see
 * SmsProviderCapabilities.
 *
 * Counting is done in encoding units, not in `String.length` and not in visible
 * characters: an emoji is one visible character, two UTF-16 code units, and in
 * GSM-7 it does not exist at all.
 */

export type Encoding = "GSM7" | "UCS2";

/**
 * GSM 03.38 basic character set, in table order (each costs one septet).
 * 0x1B (ESC) is deliberately absent: it is the escape prefix for the extension
 * table, not a character a user can send.
 */
const GSM7_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅå" +
    "Δ_ΦΓΛΩΠΨΣΘΞ" +
    "ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
    "¿abcdefghijklmnopqrstuvwxyzäöñüà",
);

/** Extension table: encoded as ESC + char, so each costs two septets. */
const GSM7_EXTENSION = new Set([..."^{}\\[~]|€"]);

const LIMITS = {
  GSM7: { single: 160, concatenated: 153 },
  UCS2: { single: 70, concatenated: 67 },
} as const;

export type SegmentInfo = {
  encoding: Encoding;
  /** Encoding units: septets for GSM-7, UTF-16 code units for UCS-2. */
  units: number;
  segments: number;
  /** Units still available in the current segment plan. */
  remainingInLastSegment: number;
  /** Visible characters (code points), for the "x/160" style counter. */
  visibleCharacters: number;
  singleLimit: number;
  concatenatedLimit: number;
  hasNonBmp: boolean;
};

export function detectEncoding(body: string): Encoding {
  for (const ch of body) {
    if (!GSM7_BASIC.has(ch) && !GSM7_EXTENSION.has(ch)) return "UCS2";
  }
  return "GSM7";
}

/** Cost of each character in encoding units, in order. */
function unitCosts(body: string, encoding: Encoding): number[] {
  const costs: number[] = [];
  if (encoding === "GSM7") {
    for (const ch of body) costs.push(GSM7_EXTENSION.has(ch) ? 2 : 1);
  } else {
    // Iterating the string yields code points; non-BMP ones are surrogate
    // pairs worth two UTF-16 code units and must never be split.
    for (const ch of body) costs.push(ch.length);
  }
  return costs;
}

/**
 * Boundary-aware packing. A two-unit item (a GSM escape pair or a surrogate
 * pair) is moved whole to the next segment rather than straddling the boundary,
 * which is why the segment count is not simply ceil(units / limit).
 */
function packSegments(costs: number[], perSegment: number): number {
  let segments = 1;
  let used = 0;
  for (const cost of costs) {
    if (used + cost > perSegment) {
      segments += 1;
      used = cost;
    } else {
      used += cost;
    }
  }
  return segments;
}

function lastSegmentUsage(costs: number[], perSegment: number): number {
  let used = 0;
  for (const cost of costs) {
    if (used + cost > perSegment) used = cost;
    else used += cost;
  }
  return used;
}

export function analyzeMessage(body: string): SegmentInfo {
  const encoding = detectEncoding(body);
  const limits = LIMITS[encoding];
  const costs = unitCosts(body, encoding);
  const units = costs.reduce((a, b) => a + b, 0);
  const visibleCharacters = [...body].length;
  const hasNonBmp = [...body].some((ch) => ch.length > 1);

  if (units === 0) {
    return {
      encoding,
      units: 0,
      segments: 0,
      remainingInLastSegment: limits.single,
      visibleCharacters: 0,
      singleLimit: limits.single,
      concatenatedLimit: limits.concatenated,
      hasNonBmp: false,
    };
  }

  if (units <= limits.single) {
    return {
      encoding,
      units,
      segments: 1,
      remainingInLastSegment: limits.single - units,
      visibleCharacters,
      singleLimit: limits.single,
      concatenatedLimit: limits.concatenated,
      hasNonBmp,
    };
  }

  const segments = packSegments(costs, limits.concatenated);
  const used = lastSegmentUsage(costs, limits.concatenated);
  return {
    encoding,
    units,
    segments,
    remainingInLastSegment: limits.concatenated - used,
    visibleCharacters,
    singleLimit: limits.single,
    concatenatedLimit: limits.concatenated,
    hasNonBmp,
  };
}

export type MessageRejection =
  | { ok: true }
  | { ok: false; code: "EMPTY"; message: string }
  | { ok: false; code: "TEMPLATE_VARIABLES"; message: string }
  | { ok: false; code: "UNSUPPORTED_NON_BMP"; message: string }
  | { ok: false; code: "TOO_MANY_SEGMENTS"; message: string }
  | { ok: false; code: "UNSUPPORTED_CHARACTERS"; message: string };

/** Template variable syntax is rejected outright: MVP does not interpolate. */
const VARIABLE_SYNTAX = /\{\{\s*[\w.]+\s*\}\}|\$\{\s*[\w.]+\s*\}/;

export function validateMessageBody(
  body: string,
  opts: {
    maxSegments: number;
    supportsNonBmp: boolean;
    supportsUnicode: boolean;
  },
): MessageRejection {
  if (body.trim().length === 0) {
    return { ok: false, code: "EMPTY", message: "Enter a message." };
  }
  if (VARIABLE_SYNTAX.test(body)) {
    return {
      ok: false,
      code: "TEMPLATE_VARIABLES",
      message:
        "Personalization variables are not available yet, so {{name}} would be sent literally. Remove the variable and write the message out in full.",
    };
  }
  const info = analyzeMessage(body);
  if (info.encoding === "UCS2" && !opts.supportsUnicode) {
    return {
      ok: false,
      code: "UNSUPPORTED_CHARACTERS",
      message: "This sender only supports the basic GSM character set.",
    };
  }
  if (info.hasNonBmp && !opts.supportsNonBmp) {
    return {
      ok: false,
      code: "UNSUPPORTED_NON_BMP",
      message:
        "This provider supports strict UCS-2 only, which cannot carry emoji outside the basic multilingual plane. Remove them.",
    };
  }
  if (info.segments > opts.maxSegments) {
    return {
      ok: false,
      code: "TOO_MANY_SEGMENTS",
      message: `This message is ${info.segments} segments; the limit is ${opts.maxSegments}.`,
    };
  }
  return { ok: true };
}
