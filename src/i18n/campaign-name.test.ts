import { describe, expect, it } from "vitest";
import { campaignName } from "./campaign-name";
import { formatDateTime } from "./format";
import { en } from "./locales/en";
import { ko } from "./locales/ko";

/**
 * A test send's name.
 *
 * Until 13 November 2026 it was stored as "Test send — " and the time in UTC,
 * eight hours behind every other time on screen, and it stayed English for a
 * Korean reader. Those campaigns are still in the database, so the name is
 * written when it is shown rather than taken from the row.
 */

// 03:12 UTC is 11:12 in Manila.
const sentAt = new Date("2026-11-11T03:12:40Z");
const storedBefore = { name: "Test send — 2026-11-11 03:12", isTestSend: true, createdAt: sentAt };

describe("campaignName", () => {
  it("gives a test send's time in Manila, whatever its stored name says", () => {
    const name = campaignName(storedBefore, en, "en");
    expect(name).toBe(`Test send — ${formatDateTime(sentAt, "en")}`);
    expect(name).toContain("11:12");
    expect(name).not.toContain("03:12");
  });

  it("names a test send in the reader's language", () => {
    const name = campaignName(storedBefore, ko, "ko");
    expect(name).toBe(`테스트 발송 — ${formatDateTime(sentAt, "ko")}`);
    expect(name).toContain("11:12");
  });

  it("keeps every other campaign's name as the sender gave it", () => {
    const named = { name: "Store opening", isTestSend: false, createdAt: sentAt };
    expect(campaignName(named, ko, "ko")).toBe("Store opening");
    expect(campaignName(named, en, "en")).toBe("Store opening");
  });
});
