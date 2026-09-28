import "server-only";
import { z } from "zod";

/**
 * Server-side environment. The runtime mode is read from the environment and is
 * never settable from a request, so a browser cannot talk the server out of MOCK.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_MODE: z.enum(["MOCK", "PARTNER_SANDBOX", "LIVE"]).default("MOCK"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  SUPPRESSION_HMAC_KEY: z.string().default(""),
  SUPPRESSION_HMAC_KEY_VERSION: z.coerce.number().int().positive().default(1),
  /**
   * The key being rotated away from. While set, stored hashes made under it
   * still match, so opt-outs keep working during a rotation. Remove it once
   * `npm run rotate-keys` reports nothing left to re-key.
   */
  SUPPRESSION_HMAC_KEY_PREVIOUS: z.string().default(""),
  // Blank must mean "absent", not 0: a present-but-empty var would otherwise
  // fail validation and stop the app booting.
  SUPPRESSION_HMAC_KEY_PREVIOUS_VERSION: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().int().nonnegative().default(0),
  ),

  DATA_ENCRYPTION_KEY: z.string().default(""),
  /** Same idea for ciphertext: decrypt with either, encrypt with the new one. */
  DATA_ENCRYPTION_KEY_PREVIOUS: z.string().default(""),

  PARTNER_SMS_BASE_URL: z.string().default(""),
  PARTNER_SMS_API_KEY: z.string().default(""),
  PARTNER_SMS_WEBHOOK_SECRET: z.string().default(""),

  PAYMENT_PROVIDER: z.string().default("MOCK"),
  PAYMENT_WEBHOOK_SECRET: z.string().default(""),
  // An empty value in .env must still yield the default: zod only applies
  // .default() when the key is absent, and an empty merchant id would otherwise
  // disable merchant verification on incoming payment events.
  PAYMENT_MERCHANT_ID: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().default("demo-merchant"),
  ),

  MAIL_TRANSPORT: z.enum(["SINK", "SMTP"]).default("SINK"),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().int().positive().default(587),
  ),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  SMTP_FROM: z.string().default(""),
  /** Used to turn a relative link into an absolute one in outgoing mail. */
  APP_BASE_URL: z.string().default("http://localhost:3000"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid server environment:\n${issues.join("\n")}`);
}

export const env = { ...parsed.data };

/**
 * Re-reads process.env into the exported object.
 *
 * Only for tests that need to act as both "before" and "after" a key rotation
 * in one process. Everything else reads `env` per call, so this is enough.
 */
export function resetEnvForTests(): void {
  const reparsed = schema.safeParse(process.env);
  if (!reparsed.success) {
    throw new Error(`Invalid environment on reload: ${reparsed.error.message}`);
  }
  Object.assign(env, reparsed.data);
}

export const isMock = () => env.APP_MODE === "MOCK";
export const isLive = () => env.APP_MODE === "LIVE";

/**
 * Demo affordances (seeded logins, fake verification links, demo funding,
 * mock payment endpoints) exist only outside LIVE.
 */
export const demoFeaturesEnabled = () => env.APP_MODE !== "LIVE";

/** Keys required before LIVE can be switched on. Reported by the readiness check. */
export function liveReadinessGaps(): string[] {
  const gaps: string[] = [];
  if (!env.SUPPRESSION_HMAC_KEY) gaps.push("SUPPRESSION_HMAC_KEY is not set");
  if (!env.DATA_ENCRYPTION_KEY) gaps.push("DATA_ENCRYPTION_KEY is not set");
  if (!env.PARTNER_SMS_BASE_URL) gaps.push("Partner SMS base URL is not configured");
  if (!env.PARTNER_SMS_API_KEY) gaps.push("Partner SMS credentials are not configured");
  if (!env.PARTNER_SMS_WEBHOOK_SECRET)
    gaps.push("Partner delivery-event authentication secret is not configured");
  if (env.PAYMENT_PROVIDER === "MOCK")
    gaps.push("No real payment provider is configured (PAYMENT_PROVIDER=MOCK)");
  if (env.PAYMENT_MERCHANT_ID === "demo-merchant")
    gaps.push("PAYMENT_MERCHANT_ID is still the demo placeholder");
  if (env.MAIL_TRANSPORT === "SINK")
    gaps.push("Email delivery is the local sink, not a real transport");
  if (env.MAIL_TRANSPORT === "SMTP" && !env.SMTP_HOST)
    gaps.push("MAIL_TRANSPORT is SMTP but SMTP_HOST is not set");
  if (env.APP_BASE_URL.includes("localhost"))
    gaps.push("APP_BASE_URL still points at localhost; links in email would not work");
  return gaps;
}
