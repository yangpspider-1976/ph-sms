# Philippines SMS Website — Review Findings and Vibe Coding Prompt

Review date: 2026-09-14  
Source: PH_SMS_Platform_Developer_Work_Request_EN.docx, v1.0, 2026-09-08, 10 pages  
Deliverable: A development prompt that supplements and restructures the original requirements. It is not a revised version that overwrites the existing Word file.

## 1. Review conclusion

The business direction and the core features are sound, but the original document is a draft written for quotation discussions. Feeding it directly into a coding tool risks producing screens only, or leaving room for duplicate sending, duplicate top-ups and incorrect status displays. The changes below are design proposals intended to make the implementation criteria explicit; they do not assert new confirmed partner specifications or new legal obligations.

| Location in original | Issue or open item | Change reflected in this prompt |
|---|---|---|
| p.2, p.4–5 | Promotion is an inquiry path, but it is unclear whether sending happens directly after customer approval | Promotions are inquiry-only in the MVP. Admin approval alone never triggers automatic sending |
| p.2–5 | Roles, personalization, groups and approval flows have a wide scope | Four required roles and simple templates first. Advanced features are explicitly moved to later phases |
| p.3 | Format validation can be confused with proof of a genuinely valid mobile number | State that only the format is validated. Actual subscription, ownership and reachability are not guaranteed |
| p.3 | The CSV rules mix in prohibitions on executables and macros | Replaced with real CSV parsing, encoding/size/row/field limits and formula-safe export |
| p.4 | Campaign status and per-recipient status are mixed into a single table | Separate execution status, individual submission status and aggregated results |
| p.4, p.6, p.9 | Reads as if idempotency alone always prevents duplicate external sending | Timeouts are treated as UNKNOWN. No blind resending without a partner guarantee |
| p.4–5 | Message segmentation, balance reservation and failure refunds are abstract | Server-side calculation, fixed unit-price snapshot, atomic reservation and contract-based settlement made explicit |
| p.5 | Only payment abstraction is present; trust conditions for top-ups are missing | Credit only on verified payment events, duplicate event prevention, and no trust in the browser success screen |
| p.4–5 | Handling of account suspension, blocking, opt-out and price changes after scheduling is insufficient | Re-validation immediately before sending, approved cost preserved, and added stop/hold and reservation-release conditions |
| p.5 | The meaning of per-organization opt-out versus global blocking is unclear | Separate per-customer opt-out from platform-wide safety blocking. No information exposure between customers |
| p.5, p.10 | The opt-out mechanism depends on partner features | Show only channels that actually exist. Do not instruct recipients to reply STOP to a Sender ID that cannot receive replies |
| p.6–10 | Development is blocked while the API, PG and pricing are undecided | Separate the scope that can be completed with mock APIs from the conditions required for live connection |

### How to use this document

Copy everything from `BEGIN MASTER PROMPT` to `END MASTER PROMPT` below, or attach this file to a coding tool and instruct it to implement the work according to the Master Prompt.

Do not connect real SMS sending or paid payments at the start. Even in the mock environment, make data storage, authorization, scheduled jobs, the billing ledger and failure scenarios genuinely work. Connect the adapters afterwards, once partner specifications are available.

---

## 2. BEGIN MASTER PROMPT

You are the senior full-stack engineer implementing a Philippines-only B2B SMS website. Build the working application, not just a proposal or visual prototype. Write code, identifiers, customer UI, progress explanations and handover notes in English.

This specification is authoritative for this implementation. Inspect the existing repository and its instructions first. Preserve compatible existing functionality. Record implementation decisions in DECISIONS.md and progress in IMPLEMENTATION_STATUS.md. Continue through the phases below without repeatedly asking for routine choices. If external credentials or contracts are missing, finish all mock-mode work and report only the specific remaining integration dependencies. Do not invent provider APIs, prices, certifications, clients, or delivery guarantees.

### A. Product and scope

Working product name: FirstG SMS, configurable and not a claim of finalized branding. Market: Philippine mobile destinations only. Verified businesses can enter numbers, paste numbers, upload CSV, compose transactional/informational messages, review costs, send immediately or schedule, and view results. High-volume and promotional requests go to a separate inquiry workflow.

MVP includes:

