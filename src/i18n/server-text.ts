import { en } from "./locales/en";
import type { Dictionary } from "./dictionaries";

/**
 * Translates the fixed English messages the server writes.
 *
 * Health checks, go-live gaps, ledger notes, import reasons and the reason a
 * campaign was held are all composed in English by the domain layer, and many
 * are already stored in rows that were written before anyone chose a language.
 * Rewriting the stored rows would not help the next reader in the other
 * language, and the JSON health endpoint should keep saying what it says. So
 * the text is recognised where it is shown and rendered from the dictionary.
 *
 * Only messages the platform composed are recognised. Anything a person typed
 * (an opt-out reason, a reviewer's note) comes back exactly as it was written.
 */

type Text = Dictionary["serverText"];
type Pattern = [RegExp, (text: Text, match: RegExpMatchArray, t: Dictionary) => string];

/** Every fixed sentence, keyed by its English wording. */
const EXACT = new Map<string, keyof Text>(
  (Object.entries(en.serverText) as Array<[keyof Text, unknown]>)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => [value as string, key]),
);

/** A stored status inside a message: its label if there is one. */
function statusLabel(t: Dictionary, raw: string): string {
  if (raw === "missing") return t.serverText.missing;
  const labels = { ...t.status.org, ...t.status.sender } as Record<string, string>;
  return labels[raw] ?? raw;
}

const PATTERNS: Pattern[] = [
  [/^(\d+) job\(s\) due more than (\d+)s ago and unclaimed\. Is the worker running\?$/, (s, m) => s.overdueJobs(m[1]!, m[2]!)],
  [/^(\d+) submission\(s\) unresolved; their cost stays held pending reconciliation\.$/, (s, m) => s.unresolvedSubmissions(m[1]!)],
  [/^(\d+) delivery event\(s\) could not be matched to a message\.$/, (s, m) => s.quarantinedEvents(m[1]!)],
  [/^(\d+) campaign\(s\) paused for review\. They do not resume on their own\.$/, (s, m) => s.pausedCampaigns(m[1]!)],
  [/^(\d+) account\(s\) cannot send\.$/, (s, m) => s.frozenAccounts(m[1]!)],
  [/^(\d+) payment event\(s\) rejected\. Check merchant configuration, or investigate\.$/, (s, m) => s.rejectedPayments(m[1]!)],
  [/^(\d+) job\(s\) exhausted their retries\.$/, (s, m) => s.failedJobs(m[1]!)],
  [/^(\d+) input\(s\) still required before live\.$/, (s, m) => s.gapsRemaining(m[1]!)],
  [/^([A-Z][A-Z0-9_]+) is not set$/, (s, m) => s.envNotSet(m[1]!)],
  [/^Top-up (\S+)$/, (s, m) => s.topUp(m[1]!)],
  [/^Same number as row (\d+)$/, (s, m) => s.sameAsRow(m[1]!)],
  [/^Link to a blocked domain \((.+)\)$/, (s, m) => s.blockedDomain(m[1]!)],
  [/^Shortened link hides its destination \((.+)\)$/, (s, m) => s.shortenedLink(m[1]!)],
  [/^Link to a domain that is not on the allow list \((.+)\)$/, (s, m) => s.unlistedDomain(m[1]!)],
  [/^(\d+) recipients is at or above the review threshold of (\d+)$/, (s, m) => s.recipientThreshold(m[1]!, m[2]!)],
  [/^Organization is (\w+)$/, (s, m, t) => s.organizationIs(statusLabel(t, m[1]!))],
  [/^Sender identity is (\w+)$/, (s, m, t) => s.senderIs(statusLabel(t, m[1]!))],
  // A held or refused campaign lists its reasons, each one a message above.
  [/^Held for approval: (.+)\.$/, (s, m, t) => s.held(m[1]!.split("; ").map((r) => localizeServerText(r, t)).join("; "))],
  [/^Refused: (.+)\.$/, (s, m, t) => s.refused(m[1]!.split("; ").map((r) => localizeServerText(r, t)).join("; "))],
];

export function localizeServerText(text: string, t: Dictionary): string;
export function localizeServerText(text: string | null | undefined, t: Dictionary): string | null;
export function localizeServerText(text: string | null | undefined, t: Dictionary): string | null {
  if (text == null) return null;

  const key = EXACT.get(text);
  if (key) return t.serverText[key] as string;

  for (const [pattern, render] of PATTERNS) {
    const match = text.match(pattern);
    if (match) return render(t.serverText, match, t);
  }
  return text;
}
