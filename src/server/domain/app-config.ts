import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { appConfig, appConfigVersions } from "@/server/db/schema";
import { configSchema, MOCK_DEFAULTS, type AppConfig } from "@/server/config";
import {
  contentPolicySchema,
  DEFAULT_CONTENT_POLICY,
  dehydratePolicy,
  hydratePolicy,
} from "./content-checks";
import type { ContentPolicy } from "./content-checks";
import { recordAudit } from "@/server/audit";
import { env } from "@/server/env";

/**
 * Admin-editable configuration.
 *
 * The code defaults in `config.ts` stay as they are: they are the floor, the
 * thing that works when the table is empty and the thing a fresh deployment
 * starts from. This layer lets a platform admin override individual settings
 * at runtime and keeps every previous value, because "who lowered the daily
 * quota and when" is a question that gets asked after an incident, not before.
 *
 * Overrides are stored per `APP_MODE`. A limit tuned for the mock environment
 * must not silently become the live limit.
 */

/** Settings an admin may change. The rest are structural and stay in code. */
export const EDITABLE_KEYS = [
  "selfServiceCeiling",
  "dailyDestinationQuota",
  "monthlyDestinationQuota",
  "maxSegmentsPerMessage",
  "maxScheduleDays",
  "dailySegmentQuota",
  "dailySpendCapCentavos",
  "maxCampaignsPerHour",
  "unitPriceCentavos",
  "quoteValiditySeconds",
  "uploadRetentionHours",
  "messageDetailRetentionDays",
  "auditRetentionDays",
  "contactRetentionDays",
  "suppressionRetentionDays",
  "maxDispatchAttempts",
] as const satisfies ReadonlyArray<keyof AppConfig>;

export type EditableKey = (typeof EDITABLE_KEYS)[number];

export const KEY_LABELS: Record<EditableKey, string> = {
  selfServiceCeiling: "Self-service recipient ceiling",
  dailyDestinationQuota: "Daily destinations per organization",
  monthlyDestinationQuota: "Monthly destinations per organization",
  maxSegmentsPerMessage: "Maximum segments per message",
  maxScheduleDays: "Furthest a send may be scheduled (days)",
  dailySegmentQuota: "Daily segments per organization",
  dailySpendCapCentavos: "Daily spend cap (centavos)",
  maxCampaignsPerHour: "Campaigns per hour per organization",
  unitPriceCentavos: "Price per segment (centavos)",
  quoteValiditySeconds: "How long a quote stays valid (seconds)",
  uploadRetentionHours: "Uploaded file retention (hours)",
  messageDetailRetentionDays: "Message detail retention (days)",
  auditRetentionDays: "Audit log retention (days)",
  contactRetentionDays: "Contact retention (days)",
  suppressionRetentionDays: "Opt-out retention (days)",
  maxDispatchAttempts: "Delivery attempts before giving up",
};

/** The separate key under which the content policy is stored. */
const CONTENT_POLICY_KEY = "contentPolicy";

/**
 * Reads the effective configuration.
 *
 * Not cached across requests: an admin who lowers a limit expects it to apply
 * to the next send, not after a deploy. The table has at most a few dozen rows
 * and is read by primary key.
 */
export async function getEffectiveConfig(): Promise<AppConfig> {
  const rows = await db
    .select({ key: appConfig.key, value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.mode, env.APP_MODE));

  const overrides: Record<string, unknown> = {};
  for (const row of rows) {
    if ((EDITABLE_KEYS as readonly string[]).includes(row.key)) {
      overrides[row.key] = row.value;
    }
  }

  const merged = { ...MOCK_DEFAULTS, ...overrides };

  // A stored value that no longer parses (a schema change, a bad migration)
  // must not take the platform down: fall back to the code defaults and say so.
  const parsed = configSchema.safeParse(merged);
  if (!parsed.success) {
    console.error("app-config: stored overrides are invalid, using code defaults", parsed.error);
    return MOCK_DEFAULTS;
  }
  return parsed.data;
}

/** The effective content policy (MSG-05), with the same fallback behaviour. */
export async function getEffectiveContentPolicy(): Promise<ContentPolicy> {
  const [row] = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(and(eq(appConfig.key, CONTENT_POLICY_KEY), eq(appConfig.mode, env.APP_MODE)))
    .limit(1);

  if (!row) return DEFAULT_CONTENT_POLICY;

  const parsed = contentPolicySchema.safeParse(row.value);
  if (!parsed.success) {
    console.error("app-config: stored content policy is invalid, using defaults", parsed.error);
    return DEFAULT_CONTENT_POLICY;
  }
  return hydratePolicy(parsed.data);
}

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly code: "UNKNOWN_KEY" | "INVALID_VALUE",
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Sets one value.
 *
 * Validated against the same schema the rest of the platform uses, so an admin
 * cannot save a negative price or a zero ceiling and discover it at dispatch
 * time. The previous value is appended to the version history before the new
 * one is written.
 */