- Public Home, Features/How It Works, Pricing, Bulk Inquiry, Help/Contact, Login/Signup, and legal draft pages.
- Verified email authentication, password reset, business verification, organization membership and authorization.
- Dashboard, send wizard, campaign detail/list, scheduled filter, simple contacts, suppression, plain-text templates, wallet/billing history, sender identities, organization/team settings.
- Admin customer approval/suspension, sender approval records, inquiries, configuration, payment/ledger inspection, audit and incident views.
- Durable background jobs, mock SMS/payment adapters, dispatch and delivery handling, safe exports and retention jobs.

Defer personalization, contact groups/tags, customer approval chains, recurring campaigns, automated top-ups, promotional self-service, contract campaign execution, customer public API, OTP-specific services, reseller mode, CRM integrations, and sophisticated analytics. Do not render nonfunctional buttons for deferred features. Keep optional CSV name/custom fields for future use but do not interpolate them in MVP messages; reject template variable syntax with a clear explanation.

Inquiry status changes are CRM records only. CONTRACTED never submits SMS. Configuring a higher self-service threshold never enables promotional self-service.

### B. Technical approach and execution environments

Prefer the repository's working stack. For a new ordinary project use TypeScript, a supported React full-stack framework, PostgreSQL with migrations, a maintained database access library, and a separate worker process backed by durable PostgreSQL jobs. Prefer a modular monolith over unnecessary separate services. Provide local Docker Compose or equivalent reproducible setup. Check official documentation and dependency compatibility before choosing versions; commit a lockfile. Do not assume browser-only hosting can run a durable worker. If using a managed platform, use its supported durable jobs and database facilities and document the mapping.

Use maintained authentication, CSV parsing, validation, and testing libraries. Avoid custom cryptography and password/session schemes. Server code is authoritative for authorization, number validation, eligibility, segmentation, pricing, limits and state transitions.

Modes: MOCK, PARTNER_SANDBOX, LIVE. MOCK is the default and has a persistent visible “Demo — no real SMS or payments” banner. Use persistent database data in mock mode, not localStorage as the source of truth. Fake verification email is available only through a local development mail sink. Provide deterministic mock results and failures. Demo balance cannot become live balance. Mode must be server-controlled; production excludes demo login bypasses and seed/admin credentials. Do not deploy live sending or payments as part of initial implementation.

### C. Explicit demo defaults

These are provisional test settings, not commercial terms or legal limits. Centralize them in validated, versioned configuration and label them clearly.

| Setting | Mock default |
|---|---|
| UI language / time zone | English / Asia/Manila |
| Upload size / data rows | 5 MiB / 10,000 excluding header |
| Field length | 500 characters except names: 100 |
| Self-service campaign ceiling | 100 unique format-valid destinations before suppression |
| Daily / monthly destination quota | 500 / 5,000 per organization |
| Scheduled horizon | Future time, up to 30 days |
| Segment cap per message | 6 |
| Demo unit price | PHP 1.00 per segment; illustrative only |
| Demo funding | PHP 1,000 equivalent, demo-only |
| Quote validity | 10 minutes |
| Upload / rejected row retention | 24 hours after terminal import state |
| Demo message details / audit retention | 30 days / 90 days |

Require approved live pricing, tax/invoice treatment, refund policy, limits and retention before LIVE. Do not silently copy demo settings into live configuration. Contacts and suppression have separate retention policies; upload expiry must not delete campaign snapshots before their configured expiry.

### D. Roles and data isolation

Implement Organization Owner, Sender, Viewer, and Platform Admin. Organization Owner has tenant billing, invitations/removals, contacts, suppression, templates, sender applications and send/report permissions. Sender can create/edit their own drafts and send/test within organization limits, but cannot change billing, roles, suppression, pricing or verification. Viewer sees masked reports only. Platform Admin performs platform operations using a separate audited admin surface; no unrestricted customer impersonation.

All customer entities carry organization_id. Derive authorized organization scope from authenticated membership, never trust a request's organization_id. Enforce tenant-safe relationships and uniqueness in the database where possible. Scope list/detail/create/update/delete/export endpoints and background jobs. Sender identity must belong to or explicitly be assigned to that organization. Require platform admin MFA in live mode. Team invites must expire, be single-use, bind the email and role, and prohibit privilege escalation or removal of the final Owner.

### E. Onboarding and UI

Account statuses: PENDING_REVIEW, NEEDS_INFORMATION, ACTIVE, SUSPENDED, REJECTED. Verify email and collect company, registration identifier, business address, industry, website/social URL, contact and intended usage. Do not collect personal ID scans by default. Record admin decisions with actor, time and reason. Only ACTIVE organizations with verified users and approved senders can test or send.

