import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { env } from "@/server/env";

/**
 * Standard primitives from node:crypto only — no home-made constructions.
 *
 * Numbers are kept three ways:
 *   - numberEncrypted: AES-256-GCM, reversible, needed to actually send;
 *   - numberHash:      keyed HMAC-SHA-256, used for dedupe and suppression
 *                      matching so a retained opt-out does not have to keep the
 *                      plain number. A keyed MAC, not a bare hash: a phone
 *                      number has far too little entropy for a plain digest to
 *                      be anonymisation;
 *   - numberMasked:    display only.
 */

const KEY_LEN = 32;

function keyFrom(material: string, label: string): Buffer {
  if (!material) {
    // Dev/test fallback so the app runs before secrets are provisioned.
    // liveReadinessGaps() reports this and LIVE refuses to start without it.
    if (env.NODE_ENV === "production" && env.APP_MODE === "LIVE") {
      throw new Error(`${label} must be set in LIVE mode`);
    }
    return createHash("sha256").update(`insecure-dev-key:${label}`).digest();
  }
  const raw = Buffer.from(material, "base64");
  if (raw.length >= KEY_LEN) return raw.subarray(0, KEY_LEN);
  return createHash("sha256").update(raw).digest();
}

const dataKey = () => keyFrom(env.DATA_ENCRYPTION_KEY, "DATA_ENCRYPTION_KEY");
const hmacKey = () => keyFrom(env.SUPPRESSION_HMAC_KEY, "SUPPRESSION_HMAC_KEY");

/** The key being rotated away from, if a rotation is in progress. */
const previousDataKey = () =>
  env.DATA_ENCRYPTION_KEY_PREVIOUS
    ? keyFrom(env.DATA_ENCRYPTION_KEY_PREVIOUS, "DATA_ENCRYPTION_KEY_PREVIOUS")
    : null;

const previousHmacKey = () =>
  env.SUPPRESSION_HMAC_KEY_PREVIOUS
    ? keyFrom(env.SUPPRESSION_HMAC_KEY_PREVIOUS, "SUPPRESSION_HMAC_KEY_PREVIOUS")
    : null;

export const currentKeyVersion = () => env.SUPPRESSION_HMAC_KEY_VERSION;

export const rotationInProgress = () =>
  Boolean(env.SUPPRESSION_HMAC_KEY_PREVIOUS || env.DATA_ENCRYPTION_KEY_PREVIOUS);

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext>, all base64url. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(
    ".",
  );
}

function decryptWith(key: Buffer, ivB64: string, tagB64: string, ctB64: string): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Decrypts with the current key, falling back to the previous one during a
 * rotation. GCM authenticates, so a wrong key throws rather than returning
 * plausible rubbish — the fallback is safe.
 */
export function decrypt(payload: string): string {
  const [version, ivB64, tagB64, ctB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("Unsupported ciphertext format");
  }

  try {
    return decryptWith(dataKey(), ivB64, tagB64, ctB64);
  } catch (err) {
    const previous = previousDataKey();
    if (!previous) throw err;
    return decryptWith(previous, ivB64, tagB64, ctB64);
  }
}

/** Keyed lookup value for a normalized number. Versioned for key rotation. */
export function numberHash(normalized: string): string {
  return `${currentKeyVersion()}:${createHmac("sha256", hmacKey()).update(normalized).digest("base64url")}`;
}

/**
 * Every hash this number could be stored under — the current key, plus the
 * previous one while a rotation is in progress.
 *
 * Suppression lookups MUST use this rather than `numberHash`. Matching only on
 * the current key would silently stop every opt-out recorded before the
 * rotation from matching, and the failure mode is sending to someone who asked
 * you to stop.
 */
export function numberHashCandidates(normalized: string): string[] {
  const candidates = [numberHash(normalized)];
  const previous = previousHmacKey();
  if (previous) {
    candidates.push(
      `${env.SUPPRESSION_HMAC_KEY_PREVIOUS_VERSION}:${createHmac("sha256", previous)
        .update(normalized)
        .digest("base64url")}`,
    );
  }
  return candidates;
}

/** Content hash for quote binding — not a secret, so a plain digest is right. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Opaque, unguessable token. Returns the token and the value stored for it. */
export function newToken(): { token: string; lookup: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, lookup: sha256(token) };
}

export const tokenLookup = (token: string) => sha256(token);

/** Signed, opaque opt-out token — carries no phone number. */
export function signOptOutToken(numberHashValue: string, expiresAt: number): string {
  const body = Buffer.from(JSON.stringify({ h: numberHashValue, e: expiresAt })).toString(
    "base64url",
  );
  const mac = createHmac("sha256", hmacKey()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyOptOutToken(
  token: string,
): { numberHash: string; expiresAt: number } | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", hmacKey()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof parsed.h !== "string" || typeof parsed.e !== "number") return null;
    if (parsed.e < Date.now()) return null;
    return { numberHash: parsed.h, expiresAt: parsed.e };
  } catch {
    return null;
  }
}

/** Constant-time compare for provider signatures. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}
