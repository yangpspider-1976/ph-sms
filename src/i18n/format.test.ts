import { describe, expect, it } from "vitest";
import { PLATFORM_TIME_ZONE, platformWallTimeToDate } from "./format";

/**
 * Reading a typed date and time.
 *
 * The schedule field is labelled Asia/Manila. These hold it to that whatever
 * time zone the code runs in, because the bug this replaced only showed up on
 * a computer that was not on Philippine time.
 */

/** How the platform zone itself writes a moment, as YYYY-MM-DDTHH:mm. */
function inPlatformZone(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PLATFORM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

describe("platformWallTimeToDate", () => {
  it("reads the value as Manila time, eight hours ahead of UTC", () => {
    expect(platformWallTimeToDate("2026-10-08T14:00")?.toISOString()).toBe("2026-10-08T06:00:00.000Z");
  });

  it("crosses midnight and the year boundary correctly", () => {
    expect(platformWallTimeToDate("2026-01-01T00:30")?.toISOString()).toBe("2025-12-31T16:30:00.000Z");
  });

  it("keeps seconds when the field supplies them", () => {
    expect(platformWallTimeToDate("2026-10-08T14:00:30")?.toISOString()).toBe("2026-10-08T06:00:30.000Z");
    // Fractions of a second are dropped: a schedule is not that precise.
    expect(platformWallTimeToDate("2026-10-08T14:00:30.250")?.toISOString()).toBe("2026-10-08T06:00:30.000Z");
  });

  it("agrees with the platform time zone all year round", () => {
    // The offset is a constant; this is what would notice if it stopped being one.
    for (const typed of ["2026-01-15T09:05", "2026-04-01T00:00", "2026-07-31T23:59", "2026-12-25T12:30"]) {
      expect(inPlatformZone(platformWallTimeToDate(typed)!), typed).toBe(typed);
    }
  });

  it("refuses anything that is not a complete date and time", () => {
    for (const value of ["", "2026-10-08", "14:00", "tomorrow", "2026-10-08 14:00", "2026-10-08T14"]) {
      expect(platformWallTimeToDate(value), JSON.stringify(value)).toBeNull();
    }
  });

  it("refuses a date that does not exist rather than rolling it forward", () => {
    for (const value of ["2026-02-31T10:00", "2026-13-01T10:00", "2026-10-08T24:00", "2026-10-08T10:60"]) {
      expect(platformWallTimeToDate(value), value).toBeNull();
    }
  });
});