Use a clean B2B interface: light background, navy text, teal accent, clear tables and a five-step send wizard: Recipients → Message → Timing → Review → Results. Desktop-first, responsive monitoring and simple send on mobile. Show empty/loading/error/denied/insufficient balance/partner unavailable states. All errors include actionable text and a support reference. Mask numbers by default, e.g. +63 917 *** 4567. Use real aggregated database metrics; no invented success statistics. Scheduled list and reports can reuse campaign screens with filters.

Public pricing shows “Contact us for current pricing” until approved pricing exists. Do not invent legal claims or tax receipts. Legal pages are editable drafts, visibly marked pending review in demo; live readiness requires supplied approved text. Notification adapter writes in-app notifications and a local mail sink in demo. Actual email delivery is a separate integration.

### F. Phone and CSV rules

Accept 09171234567, 9171234567, 639171234567 and +639171234567; normalize to +639171234567. Remove only explicitly allowed formatting separators such as spaces, parentheses and hyphens, then validate the full string. Reject letters, extra plus signs, foreign prefixes, landlines, extensions and malformed lengths. Normalized format is ^\+639\d{9}$. This verifies format only, not activation, ownership, carrier or deliverability. Do not infer the current carrier from a number prefix.

Manual paste supports comma, semicolon and newline separators. Deduplicate within the campaign after normalization; never allow an override for duplicate sending in MVP. First valid row wins; disclose duplicate conflicts. Keep raw row counts and distinct counts separate. Apply bulk ceiling before suppression to avoid policy bypass; apply billable counts after exclusions. Zero eligible recipients blocks submission.

CSV requires phone_number; optional first_name, last_name, custom_1 to custom_5, consent_source and consent_date. Support UTF-8 with/without BOM, quoted fields and embedded commas using a real parser. Trim headers; reject duplicate headers, invalid UTF-8, NUL bytes, broken quoting and exceeded limits. Unknown columns require explicit ignore confirmation. No XLS/XLSX support and no numeric coercion of phone numbers. Show imported, blank, invalid, duplicate, suppressed and eligible counts with deterministic, mutually exclusive primary exclusion reasons. Keep the source row number. Show a paginated preview and require confirmation.

Treat cells as text. Never evaluate formulas. Escape every potentially dangerous exported cell, including values beginning with =, +, -, @ or relevant control characters, while preserving valid +63 phone data internally. CSV download defaults to masked phone and row number; Owner-only full export requires explicit action and audit. Serve exports through authenticated short-lived access, never public URLs. Store original CSV privately with encryption and automatic deletion; do not log raw files. Virus scanning, if configured, must complete before parsing; a disabled scanner must not be presented as a completed security check.

### G. Consent, suppression and inquiry policy

Message purpose is INFORMATIONAL or PROMOTIONAL. Any PROMOTIONAL request is inquiry-only in MVP. Do not treat a free-text consent_source or a checked box as proof of valid consent. Capture declared processing basis, notice/version acknowledgement, source/date and evidence reference where applicable. Actual legal basis and notice requirements are configurable business/DPO decisions, not automatically inferred from a message label.

Organization suppression is the recipient's opt-out for that business; platform suppression is a separately authorized global safety/abuse restriction. One business cannot create global opt-outs or inspect another business's lists. In MVP both applicable blocks exclude sending; advanced purpose-specific exceptions are deferred. Contact deletion/reimport must not remove suppression. Use a keyed lookup/HMAC of normalized numbers for retained suppression matching when suitable, with key versioning and a documented rotation path; do not use a plain guessable hash as anonymization. Minimum suppression evidence and its retention are separately controlled.

Do not display “Reply STOP” unless the real sender supports inbound replies and an implemented ingestion route processes them. A future web opt-out must use opaque signed tokens, no phone number in the URL, no login requirement, generic responses and a confirming POST rather than a state-changing GET. For MVP provide manual verified opt-out intake for operators and an adapter interface for future inbound requests. Recheck suppression immediately before each outbound submission. Explain that already handed-off SMS cannot be recalled.

Bulk inquiry collects company/contact, volume/frequency, purpose/audience, date, sample, sender needs and consent/source information. No recipient-list attachment. Rate-limit public forms and provide spam protection. Pipeline: NEW, CONTACTED, REVIEWING, QUOTATION_SENT, CONTRACTED, COMPLETED, REJECTED. No outbound emails to real recipients during demo.

### H. Message counts and immutable quotes

