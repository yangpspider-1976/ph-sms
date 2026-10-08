import { describe, expect, it } from "vitest";
import { DICTIONARIES } from "./dictionaries";
import { localizeServerText } from "./server-text";
import { REJECTION_TEXT } from "@/server/domain/phone";
import { DEFAULT_CONTENT_POLICY, checkContent } from "@/server/domain/content-checks";

/**
 * The server's English messages are matched by their wording, so the risk is
 * drift: someone rewords a message in the domain layer and it silently goes
 * back to English for Korean readers. These read the messages from where they
 * are written rather than from a copy.
 */

const { en, ko } = DICTIONARIES;
const hangul = /[가-힯]/;

describe("localizeServerText", () => {
  it("leaves English exactly as the server wrote it", () => {
    for (const text of Object.values(REJECTION_TEXT)) {
      expect(localizeServerText(text, en)).toBe(text);
    }
    expect(localizeServerText("3 job(s) exhausted their retries.", en)).toBe(
      "3 job(s) exhausted their retries.",
    );
  });

  it("knows every reason a phone number can be rejected for", () => {
    for (const text of Object.values(REJECTION_TEXT)) {
      expect(localizeServerText(text, ko), text).toMatch(hangul);
    }
  });

  it("knows every built-in content rule", () => {
    for (const rule of DEFAULT_CONTENT_POLICY.rules) {
      expect(localizeServerText(rule.description, ko), rule.description).toMatch(hangul);
    }
  });

  it("translates each reason inside a hold summary", () => {
    const result = checkContent("URGENT: act now, final notice. Your loan is approved.");
    const shown = localizeServerText(result.summary, ko);

    expect(result.summary).toMatch(/^(Held for approval|Refused): /);
    expect(shown).not.toMatch(/[A-Za-z]{4,}/);
  });

  it("keeps the values inside a message", () => {
    expect(localizeServerText("Top-up pay_abc123", ko)).toContain("pay_abc123");
    expect(localizeServerText("Same number as row 12", ko)).toContain("12");
    expect(localizeServerText("DATA_ENCRYPTION_KEY is not set", ko)).toContain(
      "DATA_ENCRYPTION_KEY",
    );
    expect(localizeServerText("Organization is SUSPENDED", ko)).toContain(ko.status.org.SUSPENDED);
  });

  it("does not touch what a person typed", () => {
    const typed = "Customer asked to stop receiving messages";
    expect(localizeServerText(typed, ko)).toBe(typed);
    expect(localizeServerText(null, ko)).toBeNull();
  });
});
