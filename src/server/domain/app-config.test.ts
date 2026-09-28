import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, db, resetDb } from "@/test/db";
import { createTenant, type Tenant } from "@/test/fixtures";
import { appConfig, appConfigVersions, auditEvents } from "@/server/db/schema";
import { MOCK_DEFAULTS } from "@/server/config";
import {
  clearConfigValue,
  ConfigError,
  configHistory,
  getEffectiveConfig,
  getEffectiveContentPolicy,
  listConfig,
  setConfigValue,
  setContentPolicy,
} from "./app-config";
import {
  contentPolicySchema,
  dehydratePolicy,
  DEFAULT_CONTENT_POLICY,
  isSafePattern,
} from "./content-checks";

/**
 * Admin-editable configuration. The point of this layer is that a limit can be
 * changed without a deploy, so what matters is that a change takes effect, that
 * a bad value cannot be saved, and that the previous value is still recoverable.
 */

let tenant: Tenant;

beforeEach(async () => {
  await resetDb();
  tenant = await createTenant();
});
afterAll(closeDb);

describe("getEffectiveConfig", () => {
  it("returns the code defaults when nothing has been overridden", async () => {
    const config = await getEffectiveConfig();
    expect(config).toEqual(MOCK_DEFAULTS);
  });

  it("applies an override", async () => {
    await setConfigValue({
      key: "selfServiceCeiling",
      value: 42,
      actorUserId: tenant.userId,
    });

    const config = await getEffectiveConfig();
    expect(config.selfServiceCeiling).toBe(42);
    // Everything else is untouched.
    expect(config.dailyDestinationQuota).toBe(MOCK_DEFAULTS.dailyDestinationQuota);
  });

  it("falls back to the code defaults when a stored value is nonsense", async () => {
    await db.insert(appConfig).values({
      key: "selfServiceCeiling",
      value: -5,
      version: 1,
      mode: "MOCK",
    });

    // A bad row must not take the platform down.
    const config = await getEffectiveConfig();
    expect(config).toEqual(MOCK_DEFAULTS);
  });

  it("ignores a stored key that is not editable", async () => {
    await db.insert(appConfig).values({
      key: "somethingElse",
      value: 1,
      version: 1,
      mode: "MOCK",
    });

    await expect(getEffectiveConfig()).resolves.toEqual(MOCK_DEFAULTS);
  });
});

describe("setConfigValue", () => {
  it("refuses a value the schema rejects", async () => {
    await expect(
      setConfigValue({ key: "unitPriceCentavos", value: 0, actorUserId: tenant.userId }),
    ).rejects.toBeInstanceOf(ConfigError);

    // Nothing was written.
    const rows = await db.select().from(appConfig);
    expect(rows).toHaveLength(0);
  });

  it("keeps every previous value", async () => {
    for (const value of [10, 20, 30]) {
      await setConfigValue({ key: "maxScheduleDays", value, actorUserId: tenant.userId });
    }

    const history = await configHistory("maxScheduleDays");
    expect(history.map((h) => h.value)).toEqual([30, 20, 10]);
    expect(history[0]!.version).toBe(3);
  });

  it("writes the change to the audit log with both values", async () => {
    await setConfigValue({
      key: "maxScheduleDays",
      value: 7,
      actorUserId: tenant.userId,
    });

    const [event] = await db.select().from(auditEvents);
    expect(event!.action).toBe("admin.config_changed");
    expect(event!.metadata).toMatchObject({
      from: MOCK_DEFAULTS.maxScheduleDays,
      to: 7,
    });
  });

  it("does not leave a version row behind when the value is rejected", async () => {
    await expect(
      setConfigValue({ key: "maxScheduleDays", value: -1, actorUserId: tenant.userId }),
    ).rejects.toBeInstanceOf(ConfigError);

    const versions = await db.select().from(appConfigVersions);
    expect(versions).toHaveLength(0);
  });
});

describe("clearConfigValue", () => {
  it("restores the built-in default", async () => {
    await setConfigValue({ key: "selfServiceCeiling", value: 42, actorUserId: tenant.userId });
    await clearConfigValue({ key: "selfServiceCeiling", actorUserId: tenant.userId });

    const config = await getEffectiveConfig();
    expect(config.selfServiceCeiling).toBe(MOCK_DEFAULTS.selfServiceCeiling);
  });

  it("keeps the history of what it used to be", async () => {
    await setConfigValue({ key: "selfServiceCeiling", value: 42, actorUserId: tenant.userId });
    await clearConfigValue({ key: "selfServiceCeiling", actorUserId: tenant.userId });

    const history = await configHistory("selfServiceCeiling");
    expect(history).toHaveLength(1);
    expect(history[0]!.value).toBe(42);
  });
});