Use approved assigned sender identities only. Templates store plain text with versions. Reject empty messages and unsupported characters per adapter capabilities. Do not silently transliterate, trim meaningful whitespace or change smart punctuation after confirmation.

Implement a provider-specific segmentation service. Mock GSM-7 uses 160 septets for one segment and 153 for concatenated segments; extension-table characters consume two septets. Mock Unicode uses 70 UTF-16 code units for one and 67 for concatenation, and must not split a surrogate pair. Count actual encoding units, not only JavaScript string length or visible characters. Reject unsupported non-BMP content when the live provider only supports strict UCS-2. Boundary-aware packing must not split an escape pair. Partner rules override mock rules after verification. Show visible count, encoding, segments, recipients and total cost separately.

Server returns an immutable quote containing organization, draft version/content hash, recipient snapshot hash, sender, purpose, UTC schedule, price/tax policy versions, exclusions, segment total, maximum authorized cost and expiry. Store quotes server-side. Bind final confirmation to the exact quote and authenticated user. Editing any relevant value invalidates it. Stale quotes require a refreshed review. Test send uses a separate explicit confirmation, verified allowed destination, full pricing/quota checks and distinct idempotency key; it never submits the campaign.

### I. Wallet, payments and quota concurrency

Use a prepaid PHP wallet in integer centavos for mock pricing; never floating point. This is service credit, not a transferable consumer wallet. available = posted balance - active holds. Maintain append-only ledger entries and reservation records with unique operation references. PURCHASE/ADJUSTMENT/CHARGE/REFUND affect posted balance; RESERVE/RELEASE affect holds, not posted balance. Capturing a hold releases it and posts its charge in the same database transaction. Never mutate historical entries; corrections are compensating entries. Disallow admin adjustment below held funds.

Atomically verify eligibility and quote, reserve funds, reserve quota, create immutable campaign/message snapshots and durable dispatch jobs. Use transaction locking or equivalent concurrency control. A failed transaction leaves no partial reservation or queue record. Use a transactional outbox or database job inserts in the same transaction. Price snapshots remain fixed for submitted campaigns. Any increased charge requires renewed customer confirmation; never silently exceed authorized cost.

Quota applies across campaign splits, tests, concurrent submissions and API paths. Use Asia/Manila day/month buckets; reserve quota for scheduled execution periods, consume at dispatch, release unused capacity on cancellation/exclusion. Retries for the same message do not consume quota again. A job crossing a day/month boundary must safely move/revalidate capacity. Add independently configurable segment/spend/velocity limits to prevent long-message or repeated-send bypass.

Mock charging occurs on confirmed provider acceptance. Delivered/failed delivery alone does not decide a refund. Release known unsubmitted items; charge accepted items under the policy snapshot. UNKNOWN submission keeps the relevant hold pending reconciliation. Never automatically refund an ambiguous timeout. Live charge/refund rules must come from the partner contract. Refunds cannot exceed the original charge and are idempotent. Display reserved, charged, released and refunded amounts separately.

Payment adapter supports createCheckout, verifyEvent and reconcilePayment. Payment states include PENDING, PAID, FAILED, EXPIRED and refund/dispute records. Browser redirects never grant credits. Only authenticated provider events or server reconciliation may post a purchase after checking merchant/environment, transaction identity, amount, currency and package snapshot. Deduplicate event IDs AND business payment references. Replayed/forged/mismatched events cannot increase balance. If a chargeback exceeds remaining funds, freeze sending and record debt for operator resolution rather than hiding the deficit. Demo payment endpoints are unavailable in LIVE. No real PG is assumed and no card details are stored.

### J. State model, jobs and delivery

Separate three concepts:

- Campaign execution: DRAFT → SCHEDULED or QUEUED → PROCESSING → FINISHED. Add PAUSED_REVIEW and CANCELLED with explicit permitted transitions. FINISHED means no dispatch work remains, not all messages delivered.
- Message submission: PENDING, SUBMITTING, ACCEPTED, REJECTED, UNKNOWN, CANCELLED, EXCLUDED.
- Delivery for ACCEPTED items: PENDING, DELIVERED, UNDELIVERED, EXPIRED, UNAVAILABLE. UNAVAILABLE means no conclusive delivery receipt, not failure or success.

Derive report summaries from recipient states with separate accepted/delivered/undelivered/unresolved counts. Mixed results are a summary label, not a mutable catch-all status. UI labels distinguish “Accepted by provider” from “Delivered”; SMS delivery does not mean read. Keep original requested count, all exclusions and included unique count reconcilable.

