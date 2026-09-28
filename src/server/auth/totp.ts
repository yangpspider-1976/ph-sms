import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) for platform-admin second factor.
 *
 * Implemented directly on node:crypto's HMAC rather than pulled from a package:
 * TOTP is a documented standard whose whole body is an HMAC, a counter and a
 * truncation, and the primitive doing the actual cryptography is the platform's.
 * This is not a home-made scheme — it is RFC 6238 with no variations.
 */

const PERIOD_SECONDS = 30;
const DIGITS = 6;
/** Accept the adjacent steps so a slightly wrong device clock still works. */
const DRIFT_STEPS = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, no padding — the encoding authenticator apps expect. */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 160-bit secret, the RFC's recommendation. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function codeForStep(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", secret).update(counter).digest();

  // Dynamic truncation, RFC 4226 section 5.3.
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function currentTotp(secretBase32: string, at: Date = new Date()): string {
  const step = Math.floor(at.getTime() / 1000 / PERIOD_SECONDS);
  return codeForStep(base32Decode(secretBase32), step);
}

/**
 * Verifies a submitted code, allowing one step either side for clock drift.
 * Comparison is constant-time so a timing signal cannot narrow the code.
 */
export function verifyTotp(
  secretBase32: string,
  submitted: string,
  at: Date = new Date(),
): boolean {
  const cleaned = submitted.replace(/\D/g, "");
  if (cleaned.length !== DIGITS) return false;

  const secret = base32Decode(secretBase32);
  const step = Math.floor(at.getTime() / 1000 / PERIOD_SECONDS);

  for (let drift = -DRIFT_STEPS; drift <= DRIFT_STEPS; drift += 1) {
    const expected = codeForStep(secret, step + drift);
    const a = Buffer.from(expected);
    const b = Buffer.from(cleaned);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** otpauth:// URI for an authenticator app. */
export function totpUri(secretBase32: string, account: string, issuer = "PH SMS"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Single-use recovery codes, for a lost device. */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  });
}
