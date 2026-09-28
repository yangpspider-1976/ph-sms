import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  currentTotp,
  generateRecoveryCodes,
  generateTotpSecret,
  totpUri,
  verifyTotp,
} from "./totp";

/**
 * Checked against the published RFC 6238 test vectors rather than against
 * itself. A TOTP implementation that only agrees with its own output is
 * worthless — the point is that a third-party authenticator app produces the
 * same codes.
 */

/** RFC 6238 appendix B uses the ASCII seed "12345678901234567890". */
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

describe("base32", () => {
  it("round-trips", () => {
    const original = Buffer.from("12345678901234567890", "ascii");
    expect(base32Decode(base32Encode(original)).equals(original)).toBe(true);
  });

  it("encodes the RFC seed to the expected string", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("ignores spaces and casing, as authenticator apps do", () => {
    const spaced = "gezd gnbv gy3t qojq gezd gnbv gy3t qojq";
    expect(base32Decode(spaced).equals(base32Decode(RFC_SECRET))).toBe(true);
  });
});

describe("RFC 6238 test vectors (SHA-1, 30s period)", () => {
  // The RFC publishes 8-digit values; ours are the low 6 digits of each.
  const vectors: Array<{ epochSeconds: number; eightDigit: string }> = [
    { epochSeconds: 59, eightDigit: "94287082" },
    { epochSeconds: 1111111109, eightDigit: "07081804" },
    { epochSeconds: 1111111111, eightDigit: "14050471" },
    { epochSeconds: 1234567890, eightDigit: "89005924" },
    { epochSeconds: 2000000000, eightDigit: "69279037" },
    { epochSeconds: 20000000000, eightDigit: "65353130" },
  ];

  for (const { epochSeconds, eightDigit } of vectors) {
    it(`matches at t=${epochSeconds}`, () => {
      const at = new Date(epochSeconds * 1000);
      expect(currentTotp(RFC_SECRET, at)).toBe(eightDigit.slice(-6));
    });
  }
});

describe("verification", () => {
  const at = new Date(1111111109 * 1000);

  it("accepts the current code", () => {
    expect(verifyTotp(RFC_SECRET, currentTotp(RFC_SECRET, at), at)).toBe(true);
  });

  it("accepts one step of clock drift either way", () => {
    const before = new Date(at.getTime() - 30_000);
    const after = new Date(at.getTime() + 30_000);
    expect(verifyTotp(RFC_SECRET, currentTotp(RFC_SECRET, before), at)).toBe(true);
    expect(verifyTotp(RFC_SECRET, currentTotp(RFC_SECRET, after), at)).toBe(true);
  });

  it("rejects a code two steps away", () => {
    const stale = new Date(at.getTime() - 90_000);
    expect(verifyTotp(RFC_SECRET, currentTotp(RFC_SECRET, stale), at)).toBe(false);
  });

  it("rejects wrong, short and empty codes", () => {
    expect(verifyTotp(RFC_SECRET, "000000", at)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "1234", at)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "", at)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "abcdef", at)).toBe(false);
  });

  it("tolerates a code typed with a space", () => {
    const code = currentTotp(RFC_SECRET, at);
    expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, at)).toBe(true);
  });

  it("rejects a code generated from a different secret", () => {
    const other = generateTotpSecret();
    expect(verifyTotp(RFC_SECRET, currentTotp(other, at), at)).toBe(false);
  });
});

describe("secrets and recovery codes", () => {
  it("generates a 160-bit secret", () => {
    expect(base32Decode(generateTotpSecret())).toHaveLength(20);
  });

  it("generates distinct secrets", () => {
    const secrets = new Set(Array.from({ length: 20 }, () => generateTotpSecret()));
    expect(secrets.size).toBe(20);
  });

  it("builds an otpauth URI an authenticator app can read", () => {
    const uri = totpUri(RFC_SECRET, "admin@example.test");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain(`secret=${RFC_SECRET}`);
    expect(uri).toContain("issuer=PH+SMS");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });

  it("generates distinct recovery codes", () => {
    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) expect(code).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}$/);
  });
});