Worker claims use durable leases, stable message IDs and compare-and-set transitions. Scheduled jobs persist UTC timestamps and display Asia/Manila. Restarting the application cannot lose a schedule. Immediately before submit, recheck active organization/user authorization, sender approval, policy, suppression, remaining hold, quota and cancellation. If authorization or policy becomes invalid, pause remaining work for review; no automatic resume after a policy change. Excluded/cancelled unsent items release their holds. Editing scheduled campaigns requires cancel-and-clone and a new quote.

Cancel/stop only items not past the external submission boundary. Make stop and worker claims race-safe. An in-flight/accepted/unknown item cannot be promised cancelled. Report how many were prevented, already accepted or unresolved. A suppression/stop arriving after provider handoff cannot guarantee recall.

SmsProvider interface: capabilities, submitMessage(stableKey, normalizedNumber, sender, content), querySubmission(referenceOrStableKey) if supported, and verifyAndMapDeliveryEvent(rawBody, headers). Never expose secrets to frontend. Build MockSmsProvider and an unconfigured PartnerSmsProvider that fails explicitly until real documentation is supplied. Do not recreate a gateway or guess payloads.

Transport timeout/crash after submission may mean the provider accepted the SMS. Mark UNKNOWN, query by stable key/reference if supported, or replay only when the provider contract guarantees idempotency for that same key and retention window. Without either guarantee, pause for reconciliation; do not blindly retry. Exactly-once external sending cannot be promised by a local database alone. Known pre-acceptance transient failures may use bounded backoff/jitter under documented adapter semantics. Authentication/policy/sender failures stop retries and alert operators.

Persist verified webhook events before acknowledging them. Authenticate raw payloads according to provider specification, prevent replay, deduplicate, and process asynchronously. Resolve organization through stored provider mappings, not webhook-supplied tenant IDs. Quarantine unknown references for reconciliation. Handle callbacks arriving before submit response persistence. Late PENDING/ACCEPTED events cannot overwrite DELIVERED; conflicting terminal events require deterministic provider precedence or operator review. Use polling only when supported; when no delivery mechanism exists show UNAVAILABLE. Never manufacture successful delivery.

### K. Data, security and operations

Create migrations for organizations, users/memberships/invitations, sender identities, contacts, suppression, imports/rows, templates, quotes, campaigns/message items, wallet/ledger/reservations, quota buckets/reservations, payments/payment events, dispatch jobs/attempts, provider events, inquiries, notifications, audit events and versioned configuration. Add tenant-safe foreign keys, indexes and uniqueness for normalized recipients per campaign, payment references, event IDs and idempotency keys. Same idempotency key with different payload returns a conflict, not a second operation. Encrypt sensitive snapshots and private objects at rest; redact logs.

Implement secure sessions, appropriate CSRF/XSS/injection protection, endpoint rate limits, restricted exports and admin MFA. Do not fetch arbitrary user URLs during content checks. Audit role changes, approvals, sends, stops, wallet changes, exports, suppression and policy changes, without full phone/message bodies in ordinary logs. Retention jobs cover database snapshots, originals, rejected rows, exports, logs and object storage. Backup retention and restoring previously deleted data must be addressed in the restore procedure. Document environment secrets, credential rotation, backup/restore, incident response, reconciliation and failed-job recovery. Never claim these are verified if only documented.

### L. Required tests

Use unit tests for domain rules, database integration tests for concurrency/transactions, and critical browser E2E tests. At minimum verify:

