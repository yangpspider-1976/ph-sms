/**
 * Demo defaults (Master Prompt section C).
 *
 * These are PROVISIONAL TEST SETTINGS. They are not commercial terms, not legal
 * limits, and not approved pricing. They are centralized and versioned here so
 * nothing in the code hard-codes a number, and `assertLiveConfigured()` refuses
 * to let them be used as live configuration by default.
 */
import { z } from "zod";

export const PLATFORM_TIME_ZONE = "Asia/Manila";
export const PLATFORM_LOCALE = "en-PH";
export const CURRENCY = "PHP";

export const configSchema = z.object({
  /** Uploads */
  maxUploadBytes: z.number().int().positive(),
  maxDataRows: z.number().int().positive(),
  maxFieldLength: z.number().int().positive(),
  maxNameLength: z.number().int().positive(),

  /** Sending limits */
  selfServiceCeiling: z.number().int().positive(),
  dailyDestinationQuota: z.number().int().positive(),
  monthlyDestinationQuota: z.number().int().positive(),
  maxSegmentsPerMessage: z.number().int().positive(),
  maxScheduleDays: z.number().int().positive(),

  /** Independently configurable guards against long-message / repeat-send bypass */
  dailySegmentQuota: z.number().int().positive(),
  dailySpendCapCentavos: z.number().int().positive(),
  maxCampaignsPerHour: z.number().int().positive(),

  /** Pricing — illustrative only until approved live pricing exists */
  unitPriceCentavos: z.number().int().positive(),
  pricingPolicyVersion: z.number().int().positive(),
  taxPolicyVersion: z.number().int().positive(),
  pricingApproved: z.boolean(),

  /** Demo funding */
  demoFundingCentavos: z.number().int().nonnegative(),

  /** Quote validity, in seconds */
  quoteValiditySeconds: z.number().int().positive(),

  /** Retention, in hours/days */
  uploadRetentionHours: z.number().int().positive(),
  messageDetailRetentionDays: z.number().int().positive(),
  auditRetentionDays: z.number().int().positive(),
  contactRetentionDays: z.number().int().positive(),
  suppressionRetentionDays: z.number().int().positive(),

  /** Dispatch */
  dispatchLeaseSeconds: z.number().int().positive(),
  maxDispatchAttempts: z.number().int().positive(),
});

export type AppConfig = z.infer<typeof configSchema>;

export const MOCK_DEFAULTS: AppConfig = {
  maxUploadBytes: 5 * 1024 * 1024, // 5 MiB
  maxDataRows: 10_000, // excluding header
  maxFieldLength: 500,
  maxNameLength: 100,

  selfServiceCeiling: 100, // unique format-valid destinations, before suppression
  dailyDestinationQuota: 500,
  monthlyDestinationQuota: 5_000,
  maxSegmentsPerMessage: 6,
  maxScheduleDays: 30,

  dailySegmentQuota: 2_000,
  dailySpendCapCentavos: 200_000, // PHP 2,000.00
  maxCampaignsPerHour: 20,

  unitPriceCentavos: 100, // PHP 1.00 per segment — illustrative only
  pricingPolicyVersion: 1,
  taxPolicyVersion: 1,
  pricingApproved: false,

  demoFundingCentavos: 100_000, // PHP 1,000.00, demo-only

  quoteValiditySeconds: 10 * 60,

  uploadRetentionHours: 24,
  messageDetailRetentionDays: 30,
  auditRetentionDays: 90,
  contactRetentionDays: 730,
  suppressionRetentionDays: 3650,

  dispatchLeaseSeconds: 60,
  maxDispatchAttempts: 5,
};

/** CSV columns. phone_number is the only required one. */
export const CSV_REQUIRED_COLUMNS = ["phone_number"] as const;
export const CSV_OPTIONAL_COLUMNS = [
  "first_name",
  "last_name",
  "custom_1",
  "custom_2",
  "custom_3",
  "custom_4",
  "custom_5",
  "consent_source",
  "consent_date",
] as const;
/** Widened to string[] so a header read from a file can be tested against it. */
export const CSV_KNOWN_COLUMNS: readonly string[] = [
  ...CSV_REQUIRED_COLUMNS,
  ...CSV_OPTIONAL_COLUMNS,
];

/**
 * Live activation requires approved commercial and policy inputs. Demo values
 * are never silently promoted: this returns what is still missing.
 */
export function liveConfigGaps(config: AppConfig): string[] {
  const gaps: string[] = [];
  if (!config.pricingApproved) {
    gaps.push("Live unit pricing has not been approved (still using the demo price)");
  }
  if (config.unitPriceCentavos === MOCK_DEFAULTS.unitPriceCentavos && !config.pricingApproved) {
    gaps.push("Unit price is still the illustrative demo value of PHP 1.00 per segment");
  }
  if (config.demoFundingCentavos > 0) {
    gaps.push("Demo funding is still enabled");
  }
  return gaps;
}

/** PHP formatting from integer centavos. Never do money maths in floats. */
export function formatCentavos(centavos: number): string {
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const pesos = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  return `${sign}₱${pesos.toLocaleString("en-PH")}.${rest}`;
}

/** Asia/Manila calendar keys for quota buckets. */
export function manilaDayKey(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PLATFORM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function manilaMonthKey(at: Date = new Date()): string {
  return manilaDayKey(at).slice(0, 7);
}

/** Display helper: timestamps are stored in UTC and shown in Asia/Manila. */
export function formatManila(at: Date | string | null | undefined): string {
  if (!at) return "—";
  const d = typeof at === "string" ? new Date(at) : at;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: PLATFORM_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function formatManilaDate(at: Date | string | null | undefined): string {
  if (!at) return "—";
  const d = typeof at === "string" ? new Date(at) : at;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: PLATFORM_TIME_ZONE,
    dateStyle: "medium",
  }).format(d);
}
