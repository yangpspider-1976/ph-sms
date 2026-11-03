import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isUuid } from "./uuid";

/**
 * Ids arrive in links and in action arguments, so anything can turn up. A value
 * this lets through reaches a uuid column, where PostgreSQL fails the whole
 * query on a malformed one instead of matching nothing.
 */

describe("isUuid", () => {
  it("accepts the ids the database hands out", () => {
    const id = randomUUID();
    expect(isUuid(id)).toBe(true);
    expect(isUuid(id.toUpperCase())).toBe(true);
  });

  it("refuses anything that is not exactly one id", () => {
    const id = randomUUID();
    for (const value of [
      "abc",
      "",
      id.replace(/-/g, ""),
      `{${id}}`,
      ` ${id}`,
      `${id}\n`,
      `${id},${id}`,
      id.slice(0, -1) + "g",
    ]) {
      expect(isUuid(value), JSON.stringify(value)).toBe(false);
    }
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
