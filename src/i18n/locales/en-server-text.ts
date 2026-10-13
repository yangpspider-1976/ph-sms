/**
 * Messages the server writes in English: health checks, go-live gaps, and
 * notes already stored on ledger entries, import rows and held campaigns.
 * i18n/server-text.ts matches them by their English text, so a plain string
 * here must stay word for word what the server produces.
 *
 * This is the English dictionary's `serverText` section, kept in a module of
 * its own because the browser needs it on its own. Client components that
 * translate a server message have to recognise the English wording whatever
 * language is on screen, and importing it from `en.ts` sent the entire English
 * dictionary to Korean readers along with it. `en.ts` includes it unchanged,
 * and `ko.ts` still translates it under `serverText` like any other section.
 */
export const enServerText = {
  none: "None.",
  connected: "Connected.",
  dbUnreachable: "The database cannot be reached.",
  reachable: "reachable",
  unreachable: "unreachable",
  inProgress: "in progress",
  noOverdueJobs: "No overdue jobs.",
  overdueJobs: (n: string, seconds: string) =>
    `${n} job(s) due more than ${seconds}s ago and unclaimed. Is the worker running?`,
  unresolvedSubmissions: (n: string) =>
    `${n} submission(s) unresolved; their cost stays held pending reconciliation.`,
  quarantinedEvents: (n: string) => `${n} delivery event(s) could not be matched to a message.`,
  pausedCampaigns: (n: string) =>
    `${n} campaign(s) paused for review. They do not resume on their own.`,
  frozenAccounts: (n: string) => `${n} account(s) cannot send.`,
  rejectedPayments: (n: string) =>
    `${n} payment event(s) rejected. Check merchant configuration, or investigate.`,
  failedJobs: (n: string) => `${n} job(s) exhausted their retries.`,
  keyRotation:
    "A previous key is still configured. Run `npm run rotate-keys` until nothing remains, then remove it.",
  gapsRemaining: (n: string) => `${n} input(s) still required before live.`,

  envNotSet: (name: string) => `${name} is not set`,
  gapPartnerUrl: "Partner SMS base URL is not configured",
  gapPartnerCredentials: "Partner SMS credentials are not configured",
  gapPartnerSecret: "Partner delivery-event authentication secret is not configured",
  gapPaymentProvider: "No real payment provider is configured (PAYMENT_PROVIDER=MOCK)",
  gapMerchantId: "PAYMENT_MERCHANT_ID is still the demo placeholder",
  gapMailSink: "Email delivery is the local sink, not a real transport",
  gapSmtpHost: "MAIL_TRANSPORT is SMTP but SMTP_HOST is not set",
  gapBaseUrl: "APP_BASE_URL still points at localhost; links in email would not work",
  gapPricing: "Live unit pricing has not been approved (still using the demo price)",
  gapUnitPrice: "Unit price is still the illustrative demo value of PHP 1.00 per segment",
  gapDemoFunding: "Demo funding is still enabled",

  demoFunding: "Demo funding — not a real payment",
  demoFundingOnApproval: "Demo funding on approval — not a real payment",
  campaignRejected: "Campaign rejected at approval",
  acceptedByProvider: "Accepted by provider",
  resolvedByReconciliation: "Resolved by reconciliation",
  campaignFinished: "Campaign finished",
  campaignCancelled: "Campaign cancelled before submission",
  topUp: (reference: string) => `Top-up ${reference}`,
  approvedInDemo: "Approved in demo mode",

  optedOut: "This number has opted out",
  noPhone: "No phone number in this row",
  sameAsRow: (row: string) => `Same number as row ${row}`,
  blank: "Blank value",
  containsLetters: "Contains letters",
  invalidCharacters: "Contains characters that are not digits",
  multiplePlus: "More than one + sign",
  foreignNumber: "Not a Philippine number",
  notMobile: "Not a Philippine mobile number",
  tooShort: "Too few digits",
  tooLong: "Too many digits",
  malformed: "Not a valid number format",

  noChecksMatched: "No content checks matched.",
  refused: (reasons: string) => `Refused: ${reasons}.`,
  held: (reasons: string) => `Held for approval: ${reasons}.`,
  ruleCredentialRequest: "Asks for a password, PIN, OTP or card details",
  ruleVerifyAccount: "Asks the recipient to verify or confirm an account",
  rulePrize: "Prize, lottery or windfall claim",
  ruleLending: "Lending or credit offer",
  ruleInvestment: "Investment or returns claim",
  ruleUrgency: "High-pressure urgency language",
  ruleGambling: "Gambling or betting",
  blockedDomain: (domain: string) => `Link to a blocked domain (${domain})`,
  shortenedLink: (domain: string) => `Shortened link hides its destination (${domain})`,
  unlistedDomain: (domain: string) =>
    `Link to a domain that is not on the allow list (${domain})`,
  recipientThreshold: (recipients: string, threshold: string) =>
    `${recipients} recipients is at or above the review threshold of ${threshold}`,
  organizationIs: (status: string) => `Organization is ${status}`,
  senderIs: (status: string) => `Sender identity is ${status}`,
  missing: "missing",
};
