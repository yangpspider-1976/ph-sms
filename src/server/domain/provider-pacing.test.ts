import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, resetDb } from "@/test/db";
import { tryProviderSlot, waitForProviderSlot } from "./provider-pacing";

beforeEach(resetDb);
afterAll(closeDb);

describe("shared provider pacing", () => {
  it("admits only one concurrent submission across workers for the same provider", async () => {
    const admitted = await Promise.all(Array.from({ length: 8 }, () => tryProviderSlot("shared", 1)));
    expect(admitted.filter(Boolean)).toHaveLength(1);
    expect(await tryProviderSlot("another-provider", 1)).toBe(true);
  });

  it("does not sleep or reserve a future slot beyond a dispatch deadline", async () => {
    expect(await tryProviderSlot("deadline", 1)).toBe(true);
    expect(await waitForProviderSlot("deadline", 1, Date.now() + 50)).toBe(false);
    expect(await waitForProviderSlot("expired", 1, Date.now() - 1)).toBe(false);
    expect(await tryProviderSlot("expired", 1)).toBe(true);
  });

  it("allows the next submission only after the spacing interval", async () => {
    expect(await tryProviderSlot("spacing", 10)).toBe(true);
    expect(await tryProviderSlot("spacing", 10)).toBe(false);
    expect(await waitForProviderSlot("spacing", 10, Date.now() + 2000)).toBe(true);
  });

  it("rejects invalid rates before touching the provider", async () => {
    for (const rate of [0, -1, 1.5, 1001, NaN]) {
      await expect(tryProviderSlot("invalid", rate)).rejects.toThrow(RangeError);
    }
  });
});
