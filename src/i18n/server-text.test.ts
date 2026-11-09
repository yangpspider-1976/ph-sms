import { globSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DICTIONARIES } from "./dictionaries";
import { enServerText } from "./locales/en-server-text";
import { localizeServerText } from "./server-text";
import { REJECTION_TEXT } from "@/server/domain/phone";
import { DEFAULT_CONTENT_POLICY, checkContent } from "@/server/domain/content-checks";
import { parseContactCsv } from "@/server/domain/csv";
import { validateMessageBody } from "@/server/domain/segments";
import { MOCK_DEFAULTS } from "@/server/config";

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

  it("shows every fixed sentence on the list in the reader's language", () => {
    const fixed = Object.values(enServerText).filter((v): v is string => typeof v === "string");
    expect(fixed.length).toBeGreaterThan(200);
    for (const text of fixed) {
      expect(localizeServerText(text, en), text).toBe(text);
      expect(localizeServerText(text, ko), text).toMatch(hangul);
    }
  });

  it("shows what each form says when it has not worked in the reader's language", () => {
    // A count of one and of several where the English changes with it.
    const failures = [
      enServerText.organizationCannot("pending review"),
      enServerText.groupEmpty("Loyalty members"),
      enServerText.groupNameTaken("Loyalty members"),
      enServerText.uploadTooLarge("4"),
      enServerText.fileTooLarge("4"),
      enServerText.repeatedColumn("phone_number"),
      enServerText.missingColumn("phone_number"),
      enServerText.unknownColumns("notes, tier"),
      enServerText.tooManyRows("10,001", "10,000"),
      enServerText.columnCustom("3"),
      enServerText.scheduleTooFar("30"),
      enServerText.overSelfServiceLimit("1,200", "1,000"),
      enServerText.dailyQuota("50", "10", "500"),
      enServerText.monthlyQuota("50", "0", "5000"),
      enServerText.tooManySegments("7", "6"),
      enServerText.notAwaitingApproval("queued"),
      enServerText.codeMismatchAttemptsLeft("1"),
      enServerText.codeMismatchAttemptsLeft("4"),
      enServerText.alreadyApplied("TESTER01"),
      enServerText.paymentAlready("paid"),
      enServerText.gatewayNotAccepted("REJECTED"),
      enServerText.decisionRecorded("needs information"),
      enServerText.senderApprovedDemo("TESTER01"),
      enServerText.policyIssue("rules.2.flags", enServerText.onlyFlags),
      enServerText.policyIssue("rules.0.pattern", enServerText.patternNested),
    ];
    for (const subject of Object.values(enServerText.limitSubjects)) {
      failures.push(enServerText.tooMany(subject, "1"), enServerText.tooMany(subject, "60"));
    }
    for (const text of failures) {
      expect(localizeServerText(text, en), text).toBe(text);
      expect(localizeServerText(text, ko), text).toMatch(hangul);
      expect(localizeServerText(text, ko), text).not.toMatch(/\b(?:the|is|has|than|not)\b/);
    }

    // What a rate limit counts reads in Korean too, not only the sentence around it.
    for (const key of Object.keys(ko.serverText.limitSubjects) as Array<keyof typeof ko.serverText.limitSubjects>) {
      const text = enServerText.tooMany(enServerText.limitSubjects[key], "5");
      expect(localizeServerText(text, ko)).toBe(ko.serverText.tooMany(ko.serverText.limitSubjects[key], "5"));
    }
  });

  it("names a role or status by its label, in either language", () => {
    for (const role of Object.keys(ko.roles.labels) as Array<keyof typeof ko.roles.labels>) {
      const text = enServerText.roleCannot(role);
      expect(localizeServerText(text, en)).toBe(enServerText.roleCannot(en.roles.labels[role]));
      expect(localizeServerText(text, ko)).toContain(ko.roles.labels[role]);
    }
    // The server names a status in lower-case words, with its first underscore a space.
    const words = (status: string) => status.toLowerCase().replace("_", " ");
    for (const status of Object.keys(ko.status.org) as Array<keyof typeof ko.status.org>) {
      expect(localizeServerText(enServerText.organizationCannot(words(status)), ko)).toContain(ko.status.org[status]);
      expect(localizeServerText(enServerText.decisionRecorded(words(status)), ko)).toContain(ko.status.org[status]);
    }
    for (const status of Object.keys(ko.status.campaign) as Array<keyof typeof ko.status.campaign>) {
      expect(localizeServerText(enServerText.notAwaitingApproval(words(status)), ko)).toContain(
        ko.status.campaign[status],
      );
    }
    for (const status of Object.keys(ko.status.payment) as Array<keyof typeof ko.status.payment>) {
      expect(localizeServerText(enServerText.paymentAlready(words(status)), ko)).toContain(ko.status.payment[status]);
    }
  });

  it("keeps the names, numbers and columns in a failure", () => {
    const shown = (text: string) => localizeServerText(text, ko);
    expect(shown(enServerText.groupNameTaken("Loyalty members"))).toContain("Loyalty members");
    expect(shown(enServerText.unknownColumns("notes, tier"))).toContain("notes, tier");
    expect(shown(enServerText.tooManyRows("10,001", "10,000"))).toMatch(/10,001.*10,000/);
    expect(shown(enServerText.dailyQuota("50", "10", "500"))).toMatch(/50.*500.*10/);
    expect(shown(enServerText.alreadyApplied("TESTER01"))).toContain("TESTER01");
    expect(shown(enServerText.gatewayNotAccepted("REJECTED"))).toContain("REJECTED");
  });

  it("shows a refused message's reasons and what to do, all in the reader's language", () => {
    const checks = checkContent("Reply with your PIN and OTP to claim your prize.");
    expect(checks.blocked).toBe(true);
    const text = enServerText.refusedEditMessage(checks.summary);
    const shown = localizeServerText(text, ko);

    expect(localizeServerText(text, en)).toBe(text);
    expect(shown).toContain(ko.serverText.ruleCredentialRequest);
    expect(shown).not.toMatch(/[A-Za-z]{4,}/);
  });

  it("keeps a policy field's name and translates only its problem", () => {
    const text = enServerText.policyIssue("rules.2.flags", enServerText.onlyFlags);
    expect(localizeServerText(text, ko)).toBe(ko.serverText.policyIssue("rules.2.flags", ko.serverText.onlyFlags));
    // Anything else with a colon comes back as it was.
    expect(localizeServerText("rules.2.flags: Invalid input", ko)).toBe("rules.2.flags: Invalid input");
  });

  it("recognises the upload failures where they are written", () => {
    const csv = (text: string) => Buffer.from(text, "utf8");
    const failure = (bytes: Buffer, config = MOCK_DEFAULTS) => {
      const result = parseContactCsv(bytes, config);
      if (result.ok) throw new Error("expected the upload to fail");
      return result.message;
    };
    const messages = [
      failure(Buffer.alloc(0)),
      failure(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])),
      failure(csv("phone_number\n0917\u0000")),
      failure(Buffer.from([0x70, 0x68, 0xff, 0xfe])),
      failure(csv("phone_number,phone_number\n09171234567,09171234567\n")),
      failure(csv("first_name\nAna\n")),
      failure(csv("phone_number,tier\n09171234567,gold\n")),
      failure(csv("phone_number\n" + "09171234567\n".repeat(4)), { ...MOCK_DEFAULTS, maxDataRows: 3 }),
      failure(Buffer.alloc(MOCK_DEFAULTS.maxUploadBytes + 1, 0x41)),
    ];
    for (const text of messages) {
      expect(localizeServerText(text, ko), text).toMatch(hangul);
    }
  });

  it("recognises the message checks where they are written", () => {
    const opts = { maxSegments: 2, supportsNonBmp: false, supportsUnicode: false };
    const messages = [
      validateMessageBody(" ", opts),
      validateMessageBody("Hi {{name}}", opts),
      validateMessageBody("안녕하세요", opts),
      validateMessageBody("Hello 😀", { ...opts, supportsUnicode: true }),
      validateMessageBody("x".repeat(400), opts),
    ].map((result) => (result.ok ? "" : result.message));
    for (const text of messages) {
      expect(localizeServerText(text, ko), text).toMatch(hangul);
    }
  });
});

