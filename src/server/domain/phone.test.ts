import { describe, expect, it } from "vitest";
import {
  maskNormalized,
  normalizePhone,
  splitPastedNumbers,
  NORMALIZED_PATTERN,
} from "./phone";

const ok = (input: string) => {
  const r = normalizePhone(input);
  if (!r.ok) throw new Error(`expected ${input} to be accepted, got ${r.reason}`);
  return r;
};

const rejected = (input: string) => {
  const r = normalizePhone(input);
  if (r.ok) throw new Error(`expected ${input} to be rejected, got ${r.normalized}`);
  return r;
};

describe("accepted formats", () => {
  // Requirement 1: the four documented formats normalize identically.
  it("normalizes all four accepted formats to the same value", () => {
    const forms = ["09171234567", "9171234567", "639171234567", "+639171234567"];
    const results = forms.map((f) => ok(f).normalized);
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("+639171234567");
  });

  it("strips only the allowed separators", () => {
    for (const input of [
      "+63 917 123 4567",
      "0917-123-4567",
      "(0917) 123 4567",
      " 0917 123 4567 ",
      "+63 (917) 123-4567",
    ]) {
      expect(ok(input).normalized).toBe("+639171234567");
    }
  });

  it("matches the documented normalized pattern", () => {
    expect(NORMALIZED_PATTERN.test(ok("09171234567").normalized)).toBe(true);
  });

  it("masks for display without revealing the middle digits", () => {
    expect(maskNormalized("+639171234567")).toBe("+63 917 *** 4567");
    expect(ok("09171234567").masked).toBe("+63 917 *** 4567");
  });
});

describe("rejected input", () => {
  it("rejects foreign numbers", () => {
    expect(rejected("+12125551234").reason).toBe("FOREIGN_NUMBER");
    expect(rejected("+442071234567").reason).toBe("FOREIGN_NUMBER");
    expect(rejected("+6591234567").reason).toBe("FOREIGN_NUMBER");
  });

  it("rejects landlines and other non-mobile numbers", () => {
    expect(rejected("0281234567").reason).toBe("LANDLINE_OR_NON_MOBILE");
    expect(rejected("+63281234567").reason).toBe("LANDLINE_OR_NON_MOBILE");
    expect(rejected("0321234567").reason).toBe("LANDLINE_OR_NON_MOBILE");
  });

  it("rejects malformed lengths", () => {
    expect(rejected("091712345").reason).toBe("TOO_SHORT");
    expect(rejected("0917123456").reason).toBe("TOO_SHORT");
    expect(rejected("091712345678").reason).toBe("TOO_LONG");
    expect(rejected("+6391712345678").reason).toBe("TOO_LONG");
  });

  it("rejects letters, extensions and stray punctuation", () => {
    expect(rejected("0917ABC4567").reason).toBe("CONTAINS_LETTERS");
    expect(rejected("09171234567 ext 12").reason).toBe("CONTAINS_LETTERS");
    expect(rejected("09171234567#12").reason).toBe("INVALID_CHARACTERS");
    expect(rejected("0917.123.4567").reason).toBe("INVALID_CHARACTERS");
    expect(rejected("0917/1234567").reason).toBe("INVALID_CHARACTERS");
  });

  it("rejects extra plus signs and a misplaced plus", () => {
    expect(rejected("++639171234567").reason).toBe("MULTIPLE_PLUS");
    expect(rejected("63+9171234567").reason).toBe("MALFORMED");
  });

  it("rejects blank values", () => {
    expect(rejected("").reason).toBe("EMPTY");
    expect(rejected("   ").reason).toBe("EMPTY");
    expect(rejected("- - -").reason).toBe("EMPTY");
  });
});

describe("format validity is not ownership", () => {
  // Requirement 1: a well-formed number must never be labelled "verified".
  it("returns only format fields, never a verification claim", () => {
    const result = ok("09171234567");
    expect(Object.keys(result).sort()).toEqual(["masked", "normalized", "ok"]);
    expect(result).not.toHaveProperty("verified");
    expect(result).not.toHaveProperty("carrier");
    expect(result).not.toHaveProperty("active");
  });

  it("accepts a well-formed but unassigned-looking number just the same", () => {
    // Format validation cannot distinguish this from a live subscriber.
    expect(ok("+639999999999").normalized).toBe("+639999999999");
  });
});

describe("pasted input", () => {
  it("splits on commas, semicolons, newlines and tabs", () => {
    const raw = "09171234567, 09181234567\n09191234567;09201234567\t09211234567";
    expect(splitPastedNumbers(raw)).toHaveLength(5);
  });

  it("ignores empty entries produced by trailing separators", () => {
    expect(splitPastedNumbers("09171234567,,\n\n ; ")).toEqual(["09171234567"]);
  });
});
