import type { Locale } from "./config";
import type { Dictionary } from "./dictionaries";
import { formatDateTime } from "./format";

/**
 * The name a test send goes by: "Test send — " and the time it was sent, in
 * Manila like every other time on screen.
 */
export function testSendName(sentAt: Date, t: Dictionary, locale: Locale): string {
  return t.campaigns.testSendName(formatDateTime(sentAt, locale));
}

/**
 * The name a campaign is shown under.
 *
 * A test send is named by the system rather than by the sender, so its name is
 * written when it is read: in the reader's language, from the time the campaign
 * was created. Its stored name is only a record, and the ones stored before
 * 13 November 2026 gave the time in UTC, eight hours behind Manila.
 *
 * Every other campaign keeps the name it was given, in the sender's words.
 */
export function campaignName(
  campaign: { name: string; isTestSend: boolean; createdAt: Date },
  t: Dictionary,
  locale: Locale,
): string {
  return campaign.isTestSend ? testSendName(campaign.createdAt, t, locale) : campaign.name;
}