/**
 * Where a sentence would reach a form: a result's message or error, a
 * validation message, a domain error a form passes on, or an upload failure.
 * Each must be an entry on the list rather than English written in place, or
 * it would show in English to Korean readers.
 */
describe("failure messages come from the list", () => {
  const SHAPES = [
    // An email's subject and body, and a notification's title, count too.
    /\b(?:message|error|description|subject|body|title):\s*(["'`])([A-Z][^"'`]*\s[^"'`]*)\1/g,
    /\.(?:min|max|email|uuid|url|positive|regex|length)\([^()"'`]*?(["'`])([A-Z][^"'`]*\s[^"'`]*)\1\)/g,
    /new (?:Group|Team|Quote|Quota|Submit|Approval|MobileVerification|TestSend|Config|Authorization)Error\(\s*(["'`])([^"'`]*)\1/g,
    /\bfail\(\s*"[A-Z_]+",\s*(["'`])([^"'`]*)\1/g,
  ];

  it("no action or domain module writes one in English of its own", () => {
    const files = globSync("src/server/{actions,auth,domain,security}/**/*.ts").filter(
      (file) => !file.endsWith(".test.ts"),
    );
    expect(files.length).toBeGreaterThan(30);
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const shape of SHAPES) {
        for (const match of source.matchAll(shape)) {
          const line = source.slice(0, match.index).split("\n").length;
          offenders.push(`${file.split("\\").join("/")}:${line}  ${match[2]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
