import { describe, expect, it } from "vitest";
import { DICTIONARIES } from "./dictionaries";
import { enServerText } from "./locales/en-server-text";
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

  it("shows a verification decision's notification in the reader's language", () => {
    expect(localizeServerText(enServerText.businessApproved, ko)).toBe(
      ko.serverText.businessApproved,
    );
    expect(localizeServerText(enServerText.noFurtherDetail, ko)).toBe(
      ko.serverText.noFurtherDetail,
    );
    // The admin action names the decision in lower-case words.
    for (const status of ["NEEDS_INFORMATION", "SUSPENDED", "REJECTED"] as const) {
      const title = enServerText.accountStatusNow(status.toLowerCase().replace("_", " "));
      expect(localizeServerText(title, ko), title).toBe(
        ko.serverText.accountStatusNow(ko.status.org[status]),
      );
    }
  });

  it("shows the settings editor's messages in the reader's language", () => {
    for (const text of [
      enServerText.mustBeAtLeast("1"),
      enServerText.mustBeAtMost("1000"),
      enServerText.valueNotValid,
      enServerText.settingSaved,
      enServerText.settingRestored,
    ]) {
      expect(localizeServerText(text, ko), text).toMatch(hangul);
    }
    expect(localizeServerText(enServerText.mustBeAtLeast("1"), ko)).toContain("1");
  });

  it("shows what each form says once it has worked in the reader's language", () => {
    // A count of one and of several, since the English changes with it.
    const confirmations = [
      enServerText.templateSaved,
      enServerText.saved,
      enServerText.groupCreated("Loyalty members"),
      enServerText.groupDeleted,
      enServerText.membersAdded("1"),
      enServerText.membersAdded("3"),
      enServerText.membersAddedSomeSkipped("2", "1"),
      enServerText.membersAddedSomeSkipped("2", "3"),
      enServerText.membersRemoved("1"),
      enServerText.membersRemoved("4"),
      enServerText.optOutsAdded("1"),
      enServerText.optOutsAdded("2"),
      enServerText.optOutsAddedSomeInvalid("2", "1"),
      enServerText.optOutsAddedSomeInvalid("2", "3"),
      enServerText.testSent("+63 917 *** 0901", "₱0.35"),
      enServerText.mobileCodeSent("+63 917 *** 0901"),
      enServerText.mobileVerified("+63 917 *** 0901"),
      enServerText.mobileRemoved,
      enServerText.senderSubmitted("TESTER01"),
      enServerText.invitationSent("tester.invite.1@example.com"),
      enServerText.supportReference("REF-AB12CD", "owner@demo.test"),
      enServerText.emailVerified,
      enServerText.inquiryReceived,
      enServerText.inquiryThanks,
      enServerText.policySaved("7"),
      enServerText.limitsUpdated,
      enServerText.freezeLifted,
      enServerText.platformBlocked("2"),
      enServerText.platformBlockedSomeInvalid("2", "1"),
      enServerText.mfaOn,
      enServerText.mfaVerified,
      enServerText.recoveryCodeAccepted("9"),
    ];
    for (const text of confirmations) {
      expect(localizeServerText(text, en), text).toBe(text);
      expect(localizeServerText(text, ko), text).toMatch(hangul);
    }

    // The admin actions name a status by its code; it shows as its label.
    for (const status of Object.keys(ko.status.inquiry) as Array<keyof typeof ko.status.inquiry>) {
      const text = enServerText.inquiryMoved(status.replace("_", " "));
      expect(localizeServerText(text, en), text).toBe(text);
      expect(localizeServerText(text, ko), text).toContain(ko.status.inquiry[status]);
    }
    for (const decision of ["APPROVED", "REJECTED", "REVOKED"] as const) {
      const text = enServerText.senderDecided(decision);
      expect(localizeServerText(text, en), text).toBe(text);
      expect(localizeServerText(text, ko), text).toContain(ko.status.sender[decision]);
    }
  });

  it("keeps the names, numbers and amounts in a confirmation", () => {
    const shown = (text: string) => localizeServerText(text, ko);
    expect(shown(enServerText.groupCreated("Loyalty members"))).toContain("Loyalty members");
    expect(shown(enServerText.membersAddedSomeSkipped("2", "3"))).toMatch(/2.*3/);
    expect(shown(enServerText.testSent("+63 917 *** 0901", "₱0.35"))).toContain("+63 917 *** 0901");
    expect(shown(enServerText.testSent("+63 917 *** 0901", "₱0.35"))).toContain("₱0.35");
    expect(shown(enServerText.supportReference("REF-AB12CD", "owner@demo.test"))).toContain("REF-AB12CD");
    expect(shown(enServerText.supportReference("REF-AB12CD", "owner@demo.test"))).toContain("owner@demo.test");
    expect(shown(enServerText.invitationSent("tester.invite.1@example.com"))).toContain("tester.invite.1@example.com");
  });

  it("does not touch what a person typed", () => {
    const typed = "Customer asked to stop receiving messages";
    expect(localizeServerText(typed, ko)).toBe(typed);
    expect(localizeServerText(null, ko)).toBeNull();
  });
});
