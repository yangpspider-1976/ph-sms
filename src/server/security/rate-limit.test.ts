import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, db, resetDb } from "@/test/db";
import { rateLimitHits } from "@/server/db/schema";
import {
  checkRateLimit,
  clearRateLimit,
  LIMITS,
  peekRateLimit,
  purgeRateLimits,
  recordRateLimitFailure,
} from "./rate-limit";

/**
 * SEC-06. The limiter is shared infrastructure, so the properties that matter
 * are the boundaries: where it starts refusing, who it refuses, and whether a
 * refusal can be worn down by simply continuing.
 */

const RULE = { max: 3, windowSeconds: 300, description: "attempts" };

beforeEach(resetDb);
afterAll(closeDb);

describe("checkRateLimit", () => {
  it("allows exactly the configured number of attempts", async () => {
    const outcomes = [];
    for (let i = 0; i < 4; i += 1) {
      outcomes.push(await checkRateLimit("login", "someone@example.com", RULE));
    }

    expect(outcomes.slice(0, 3).map((o) => o.allowed)).toEqual([true, true, true]);
    expect(outcomes[3]!.allowed).toBe(false);
    expect(outcomes[3]!.message).toContain("Too many attempts");
  });

  it("counts down the remaining allowance", async () => {
    const first = await checkRateLimit("login", "a@example.com", RULE);
    const second = await checkRateLimit("login", "a@example.com", RULE);

    expect(first.remaining).toBe(2);
    expect(second.remaining).toBe(1);
  });

  it("keeps counting once over the limit, so refusals cannot be outlasted", async () => {
    for (let i = 0; i < 5; i += 1) {
      await checkRateLimit("login", "persistent@example.com", RULE);
    }

    // If rejected attempts were not recorded, the window would drain while the
    // attacker kept trying and they would be let back in early.
    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(rateLimitHits)
      .where(eq(rateLimitHits.bucket, "login"));
    expect(rows[0]!.n).toBe(5);
  });

  it("limits each subject separately", async () => {
    for (let i = 0; i < 4; i += 1) {
      await checkRateLimit("login", "noisy@example.com", RULE);
    }

    const neighbour = await checkRateLimit("login", "quiet@example.com", RULE);
    expect(neighbour.allowed).toBe(true);
  });

  it("limits each bucket separately", async () => {
    for (let i = 0; i < 4; i += 1) {
      await checkRateLimit("login", "shared-subject", RULE);
    }

    // Being locked out of sign-in must not also lock the same string out of
    // an unrelated surface.
    const other = await checkRateLimit("export", "shared-subject", RULE);
    expect(other.allowed).toBe(true);
  });

  it("does not store the subject in the clear", async () => {
    await checkRateLimit("login", "secret@example.com", RULE);

    const [row] = await db.select().from(rateLimitHits);
    expect(row!.subjectHash).not.toContain("secret@example.com");
    expect(row!.subjectHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("forgets attempts once the window has passed", async () => {
    for (let i = 0; i < 4; i += 1) {
      await checkRateLimit("login", "yesterday@example.com", RULE);
    }
    expect((await checkRateLimit("login", "yesterday@example.com", RULE)).allowed).toBe(false);

    // Age every recorded attempt past the window.
    await db.update(rateLimitHits).set({
      createdAt: new Date(Date.now() - (RULE.windowSeconds + 60) * 1000),
    });

    expect((await checkRateLimit("login", "yesterday@example.com", RULE)).allowed).toBe(true);
  });
});

describe("clearRateLimit", () => {
  it("restores the full allowance", async () => {
    for (let i = 0; i < 4; i += 1) {
      await checkRateLimit("login", "fat-fingers@example.com", RULE);
    }
    expect((await checkRateLimit("login", "fat-fingers@example.com", RULE)).allowed).toBe(false);

    // What a successful sign-in does: a customer who mistyped their password
    // four times and then got it right is not locked out afterwards.
    await clearRateLimit("login", "fat-fingers@example.com");

    expect((await checkRateLimit("login", "fat-fingers@example.com", RULE)).allowed).toBe(true);
  });

  it("leaves other subjects alone", async () => {
    await checkRateLimit("login", "one@example.com", RULE);
    await checkRateLimit("login", "two@example.com", RULE);

    await clearRateLimit("login", "one@example.com");

    const rows = await db.select().from(rateLimitHits);
    expect(rows).toHaveLength(1);
  });
});

describe("purgeRateLimits", () => {
  it("removes rows older than the retention period and keeps recent ones", async () => {
    await checkRateLimit("login", "old@example.com", RULE);
    await db.update(rateLimitHits).set({
      createdAt: new Date(Date.now() - 48 * 3600 * 1000),
    });
    await checkRateLimit("login", "new@example.com", RULE);

    const deleted = await purgeRateLimits(86_400);

    expect(deleted).toBe(1);
    const remaining = await db.select().from(rateLimitHits);
    expect(remaining).toHaveLength(1);
  });
});

describe("LIMITS", () => {
  it("defines a rule for every limited surface", () => {
    for (const [name, rule] of Object.entries(LIMITS)) {
      expect(rule.max, `${name}.max`).toBeGreaterThan(0);
      expect(rule.windowSeconds, `${name}.windowSeconds`).toBeGreaterThan(0);
      expect(rule.description, `${name}.description`).not.toHaveLength(0);
    }
  });
});

describe("unidentifiable clients", () => {
  it("does not let one shared bucket limit everybody", async () => {
    // A deployment without `x-forwarded-for` cannot tell clients apart. The
    // call sites skip the per-client limit in that case rather than bucketing
    // every request under one key — a shared key would mean ten failed
    // sign-ins anywhere locked out the whole platform. This test pins the
    // property the call sites rely on: distinct subjects never share a window.
    for (let i = 0; i < 4; i += 1) {
      await checkRateLimit("login", `client-${i}`, RULE);
      await checkRateLimit("login", `client-${i}`, RULE);
      await checkRateLimit("login", `client-${i}`, RULE);
      await checkRateLimit("login", `client-${i}`, RULE);
    }

    // Each of the four is over its own limit, and none of them affected a
    // fifth, previously unseen client.
    expect((await checkRateLimit("login", "client-0", RULE)).allowed).toBe(false);
    expect((await checkRateLimit("login", "client-9", RULE)).allowed).toBe(true);
  });
});

describe("credential limits count failures, not attempts", () => {
  it("peeking does not consume the allowance", async () => {
    for (let i = 0; i < 20; i += 1) {
      const result = await peekRateLimit("login", "busy@example.com", RULE);
      expect(result.allowed).toBe(true);
    }

    // Twenty successful sign-ins in a row must not look like an attack. This
    // is what locked out the browser tests when the limit counted every
    // attempt rather than every failure.
    expect((await peekRateLimit("login", "busy@example.com", RULE)).allowed).toBe(true);
  });

  it("refuses once enough failures are recorded", async () => {
    for (let i = 0; i < RULE.max; i += 1) {
      expect((await peekRateLimit("login", "guessed@example.com", RULE)).allowed).toBe(true);
      await recordRateLimitFailure("login", "guessed@example.com");
    }

    const blocked = await peekRateLimit("login", "guessed@example.com", RULE);
    expect(blocked.allowed).toBe(false);
    expect(blocked.message).toContain("Too many");
  });

  it("a success clears the failures that came before it", async () => {
    await recordRateLimitFailure("login", "typo@example.com");
    await recordRateLimitFailure("login", "typo@example.com");
    await recordRateLimitFailure("login", "typo@example.com");

    await clearRateLimit("login", "typo@example.com");

    const result = await peekRateLimit("login", "typo@example.com", RULE);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(RULE.max);
  });

  it("keeps failures for one subject away from another", async () => {
    for (let i = 0; i < RULE.max; i += 1) {
      await recordRateLimitFailure("login", "attacked@example.com");
    }

    expect((await peekRateLimit("login", "attacked@example.com", RULE)).allowed).toBe(false);
    expect((await peekRateLimit("login", "bystander@example.com", RULE)).allowed).toBe(true);
  });
});
