/**
 * Content and risk checks (MSG-05).
 *
 * Two outcomes only:
 *   - BLOCK: the message is refused outright.
 *   - REVIEW: the message is accepted but held for an approver.
 *
 * Nothing here silently edits a customer's message. A check either lets it
 * through, holds it, or refuses it — rewriting someone's SMS on their behalf
 * would change what their recipients read without telling them.
 *
 * The rules are data, not code, so they can move into admin configuration
 * without touching this file.
 */
import { z } from "zod";

export type CheckSeverity = "BLOCK" | "REVIEW";

export type ContentRule = {
  id: string;
  severity: CheckSeverity;
  description: string;
  /** Matched against the message body. */
  pattern: RegExp;
};

export type UrlPolicy = {
  /** Domains that may appear in a message without holding it. */
  allowedDomains: string[];
  /** Domains that always block, regardless of anything else. */
  blockedDomains: string[];
  /** Hold any message containing a link to a domain not on the allow list. */
  reviewUnknownDomains: boolean;
  /** URL shorteners hide their destination, so they are always held. */
  reviewShorteners: boolean;
};

export type ContentPolicy = {
  rules: ContentRule[];
  url: UrlPolicy;
  /** Hold a message whose recipient count is at or above this. */
  reviewRecipientThreshold: number;
};

/** Well-known shorteners. A shortened link cannot be judged on its face. */
const SHORTENERS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "buff.ly",
  "is.gd",
  "cutt.ly",
  "rb.gy",
  "shorturl.at",
];

/**
 * Default policy.
 *
 * These are starting values, not approved compliance rules. The wording that
 * actually constitutes a prohibited message in the Philippines is a DPO and
 * carrier decision — see docs/LIVE-READINESS.md.
 */
export const DEFAULT_CONTENT_POLICY: ContentPolicy = {
  rules: [
    {
      id: "credential-request",
      severity: "BLOCK",
      description: "Asks for a password, PIN, OTP or card details",
      pattern:
        /\b(password|passwd|pin\s*code|otp|one[-\s]?time\s*(pin|password|code)|cvv|card\s*number|account\s*number)\b/i,
    },
    {
      id: "credential-phishing-verb",
      severity: "BLOCK",
      description: "Asks the recipient to verify or confirm an account",
      pattern: /\b(verify|confirm|validate|update)\b[^.]{0,40}\b(account|identity|details)\b/i,
    },
    {
      id: "lottery-prize",
      severity: "BLOCK",
      description: "Prize, lottery or windfall claim",
      pattern: /\b(congratulations|you\s*(have\s*)?won|winner|jackpot|lotto|raffle\s*prize)\b/i,
    },
    {
      id: "loan-offer",
      severity: "REVIEW",
      description: "Lending or credit offer",
      pattern: /\b(loan|lending|cash\s*advance|sangla|pautang|interest\s*rate)\b/i,
    },
    {
      id: "investment",
      severity: "REVIEW",
      description: "Investment or returns claim",
      pattern: /\b(invest|investment|returns?\s*guaranteed|double\s*your\s*money|crypto)\b/i,
    },
    {
      id: "urgency",
      severity: "REVIEW",
      description: "High-pressure urgency language",
      pattern:
        /\b(act\s*now|urgent(ly)?|immediately|expires?\s*(today|in\s*\d+)|last\s*chance|final\s*notice)\b/i,
    },
    {
      id: "gambling",
      severity: "REVIEW",
      description: "Gambling or betting",
      pattern: /\b(casino|betting|sabong|online\s*game\s*of\s*chance|slots?)\b/i,
    },
  ],
  url: {
    allowedDomains: [],
    blockedDomains: [],
    reviewUnknownDomains: true,
    reviewShorteners: true,
  },
  reviewRecipientThreshold: 50,
};

export type CheckFinding = {
  ruleId: string;
  severity: CheckSeverity;
  description: string;
  /** What matched, for the operator. Never the whole message. */
  evidence: string;
};

export type ContentCheckResult = {
  /** Refused outright. */
  blocked: boolean;
  /** Accepted but held for an approver. */
  requiresReview: boolean;
  findings: CheckFinding[];
  /** One line summarising why, for the customer and the approver. */
  summary: string;
};

/** Extracts URLs, including bare domains people type without a scheme. */
export function extractUrls(body: string): string[] {
  const matches =
    body.match(/\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/gi) ?? [];
  return matches.filter((m) => /\.[a-z]{2,}/i.test(m));
}