export async function setConfigValue(input: {
  key: EditableKey;
  value: number;
  actorUserId: string;
}): Promise<void> {
  if (!(EDITABLE_KEYS as readonly string[]).includes(input.key)) {
    throw new ConfigError("That setting is not editable.", "UNKNOWN_KEY");
  }

  // Validate the whole config with this one field replaced, so a value that is
  // individually plausible but wrong in context is still caught.
  const candidate = configSchema.safeParse({ ...MOCK_DEFAULTS, [input.key]: input.value });
  if (!candidate.success) {
    const issue = candidate.error.issues.find((i) => i.path[0] === input.key);
    throw new ConfigError(
      issue ? `${KEY_LABELS[input.key]}: ${issue.message}` : "That value is not valid.",
      "INVALID_VALUE",
    );
  }

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(appConfig)
      .where(and(eq(appConfig.key, input.key), eq(appConfig.mode, env.APP_MODE)))
      .limit(1);

    const nextVersion = (existing?.version ?? 0) + 1;

    await tx
      .insert(appConfig)
      .values({
        key: input.key,
        value: input.value,
        version: nextVersion,
        mode: env.APP_MODE,
        updatedBy: input.actorUserId,
      })
      .onConflictDoUpdate({
        target: appConfig.key,
        set: {
          value: input.value,
          version: nextVersion,
          updatedBy: input.actorUserId,
          updatedAt: new Date(),
        },
      });

    await tx.insert(appConfigVersions).values({
      key: input.key,
      version: nextVersion,
      value: input.value,
      mode: env.APP_MODE,
      updatedBy: input.actorUserId,
    });

    await recordAudit(
      {
        action: "admin.config_changed",
        actorUserId: input.actorUserId,
        actorKind: "PLATFORM_ADMIN",
        objectType: "app_config",
        objectId: input.key,
        metadata: {
          from: existing?.value ?? MOCK_DEFAULTS[input.key],
          to: input.value,
          mode: env.APP_MODE,
        },
      },
      tx,
    );
  });
}

/** Saves a content policy. Validated the same way. */
export async function setContentPolicy(input: {
  policy: unknown;
  actorUserId: string;
}): Promise<void> {
  const parsed = contentPolicySchema.safeParse(input.policy);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues[0]?.message ?? "That policy is not valid.",
      "INVALID_VALUE",
    );
  }

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(appConfig)
      .where(and(eq(appConfig.key, CONTENT_POLICY_KEY), eq(appConfig.mode, env.APP_MODE)))
      .limit(1);

    const nextVersion = (existing?.version ?? 0) + 1;

    await tx
      .insert(appConfig)
      .values({
        key: CONTENT_POLICY_KEY,
        value: parsed.data,
        version: nextVersion,
        mode: env.APP_MODE,
        updatedBy: input.actorUserId,
      })
      .onConflictDoUpdate({
        target: appConfig.key,
        set: {
          value: parsed.data,
          version: nextVersion,
          updatedBy: input.actorUserId,
          updatedAt: new Date(),
        },
      });

    await tx.insert(appConfigVersions).values({
      key: CONTENT_POLICY_KEY,
      version: nextVersion,
      value: parsed.data,
      mode: env.APP_MODE,
      updatedBy: input.actorUserId,
    });

    await recordAudit(
      {
        action: "admin.content_policy_changed",
        actorUserId: input.actorUserId,
        actorKind: "PLATFORM_ADMIN",
        objectType: "app_config",
        objectId: CONTENT_POLICY_KEY,
        metadata: {
          rules: parsed.data.rules.length,
          blockedDomains: parsed.data.url.blockedDomains.length,
        },
      },
      tx,
    );
  });
}

/** Restores a setting to the code default by removing its override. */
export async function clearConfigValue(input: {
  key: EditableKey;
  actorUserId: string;
}): Promise<void> {
  await db
    .delete(appConfig)
    .where(and(eq(appConfig.key, input.key), eq(appConfig.mode, env.APP_MODE)));

  await recordAudit({
    action: "admin.config_reset",
    actorUserId: input.actorUserId,
    actorKind: "PLATFORM_ADMIN",
    objectType: "app_config",
    objectId: input.key,
    metadata: { to: MOCK_DEFAULTS[input.key], mode: env.APP_MODE },
  });
}

export type ConfigRow = {
  key: EditableKey;
  label: string;
  value: number;
  defaultValue: number;
  overridden: boolean;
  version: number | null;
  updatedAt: Date | null;
};

/** Every editable setting with its current and default value, for the screen. */
export async function listConfig(): Promise<ConfigRow[]> {
  const rows = await db
    .select()
    .from(appConfig)
    .where(eq(appConfig.mode, env.APP_MODE));

  const byKey = new Map(rows.map((r) => [r.key, r]));

  return EDITABLE_KEYS.map((key) => {
    const row = byKey.get(key);
    const defaultValue = MOCK_DEFAULTS[key] as number;
    return {
      key,
      label: KEY_LABELS[key],
      value: row ? (row.value as number) : defaultValue,
      defaultValue,
      overridden: Boolean(row),
      version: row?.version ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

/** History for one setting, newest first. */
/** The current policy in its editable form. */
export async function getEditableContentPolicy() {
  return dehydratePolicy(await getEffectiveContentPolicy());
}

export async function configHistory(key: string, limit = 20) {
  return db
    .select()
    .from(appConfigVersions)
    .where(and(eq(appConfigVersions.key, key), eq(appConfigVersions.mode, env.APP_MODE)))
    .orderBy(desc(appConfigVersions.version))
    .limit(limit);
}