describe("listConfig", () => {
  it("marks which settings have been changed from stock", async () => {
    await setConfigValue({ key: "maxScheduleDays", value: 7, actorUserId: tenant.userId });

    const rows = await listConfig();
    const changed = rows.find((r) => r.key === "maxScheduleDays")!;
    const untouched = rows.find((r) => r.key === "selfServiceCeiling")!;

    expect(changed.overridden).toBe(true);
    expect(changed.value).toBe(7);
    expect(changed.defaultValue).toBe(MOCK_DEFAULTS.maxScheduleDays);
    expect(untouched.overridden).toBe(false);
  });
});

describe("content policy", () => {
  it("returns the built-in policy when none is saved", async () => {
    const policy = await getEffectiveContentPolicy();
    expect(policy.rules.map((r) => r.id)).toEqual(
      DEFAULT_CONTENT_POLICY.rules.map((r) => r.id),
    );
  });

  it("round-trips through storage", async () => {
    const stored = dehydratePolicy(DEFAULT_CONTENT_POLICY);
    await setContentPolicy({ policy: stored, actorUserId: tenant.userId });

    const policy = await getEffectiveContentPolicy();
    // Patterns come back as working regular expressions, not strings.
    expect(policy.rules[0]!.pattern).toBeInstanceOf(RegExp);
    expect(policy.rules.map((r) => r.id)).toEqual(stored.rules.map((r) => r.id));
  });

  it("applies a saved policy", async () => {
    const stored = dehydratePolicy(DEFAULT_CONTENT_POLICY);
    stored.rules = [
      {
        id: "no-mangoes",
        severity: "BLOCK",
        description: "Mentions mangoes",
        pattern: "mango",
        flags: "i",
      },
    ];
    await setContentPolicy({ policy: stored, actorUserId: tenant.userId });

    const policy = await getEffectiveContentPolicy();
    expect(policy.rules).toHaveLength(1);
    expect(policy.rules[0]!.pattern.test("Fresh MANGO delivery")).toBe(true);
  });

  it("refuses a policy with an invalid regular expression", async () => {
    const stored = dehydratePolicy(DEFAULT_CONTENT_POLICY);
    stored.rules = [
      {
        id: "broken",
        severity: "BLOCK",
        description: "Unbalanced",
        pattern: "(unclosed",
        flags: "i",
      },
    ];

    await expect(
      setContentPolicy({ policy: stored, actorUserId: tenant.userId }),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it("falls back to the defaults when a stored policy is nonsense", async () => {
    await db.insert(appConfig).values({
      key: "contentPolicy",
      value: { rules: "not an array" },
      version: 1,
      mode: "MOCK",
    });

    const policy = await getEffectiveContentPolicy();
    expect(policy.rules.length).toBe(DEFAULT_CONTENT_POLICY.rules.length);
  });
});

describe("isSafePattern", () => {
  it("rejects a quantifier applied to a repeating group", () => {
    // The classic catastrophic-backtracking shape: one saved rule like this
    // would stall every send that did not match it.
    expect(isSafePattern("(a+)+")).toBe(false);
    expect(isSafePattern("(\\d*)*")).toBe(false);
    expect(isSafePattern("(x+)*y")).toBe(false);
  });

  it("rejects a pattern that does not compile", () => {
    expect(isSafePattern("(unclosed")).toBe(false);
  });

  it("accepts the rules the platform ships with", () => {
    for (const rule of DEFAULT_CONTENT_POLICY.rules) {
      expect(isSafePattern(rule.pattern.source), rule.id).toBe(true);
    }
  });

  it("is enforced by the schema", () => {
    const result = contentPolicySchema.safeParse({
      rules: [
        { id: "bad", severity: "BLOCK", description: "Nested", pattern: "(a+)+", flags: "i" },
      ],
      url: {
        allowedDomains: [],
        blockedDomains: [],
        reviewUnknownDomains: false,
        reviewShorteners: true,
      },
      reviewRecipientThreshold: 50,
    });

    expect(result.success).toBe(false);
  });
});
