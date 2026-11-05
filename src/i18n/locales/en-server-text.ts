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

  // In-app notifications, stored in English when they are written. The server
  // builds them from these entries, so the wording cannot drift.
  businessApproved: "Your business was approved",
  accountStatusNow: (status: string) => `Your account status is now ${status}`,
  noFurtherDetail: "No further detail was given.",

  // Platform settings editor, also built from these entries.
  mustBeAtLeast: (n: string) => `Must be at least ${n}.`,
  mustBeAtMost: (n: string) => `Must be at most ${n}.`,
  valueNotValid: "That value is not valid.",
  settingOrValueNotValid: "That setting or value is not valid.",
  settingNotEditable: "That setting is not editable.",
  settingNotValid: "That setting is not valid.",
  settingSaved: "Saved. It applies to the next send.",
  settingRestored: "Restored to the built-in default.",

  // Removing a template.
  templateGone: "That template no longer exists.",

  // What a form says once it has worked, also built from these entries.
  // Counts arrive as text, the way server-text.ts reads them back.
  templateSaved: "Template saved.",
  saved: "Saved.",
  groupCreated: (name: string) => `"${name}" created.`,
  groupDeleted: "Group deleted. The contacts in it were kept.",
  membersAdded: (added: string) => `${added} contact${added === "1" ? "" : "s"} added.`,
  membersAddedSomeSkipped: (added: string, skipped: string) =>
    `${added} added. ${skipped} ${skipped === "1" ? "was" : "were"} already in the group.`,
  membersRemoved: (removed: string) =>
    `${removed} removed from the group. ${removed === "1" ? "It is" : "They are"} still in your contacts.`,
  optOutsAdded: (added: string) =>
    `${added} number${added === "1" ? "" : "s"} added to your opt-out list.`,
  optOutsAddedSomeInvalid: (added: string, invalid: string) =>
    `${added} added. ${invalid} entr${invalid === "1" ? "y was" : "ies were"} not a valid Philippine mobile number.`,
  testSent: (mask: string, cost: string) =>
    `Test sent to ${mask}. It is charged like any other message (${cost}).`,
  mobileCodeSent: (mask: string) => `We sent a 6-digit code to ${mask}. It expires in 10 minutes.`,
  mobileVerified: (mask: string) => `${mask} is verified. You can now send test messages.`,
  mobileRemoved: "Your mobile number has been removed.",
  senderSubmitted: (value: string) =>
    `${value} submitted for review. You cannot send under it until it is approved.`,
  invitationSent: (email: string) =>
    `Invitation sent to ${email}. It expires in 7 days and can be used once.`,
  supportReference: (reference: string, email: string) =>
    `Your reference is ${reference}. We have emailed a copy to ${email}.`,
  emailVerified: "Your email address is verified.",
  inquiryReceived:
    "Thank you. Your request has been logged and someone will contact you about volumes, pricing and sender approval.",
  inquiryThanks: "Thank you. We will be in touch.",

  // The admin console's. A status is lower-cased, so the English reads the
  // same whether it is given the action's words or the status's label.
  policySaved: (rules: string) => `Saved. ${rules} rules are now in force.`,
  limitsUpdated: "Limits updated.",
  freezeLifted: "Sending freeze lifted. The recorded debt is unchanged.",
  inquiryMoved: (status: string) => `Inquiry moved to ${status.toLowerCase()}. No SMS was sent.`,
  senderDecided: (status: string) => `Sender ${status.toLowerCase()}.`,
  platformBlocked: (added: string) => `${added} blocked platform-wide.`,
  platformBlockedSomeInvalid: (added: string, invalid: string) =>
    `${added} blocked platform-wide, ${invalid} not valid.`,
  mfaOn: "Two-factor authentication is on. Save these recovery codes now — they are shown once.",
  mfaVerified: "Verified.",
  recoveryCodeAccepted: (remaining: string) =>
    `Recovery code accepted. ${remaining} remaining — re-enrol soon.`,
};
