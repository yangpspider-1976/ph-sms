import { describe, expect, it } from "vitest";
import { analyzeMessage, detectEncoding, validateMessageBody } from "./segments";

const repeat = (ch: string, n: number) => ch.repeat(n);

describe("encoding detection", () => {
  it("treats the basic GSM alphabet as GSM-7", () => {
    expect(detectEncoding("Your reservation is confirmed.")).toBe("GSM7");
    expect(detectEncoding("Total: 1,250.00 PHP @ 10% off")).toBe("GSM7");
    // Greek capitals and accented Latin are in the basic table.
    expect(detectEncoding("ΔΦΓΛΩΠΨΣΘΞ èéùìòÇØøÅåÆæßÉ")).toBe("GSM7");
  });

  it("treats extension-table characters as GSM-7, not Unicode", () => {
    expect(detectEncoding("Email us at a^b {c} [d] ~e~ |f| €10")).toBe("GSM7");
  });

  it("falls back to UCS-2 for anything outside both tables", () => {
    expect(detectEncoding("Smart quotes “hello”")).toBe("UCS2");
    expect(detectEncoding("Salamat po — maraming salamat")).toBe("UCS2");
    expect(detectEncoding("Thanks 😊")).toBe("UCS2");
  });
});

describe("GSM-7 boundaries", () => {
  // Requirement 3: 160/161 boundary.
  it("fits 160 septets in one segment and splits at 161", () => {
    expect(analyzeMessage(repeat("a", 160)).segments).toBe(1);
    expect(analyzeMessage(repeat("a", 160)).units).toBe(160);
    expect(analyzeMessage(repeat("a", 161)).segments).toBe(2);
  });

  it("uses 153 septets per concatenated segment", () => {
    expect(analyzeMessage(repeat("a", 306)).segments).toBe(2);
    expect(analyzeMessage(repeat("a", 307)).segments).toBe(3);
    expect(analyzeMessage(repeat("a", 459)).segments).toBe(3);
  });

  it("charges extension-table characters two septets", () => {
    expect(analyzeMessage("€").units).toBe(2);
    expect(analyzeMessage(repeat("€", 80)).units).toBe(160);
    expect(analyzeMessage(repeat("€", 80)).segments).toBe(1);
    expect(analyzeMessage(repeat("€", 81)).segments).toBe(2);
    for (const ch of ["^", "{", "}", "\\", "[", "~", "]", "|", "€"]) {
      expect(analyzeMessage(ch).units).toBe(2);
    }
  });
});

describe("boundary-aware packing", () => {
  // An escape pair may not straddle a segment boundary, so the segment count
  // is not simply ceil(units / 153).
  it("moves a whole escape pair to the next segment", () => {
    const body = repeat("a", 152) + "€" + repeat("a", 152);
    const info = analyzeMessage(body);
    expect(info.units).toBe(306); // would be exactly 2 segments if split were allowed
    expect(Math.ceil(info.units / 153)).toBe(2);
    expect(info.segments).toBe(3);
  });

  it("never splits a surrogate pair", () => {
    const emoji = "😊"; // 2 UTF-16 code units
    const info = analyzeMessage(repeat(emoji, 100));
    expect(info.units).toBe(200);
    // 67 is odd, so only 33 pairs (66 units) fit per concatenated segment.
    expect(Math.ceil(info.units / 67)).toBe(3);
    expect(info.segments).toBe(4);
  });
});

describe("Unicode boundaries", () => {
  // Requirement 3: BMP 70/71 boundary.
  it("fits 70 code units in one segment and splits at 71", () => {
    const u = "“"; // smart quote, forces UCS-2, 1 code unit
    expect(analyzeMessage(repeat(u, 70)).segments).toBe(1);
    expect(analyzeMessage(repeat(u, 70)).units).toBe(70);
    expect(analyzeMessage(repeat(u, 71)).segments).toBe(2);
  });

  it("uses 67 code units per concatenated segment", () => {
    const u = "“";
    expect(analyzeMessage(repeat(u, 134)).segments).toBe(2);
    expect(analyzeMessage(repeat(u, 135)).segments).toBe(3);
  });
});

describe("counting is not string length", () => {
  it("separates visible characters from encoding units", () => {
    const emoji = "😊";
    const info = analyzeMessage(emoji);
    expect(info.visibleCharacters).toBe(1);
    expect(info.units).toBe(2);
    expect(emoji.length).toBe(2);
    expect(info.hasNonBmp).toBe(true);
  });

  it("counts a GSM extension character as one visible character, two septets", () => {
    const info = analyzeMessage("€");
    expect(info.visibleCharacters).toBe(1);
    expect(info.units).toBe(2);
  });

  it("reports an empty body as zero segments", () => {
    expect(analyzeMessage("").segments).toBe(0);
  });
});

describe("body validation", () => {
  const opts = { maxSegments: 6, supportsNonBmp: true, supportsUnicode: true };

  it("rejects an empty message", () => {
    expect(validateMessageBody("   ", opts)).toMatchObject({ ok: false, code: "EMPTY" });
  });

  it("rejects template variable syntax with an explanation", () => {
    const r = validateMessageBody("Hi {{first_name}}, welcome", opts);
    expect(r).toMatchObject({ ok: false, code: "TEMPLATE_VARIABLES" });
    if (!r.ok) expect(r.message).toMatch(/sent literally/i);
  });

  it("rejects more than the configured maximum segments", () => {
    const r = validateMessageBody(repeat("a", 153 * 7), opts);
    expect(r).toMatchObject({ ok: false, code: "TOO_MANY_SEGMENTS" });
  });

  it("rejects non-BMP content when the provider is strict UCS-2", () => {
    const r = validateMessageBody("Thanks 😊", { ...opts, supportsNonBmp: false });
    expect(r).toMatchObject({ ok: false, code: "UNSUPPORTED_NON_BMP" });
  });

  it("rejects Unicode when the sender is GSM-only", () => {
    const r = validateMessageBody("Smart “quotes”", {
      ...opts,
      supportsUnicode: false,
    });
    expect(r).toMatchObject({ ok: false, code: "UNSUPPORTED_CHARACTERS" });
  });

  it("accepts an ordinary transactional message", () => {
    expect(
      validateMessageBody(
        "Your reservation is confirmed. We look forward to seeing you tomorrow.",
        opts,
      ),
    ).toEqual({ ok: true });
  });
});
