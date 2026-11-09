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
  // The opt-out list's reason when the person adding a number gives none.
  requestedToStop: "Requested to stop",
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

  // Successes no form shows today: the page states the outcome itself, or the
  // row simply leaves the list. Listed so that a form which starts showing one
  // needs no new translation.
  decisionRecorded: (status: string) => `Recorded: ${status.toLowerCase()}.`,
  approvedScheduled: "Approved. It will send at the scheduled time.",
  approvedQueued: "Approved. It has been queued for sending.",
  rejectedCreditReturned: "Rejected. Nothing was sent and the reserved credit has been returned.",
  senderApprovedDemo: (value: string) => `${value} approved (demo mode only).`,
  demoCreditAdded: "Demo credit added. No real payment was taken.",
  paymentAlreadySettled: "This payment was already settled.",
  invitationRevoked: "Invitation revoked.",
  roleUpdated: "Role updated.",
  memberRemoved: "Member removed.",
  templateRemoved: "Template removed.",

  // What a form says when it has not worked. The actions, the domain errors
  // they pass on and the validation schemas all build their messages from
  // these entries. A role or status arrives as the server names it (a code,
  // or its words in lower case) and is shown by its label.
  signInToContinue: "Sign in to continue.",
  roleCannot: (role: string) => `Your role (${role}) cannot perform this action.`,
  organizationCannot: (status: string) =>
    `This organization is ${status.toLowerCase()} and cannot perform this action.`,
  tooMany: (subject: string, minutes: string) =>
    `Too many ${subject}. Try again in about ${minutes} minute${minutes === "1" ? "" : "s"}.`,
  // What each rate limit counts, named inside tooMany. Matched on its own.
  limitSubjects: {
    login: "sign-in attempts",
    mfa: "two-factor attempts",
    signup: "registrations",
    upload: "file uploads",
    preview: "previews",
    quote: "price checks",
    testSend: "test sends",
    dispatch: "campaign submissions",
    export: "exports",
    inquiry: "inquiries",
  },

  // Signing in and signing up.
  enterValidEmail: "Enter a valid email address.",
  enterPassword: "Enter your password.",
  loginMismatch: "That email address and password do not match.",
  enterYourName: "Enter your name.",
  enterValidWorkEmail: "Enter a valid work email address.",
  passwordTooShort: "Use at least 12 characters.",
  passwordTooLong: "That password is too long.",
  enterRegisteredName: "Enter your registered business name.",
  enterRegistrationId: "Enter your SEC or DTI registration number.",
  enterBusinessAddress: "Enter your business address.",
  enterIndustry: "Enter your industry.",
  describeIntendedUsage: "Describe what you intend to send, in a sentence or two.",
  accountExists: "An account already exists for that email address. Sign in instead.",
  verificationLinkExpired:
    "That verification link has expired or has already been used. Request a new one.",

  // Contact groups.
  giveGroupName: "Give the group a name.",
  notValid: "That was not valid.",
  changeWasNotValid: "That change was not valid.",
  groupNotValid: "That group is not valid.",
  selectionNotValid: "That selection was not valid.",
  contactGone: "That contact no longer exists.",
  groupGone: "That group no longer exists.",
  groupEmpty: (name: string) => `"${name}" has no contacts in it yet.`,
  groupNameTaken: (name: string) => `You already have a group called "${name}".`,

  // Contacts, opt-outs and uploading a contact list.
  chooseCsv: "Choose a CSV file to upload.",
  uploadTooLarge: (mib: string) => `That file is larger than the ${mib} MiB limit.`,
  importNotValid: "That import is not valid.",
  enterMobileNumbers: "Enter at least one mobile number.",
  fileEmpty: "The file is empty.",
  fileTooLarge: (mib: string) => `The file is larger than the ${mib} MiB limit.`,
  spreadsheetNotCsv:
    "This is a spreadsheet file, not a CSV. Export it as CSV (UTF-8) and upload again.",
  nulBytes: "The file contains NUL bytes and is not valid text.",
  notUtf8: "The file is not valid UTF-8. Re-export it as CSV UTF-8 and upload again.",
  repeatedColumn: (columns: string) => `The header row repeats a column: ${columns}.`,
  brokenQuoting:
    "The file has an unclosed quoted field, so the rows cannot be read reliably.",
  noHeaderRow: "The file has no header row.",
  missingColumn: (columns: string) => `The file needs a ${columns} column.`,
  unknownColumns: (columns: string) =>
    `This file has columns we do not use: ${columns}. Confirm that they should be ignored.`,
  tooManyRows: (rows: string, limit: string) =>
    `The file has ${rows} data rows; the limit is ${limit}.`,
  // What the upload preview says each column of the file is used for.
  columnPhone: "Mobile number",
  columnFirstName: "First name",
  columnLastName: "Last name",
  columnConsentSource: "How they agreed to hear from you",
  columnConsentDate: "When they agreed",
  columnCustom: (n: string) => `Custom field ${n}`,
  columnIgnored: "Ignored",

  // Pricing and sending a campaign.
  chooseSender: "Choose a sender identity.",
  enterMessage: "Enter a message.",
  addRecipient: "Add at least one recipient.",
  requestNotValid: "That request was not valid.",
  confirmationNotValid: "That confirmation was not valid.",
  campaignNotFound: "That campaign was not found.",
  promotionalNeedsInquiry:
    "Promotional messages are handled as an inquiry, not self-service. Request a bulk quote instead.",
  senderNotApproved: "That sender identity is not approved for this organization.",
  pickFutureTime: "Pick a time in the future.",
  scheduleTooFar: (days: string) => `Scheduling is limited to ${days} days ahead.`,
  overSelfServiceLimit: (count: string, limit: string) =>
    `This send has ${count} unique destinations, above the self-service limit of ${limit}. Request a bulk quote for a list this size.`,
  noEligibleRecipients:
    "No eligible recipients remain after validation and opt-outs, so there is nothing to send.",
  quoteNotFound: "That quote could not be found.",
  quoteOtherUser: "That quote was issued to a different user.",
  quoteUsed: "That quote has already been used for a campaign.",
  quoteExpired: "This quote has expired. Review the send again to get current pricing.",
  quoteRecipientsChanged: "This quote's recipient list does not match.",
  quoteMessageChanged: "This quote's message does not match.",
  dailyQuota: (count: string, remaining: string, limit: string) =>
    `This send needs ${count} destinations but only ${remaining} remain in today's limit (${limit}).`,
  monthlyQuota: (count: string, remaining: string, limit: string) =>
    `This send needs ${count} destinations but only ${remaining} remain in this month's limit (${limit}).`,
  noVariables:
    "Personalization variables are not available yet, so {{name}} would be sent literally. Remove the variable and write the message out in full.",
  gsmOnly: "This sender only supports the basic GSM character set.",
  ucs2Strict:
    "This provider supports strict UCS-2 only, which cannot carry emoji outside the basic multilingual plane. Remove them.",
  tooManySegments: (segments: string, limit: string) =>
    `This message is ${segments} segments; the limit is ${limit}.`,
  // A message the content checks refuse: their summary ("Refused: …."), then this.
  refusedEditMessage: (summary: string) => `${summary} Edit the message and try again.`,
  requestKeyReused: "That request key has already been used for a different send.",
  requestInProgress: "That request is already being processed.",
  organizationCannotSend: "This organization is not active and cannot send.",
  senderNoLongerApproved: "That sender identity is no longer approved. Review the send again.",
  allOptedOut:
    "Every recipient on this quote has since opted out, so there is nothing to send.",
  creditShort: "Your available credit does not cover this send. Top up and review again.",
  sendingFrozen: "Sending is frozen on this account. Contact support.",
  alreadySubmitted: "That request has already been submitted.",

  // Approving or rejecting a held campaign.
  campaignNotValid: "That campaign is not valid.",
  giveRejectionReason: "Give a reason so the sender knows what to change.",
  rejectionNotValid: "That rejection is not valid.",
  notAwaitingApproval: (status: string) =>
    `This campaign is ${status.toLowerCase()}, not awaiting approval.`,
  ownCampaign: "You created this campaign, so you cannot approve it. Ask another approver.",

  // The team and invitations.
  invitationNotValid: "That invitation is not valid.",
  changeIsNotValid: "That change is not valid.",
  memberNotFound: "That member was not found.",
  inviteLinkNotValid: "That invitation link is not valid.",
  alreadyOnTeam: "That person is already on the team.",
  inviteAlreadyOpen: "An invitation is already open for that address.",
  inviteUsed: "That invitation has already been used.",
  inviteExpiredAskAgain: "That invitation has expired. Ask for a new one.",
  inviteExpired: "That invitation has expired.",
  invitePassword: "Choose a password of at least 12 characters.",
  lastOwnerRole: "This is the last owner. Promote someone else before changing this role.",
  lastOwnerRemove: "This is the last owner. An organization must keep at least one.",

  // Verifying a mobile number, and test sends.
  enterYourMobile: "Enter your mobile number.",
  enterSixDigitCode: "Enter the 6-digit code.",
  enterPhilippineMobile: "Enter a Philippine mobile number, for example 0917 123 4567.",
  numberVerifiedElsewhere: "That number is already verified on another account.",
  noVerificationInProgress:
    "There is no verification in progress. Start again to get a new code.",
  codeExpired: "That code has expired. Send a new one.",
  codeMismatchAttemptsLeft: (left: string) =>
    `That code did not match. ${left} attempt${left === "1" ? "" : "s"} left.`,
  tooManyIncorrectCodes: "Too many incorrect codes. Send a new one.",
  notAMember: "That person is not a member of this organization.",
  verifyMobileFirst:
    "Verify your mobile number before sending a test, so tests can only reach a phone you own.",
  memberNotVerified: "That member has not verified a mobile number yet.",

  // Sender identities.
  senderIdTooShort: "A sender ID is at least 3 characters.",
  senderIdTooLong: "Alphanumeric sender IDs are at most 11 characters.",
  senderIdCharacters: "Use letters, numbers and single spaces only.",
  explainSenderId: "Explain how this name relates to your registered business.",
  applicationNotValid: "That application is not valid.",
  alreadyApplied: (value: string) => `You have already applied for ${value}.`,
  notInThisMode: "Not available in this mode.",
  senderNotAwaiting: "That sender is not awaiting review.",

  // Templates, support requests and the bulk quote form.
  giveTemplateName: "Give the template a name.",
  writeTheMessage: "Write the message.",
  templateNotValid: "That template is not valid.",
  sayBriefly: "Say briefly what this is about.",
  tellUsWhatHappened: "Tell us what happened, in a sentence or two.",
  checkTheForm: "Check the form.",
  enterBusinessName: "Enter your business name.",
  enterContactName: "Enter a contact name.",
  enterVolume: "Enter roughly how many messages you expect to send.",
  howOften: "How often would you send?",
  describeAudience: "Describe who receives these messages.",
  pasteExample: "Paste an example message.",
  consentHow: "Tell us how these people agreed to hear from you.",
  checkHighlighted: "Check the highlighted fields.",

  // Demo payments.
  demoPaymentsUnavailable: "Demo payments are not available in this mode.",
  paymentNotFound: "That payment could not be found.",
  paymentAlready: (status: string) => `This payment is already ${status.toLowerCase()}.`,
  gatewayNotAccepted: (outcome: string) => `The gateway event was not accepted (${outcome}).`,

  // The admin console.
  enterAppCode: "Enter the 6-digit code from your app.",
  codeMismatchCheckClock:
    "That code did not match. Check your device's clock and try the current code.",
  enterYourCode: "Enter your code.",
  notEnrolled: "This account is not enrolled yet.",
  codeMismatch: "That code did not match.",
  decisionNotValid: "That decision was not valid.",
  giveDecisionReason: "Give a reason so the decision can be reviewed later.",
  senderIdentityGone: "That sender identity no longer exists.",
  updateNotValid: "That update was not valid.",
  giveBlockReason: "Give a reason for the block.",
  enterNumber: "Enter at least one number.",
  limitsNotValid: "Those limits were not valid.",
  dailyOverMonthly: "The daily limit cannot exceed the monthly limit.",
  accountNotFound: "That account was not found.",
  notJson: "That is not valid JSON.",
  policyNotValid: "That policy is not valid.",
  // The content policy editor names the field a problem is in ("rules.2.flags").
  policyIssue: (field: string, problem: string) => `${field}: ${problem}`,
  patternNested:
    "That pattern nests one repetition inside another, which can take a very long time to run. Simplify it.",
  onlyFlags: "Only the i, m, s and u flags are allowed.",
};
