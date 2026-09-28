import { describe, expect, it } from "vitest";
import {
  checkContent,
  domainOf,
  extractUrls,
  DEFAULT_CONTENT_POLICY,
  type ContentPolicy,
} from "./content-checks";

/**
 * MSG-05: content and risk checks, and the rule that a flagged job cannot
 * bypass review.
 */

const ORDINARY = "Your order is ready for pickup until 8pm today. Thank you!";

describe("ordinary messages", () => {
  it("passes a transactional message untouched", () => {
    const result = checkContent(ORDINARY, { recipientCount: 5 });
    expect(result.blocked).toBe(false);
    expect(result.requiresReview).toBe(false);
    expect(result.findings).toHaveLength(0);
  });

  it("never rewrites the message", () => {
    // The result carries findings, not a modified body: silently editing a
    // customer's SMS would change what recipients read.
    const result = checkContent(ORDINARY);
    expect(result).not.toHaveProperty("body");
    expect(result).not.toHaveProperty("sanitized");
  });
});

describe("blocking", () => {
  it("refuses a credential request", () => {
    for (const body of [
      "Please reply with your OTP to continue.",
      "Enter your PIN code to claim.",
      "We need your card number to proceed.",
    ]) {
      const result = checkContent(body);
      expect(result.blocked).toBe(true);
      expect(result.summary).toMatch(/^Refused:/);
    }
  });

  it("refuses account-verification phishing", () => {
    const result = checkContent("Verify your account now to avoid suspension.");
    expect(result.blocked).toBe(true);
  });

  it("refuses prize and lottery claims", () => {
    const result = checkContent("Congratulations! You won our raffle prize.");
    expect(result.blocked).toBe(true);
  });

  it("a blocked message is not merely held", () => {
    const result = checkContent("Send your OTP now, urgent!");
    expect(result.blocked).toBe(true);
    // Blocking wins over review; it is refused, not queued for an approver.
    expect(result.requiresReview).toBe(false);
  });
});

describe("holding for review", () => {
  it("holds lending and investment offers", () => {
    expect(checkContent("Low interest loan available today.").requiresReview).toBe(true);
    expect(checkContent("Guaranteed returns on your investment.").requiresReview).toBe(true);
  });

  it("holds high-pressure urgency", () => {
    const result = checkContent("Act now! This offer expires today.");
    expect(result.requiresReview).toBe(true);
    expect(result.summary).toMatch(/^Held for approval:/);
  });

  it("holds a send at or above the recipient threshold", () => {
    const below = checkContent(ORDINARY, { recipientCount: 49 });
    const at = checkContent(ORDINARY, { recipientCount: 50 });
    expect(below.requiresReview).toBe(false);
    expect(at.requiresReview).toBe(true);
    expect(at.findings.some((f) => f.ruleId === "volume")).toBe(true);
  });
});

describe("links", () => {
  it("finds URLs with and without a scheme", () => {
    expect(extractUrls("Visit https://example.com/offer now")).toContain(
      "https://example.com/offer",
    );
    expect(extractUrls("Go to shop.example.ph today")).toContain("shop.example.ph");
    expect(extractUrls("No links here at all")).toHaveLength(0);
  });

  it("reads the domain, ignoring scheme and www", () => {
    expect(domainOf("https://www.Example.COM/path")).toBe("example.com");
    expect(domainOf("shop.example.ph")).toBe("shop.example.ph");
  });

  it("holds a shortened link because its destination is hidden", () => {
    const result = checkContent("Claim here: bit.ly/abc123");
    expect(result.requiresReview).toBe(true);
    expect(result.findings.some((f) => f.ruleId === "url-shortener")).toBe(true);
  });

  it("holds a link to a domain that is not allow-listed", () => {
    const result = checkContent("See https://unknown-site.example/x");
    expect(result.findings.some((f) => f.ruleId === "url-unknown")).toBe(true);
  });

  it("lets an allow-listed domain through", () => {
    const policy: ContentPolicy = {
      ...DEFAULT_CONTENT_POLICY,
      url: { ...DEFAULT_CONTENT_POLICY.url, allowedDomains: ["example.ph"] },
    };
    const result = checkContent("Track it at https://orders.example.ph/123", { policy });
    expect(result.requiresReview).toBe(false);
    expect(result.findings).toHaveLength(0);
  });

  it("blocks a blocked domain outright", () => {
    const policy: ContentPolicy = {
      ...DEFAULT_CONTENT_POLICY,
      url: { ...DEFAULT_CONTENT_POLICY.url, blockedDomains: ["bad.example"] },
    };
    const result = checkContent("Go to https://bad.example/x", { policy });
    expect(result.blocked).toBe(true);
  });
});

describe("findings", () => {
  it("reports the rule, severity and a short evidence snippet", () => {
    const result = checkContent("Act now, this loan expires today!");
    expect(result.findings.length).toBeGreaterThan(0);
    for (const finding of result.findings) {
      expect(finding.ruleId).toBeTruthy();
      expect(["BLOCK", "REVIEW"]).toContain(finding.severity);
      expect(finding.description).toBeTruthy();
      // Evidence is a snippet, never the whole message.
      expect(finding.evidence.length).toBeLessThanOrEqual(61);
    }
  });

  it("the policy is data, so rules can move to admin configuration", () => {
    const policy: ContentPolicy = {
      ...DEFAULT_CONTENT_POLICY,
      rules: [
        {
          id: "custom",
          severity: "REVIEW",
          description: "Mentions a competitor",
          pattern: /competitor/i,
        },
      ],
    };
    const result = checkContent("Better than our competitor.", { policy });
    expect(result.requiresReview).toBe(true);
    expect(result.findings[0]!.ruleId).toBe("custom");
  });
});