export function domainOf(url: string): string {
  const withScheme = /^https?:\/\//i.test(url) ? url : `http://${url}`;
  try {
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Truncated match text, so a finding never reproduces the whole message. */
function evidenceFrom(match: string): string {
  const cleaned = match.trim();
  return cleaned.length > 60 ? `${cleaned.slice(0, 60)}…` : cleaned;
}

export function checkContent(
  body: string,
  options: { recipientCount?: number; policy?: ContentPolicy } = {},
): ContentCheckResult {
  const policy = options.policy ?? DEFAULT_CONTENT_POLICY;
  const findings: CheckFinding[] = [];

  for (const rule of policy.rules) {
    const match = body.match(rule.pattern);
    if (match) {
      findings.push({
        ruleId: rule.id,
        severity: rule.severity,
        description: rule.description,
        evidence: evidenceFrom(match[0]),
      });
    }
  }

  /* --- Links ------------------------------------------------------------- */

  for (const url of extractUrls(body)) {
    const domain = domainOf(url);
    if (!domain) continue;

    const matchesDomain = (list: string[]) =>
      list.some((d) => domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`));

    if (matchesDomain(policy.url.blockedDomains)) {
      findings.push({
        ruleId: "url-blocked",
        severity: "BLOCK",
        description: `Link to a blocked domain (${domain})`,
        evidence: domain,
      });
      continue;
    }
    if (policy.url.reviewShorteners && SHORTENERS.includes(domain)) {
      findings.push({
        ruleId: "url-shortener",
        severity: "REVIEW",
        description: `Shortened link hides its destination (${domain})`,
        evidence: domain,
      });
      continue;
    }
    if (matchesDomain(policy.url.allowedDomains)) continue;
    if (policy.url.reviewUnknownDomains) {
      findings.push({
        ruleId: "url-unknown",
        severity: "REVIEW",
        description: `Link to a domain that is not on the allow list (${domain})`,
        evidence: domain,
      });
    }
  }

  /* --- Volume ------------------------------------------------------------ */

  const recipients = options.recipientCount ?? 0;
  if (recipients >= policy.reviewRecipientThreshold) {
    findings.push({
      ruleId: "volume",
      severity: "REVIEW",
      description: `${recipients} recipients is at or above the review threshold of ${policy.reviewRecipientThreshold}`,
      evidence: String(recipients),
    });
  }

  const blocked = findings.some((f) => f.severity === "BLOCK");
  const requiresReview = !blocked && findings.some((f) => f.severity === "REVIEW");

  return {
    blocked,
    requiresReview,
    findings,
    summary: summarise(findings, blocked),
  };
}

function summarise(findings: CheckFinding[], blocked: boolean): string {
  if (findings.length === 0) return "No content checks matched.";

  const relevant = blocked
    ? findings.filter((f) => f.severity === "BLOCK")
    : findings.filter((f) => f.severity === "REVIEW");

  const reasons = relevant.map((f) => f.description).join("; ");
  return blocked
    ? `Refused: ${reasons}.`
    : `Held for approval: ${reasons}.`;
}

/* -------------------------------------------------------------------------- */
/* Storing a policy                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A policy as it is stored and edited.
 *
 * `RegExp` does not survive JSON, so a stored rule carries the pattern's source
 * text and flags and is compiled on read.
 */
export const storedRuleSchema = z.object({
  id: z.string().min(1).max(60),
  severity: z.enum(["BLOCK", "REVIEW"]),
  description: z.string().min(1).max(200),
  // Capped because a stored pattern is compiled and run against every message.
  pattern: z.string().min(1).max(500).refine(isSafePattern, {
    message:
      "That pattern nests one repetition inside another, which can take a very long time to run. Simplify it.",
  }),
  flags: z
    .string()
    .max(4)
    .regex(/^[imsu]*$/, "Only the i, m, s and u flags are allowed.")
    .default("i"),
});

export const contentPolicySchema = z.object({
  rules: z.array(storedRuleSchema).max(100),
  url: z.object({
    allowedDomains: z.array(z.string().min(1).max(253)).max(200),
    blockedDomains: z.array(z.string().min(1).max(253)).max(200),
    reviewUnknownDomains: z.boolean(),
    reviewShorteners: z.boolean(),
  }),
  reviewRecipientThreshold: z.number().int().positive().max(1_000_000),
});

export type StoredContentPolicy = z.infer<typeof contentPolicySchema>;

/**
 * Rejects patterns with a quantifier applied to an already-repeating group,
 * such as `(a+)+` or `(\d*)*`.
 *
 * This is the shape that makes a regular expression take exponential time on a
 * non-matching input, which would let one saved rule stall every send. It is a
 * heuristic, not a proof — platform admins are trusted staff, and this catches
 * the accident rather than the attack.
 */
export function isSafePattern(source: string): boolean {
  try {
    new RegExp(source);
  } catch {
    return false;
  }
  return !/\([^()]*[+*]\s*\)[+*{]/.test(source);
}

/** Turns a stored policy into a runnable one. */
export function hydratePolicy(stored: StoredContentPolicy): ContentPolicy {
  return {
    rules: stored.rules.map((rule) => ({
      id: rule.id,
      severity: rule.severity,
      description: rule.description,
      pattern: new RegExp(rule.pattern, rule.flags),
    })),
    url: stored.url,
    reviewRecipientThreshold: stored.reviewRecipientThreshold,
  };
}

/** Turns a runnable policy back into its stored form, for the editor. */
export function dehydratePolicy(policy: ContentPolicy): StoredContentPolicy {
  return {
    rules: policy.rules.map((rule) => ({
      id: rule.id,
      severity: rule.severity,
      description: rule.description,
      pattern: rule.pattern.source,
      flags: rule.pattern.flags.replace(/[^imsu]/g, ""),
    })),
    url: policy.url,
    reviewRecipientThreshold: policy.reviewRecipientThreshold,
  };
}