1. Four accepted phone formats normalize identically; foreign/landline/malformed input is excluded; format validity is not labeled verified ownership.
2. BOM/quoted CSV, invalid UTF-8, oversized input, missing/duplicate headers, blank rows, duplicate normalized numbers and formula-safe export.
3. GSM-7 160/161 and Unicode BMP 70/71 boundaries; extension characters, emoji/surrogate handling, concatenated boundaries and max segments.
4. Expired/mutated quotes fail; test send is separate and billable in demo; no eligible recipients blocks send.
5. Double-click and concurrent requests create one campaign/hold; same key with changed payload conflicts.
6. Two competing sends cannot overspend wallet or quotas. Rollback cannot orphan a hold or job.
7. Scheduling survives restart; future opt-out/suspension/sender revocation blocks the appropriate pending work; cancellation races are truthful.
8. Crash/timeout after provider acceptance enters UNKNOWN and cannot cause an unsafe second SMS. Reconciliation captures at most one charge.
9. Forged/duplicate/out-of-order payment events and wrong amount/currency never grant excess credit; refund/release are idempotent.
10. Delivery before submit response, duplicate webhook, invalid signature, unknown reference and out-of-order receipt; DELIVERED never regresses to PENDING.
11. Tenant A cannot access Tenant B by object ID, list filters, export, mutation or job context; role restrictions apply server-side.
12. Contact delete/reimport preserves suppression; organization opt-out does not leak across tenants; export/retention actions are audited.
13. Bulk ceiling, campaign splitting, promotional inquiry-only rule and missing live configuration cannot be bypassed through endpoints.
14. Core E2E: signup → demo email verification → admin business approval → demo funding → CSV preview → reviewed send → mock results → ledger/report. Include schedule-and-cancel and bulk inquiry paths.

Use synthetic fixtures only. Never send test messages to real phone numbers. Run actual tests and production build; report precise command results and any blocked checks, not invented passes.

### M. Delivery phases and finish criteria

Phase 1: Inspect repository, record scope/defaults, implement schema/auth/RBAC, app shell and deterministic seed fixtures for two tenants. Establish mock/live separation.

Phase 2: Implement contacts/imports/suppression/templates, wizard, segmentation, immutable quote, inquiry and usable admin approvals.

Phase 3: Implement atomic wallet/quota reservations, payment mock/events, durable immediate/scheduled dispatch, mock delivery, cancellation and reconciliation.

Phase 4: Finish masked reporting, exports, admin settings/audit, retention, notifications, accessibility and responsive UI; execute the required tests and fix failures.

Phase 5: Deliver setup/run commands, .env.example without secrets, migrations, demo fixtures, architecture/RBAC/state documentation, adapter contract, test report, user walkthrough and live-readiness checklist. Mark each feature implemented, mocked, deferred or externally blocked. If only the UI is complete, do not describe the application as complete.

Live-readiness checklist must identify actual remaining inputs: partner request/response/error schemas, sender rules, encoding limits, idempotency/query semantics, throughput, delivery authentication, charging/refunds, approved pricing/tax/invoice policy, real PG and email credentials, approved privacy/consent/retention texts, production admin MFA, durable worker hosting, and successful sandbox/UAT/recovery tests. Missing inputs should block only live activation, not completion of the mock application. Do not claim general reference providers are the contracted partner.

Start by inspecting the workspace and then implement Phase 1. Continue through all feasible phases in this session. If work spans sessions, update IMPLEMENTATION_STATUS.md with completed work, test evidence and the exact next task so the next run can resume without rebuilding.

## END MASTER PROMPT

---

## 3. Follow-up prompt for reviewing the implementation

> Compare the current implementation against PH_SMS_Vibe_Coding_Prompt_Reviewed.md. Do not merely check whether the screens exist: verify in code and tests the actual data storage, server-side authorization, cross-organization isolation, duplicate sending, concurrent balance reservation, duplicate payment webhooks, opt-out arriving after scheduling, prevention of resending on UNKNOWN, and formula-safe CSV export. Fix the defects you confirm and run the tests. Distinguish not implemented, mocked, and fully integrated, and state explicitly which checks failed or could not be run. Do not guess a partner API to connect to, and do not send real messages.

## 4. Reference standards consulted

- Message length cannot be calculated from the visible character count alone; it depends on the encoding and on whether the message is concatenated. The 160/153 and 70/67 values above are common mock-implementation baselines. The actual Philippine partner's encoding and charging specification must be applied separately. [Twilio official SMS length documentation](https://www.twilio.com/docs/glossary/what-sms-character-limit)
- Payment webhooks must account for signature verification, duplicate events and out-of-order events. The Stripe documentation is a design reference only; it does not imply a selected PG or a possible contract. [Stripe official webhook documentation](https://docs.stripe.com/webhooks)
- The effect and retention window of an idempotency key depend on the external service's implementation, so sending the same key does not by itself guarantee duplicate prevention with every SMS partner. [Stripe official idempotent requests documentation](https://docs.stripe.com/api/idempotent_requests)
- An operating policy is needed to reflect transparency, legitimate purpose, proportionality and data subject rights in personal data processing. The specific provisional retention periods and the inquiry-only policy in this prompt are development proposals, not statutory figures. [Philippine NPC Data Privacy Act Implementing Rules and Regulations](https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/)
