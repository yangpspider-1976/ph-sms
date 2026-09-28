**PRODUCT REQUIREMENTS & IMPLEMENTATION REQUEST**

# Philippines B2B SMS Platform

Detailed scope for public website, customer portal, admin console, security, QA, and delivery

| **Audience:** Product, UX/UI, frontend, backend, QA, DevOps<br>**Market:** Philippines only | **Version:** 1.0 — Draft for estimation<br>**Date:** 8 September 2026 |
|---|---|

> **Implementation boundary** The partner SMS API will provide actual message transport. Do not design or rebuild carrier gateway internals. Build the platform-facing adapter, validation, orchestration, records, user experience, and operational controls described below.

## Document purpose

This document is the basis for technical estimation, UX design, development, testing, and handover. Any assumption affecting price, schedule, data ownership, message charging, or compliance must be recorded and approved before implementation.

## Product summary

- **Self-service SMS —** Verified business users can enter Philippine mobile numbers manually, paste multiple numbers, or upload a CSV file.
- **Controlled sending —** Every send is checked for account status, number validity, suppression, balance, limits, and required confirmations.
- **Bulk-sales route —** High-volume or promotional campaigns are routed to a separate inquiry and manual review process.
- **Partner transport —** A dedicated adapter sends accepted jobs to the partner API and maps partner responses into platform statuses.

## Scope and non-goals

| **In scope** | **Out of scope** |
|---|---|
| Public marketing website, customer portal, admin console | Carrier network or SMS gateway implementation |
| Business onboarding and manual verification | Sending to non-Philippine destinations |
| Manual entry, paste, CSV import and validation | WhatsApp, Viber, RCS, email, or voice channels |
| Composer, templates, test/immediate/scheduled send | Public customer API in MVP |
| Credits, billing records, reports, suppression list | Advanced CRM and marketing automation |
| Partner API adapter and webhook/status mapping | Partner API internal infrastructure |

## Assumptions requiring confirmation

- Pricing is prepaid and deducted per SMS segment, not per campaign row.
- Philippine mobile destinations are normalized to E.164 format (+63…).
- Anonymous or unverified accounts cannot send.
- The partner provides sandbox credentials, production credentials, error codes, delivery updates, rate limits, sender-ID rules, and support escalation contacts.
- Exact self-service volume thresholds, credit packages, retention periods, payment gateway, and refund rules are configuration values.

## User roles and permissions

| **Role** | **Primary permissions** |
|---|---|
| Organization Owner | Billing, users, settings, all campaigns and reports |
| Organization Admin | Contacts, templates, sender IDs, campaign settings |
| Sender | Create drafts and send within assigned limits |
| Approver | Approve or reject drafts when approval workflow is enabled |
| Viewer | Read-only access to reports and history |
| Platform Admin | Customer verification, pricing, limits, credits, abuse and system operations |

## Information architecture

| **Surface** | **Required pages** |
|---|---|
| Public website | Home; Features; How It Works; Pricing; Bulk SMS; Help Center; Contact; Login; Sign Up; legal pages |
| Customer portal | Dashboard; Send SMS; Campaigns; Contacts; Templates; Scheduled; Reports; Credits & Billing; Sender IDs; Team; Settings; Support |
| Admin console | Overview; Customers; Verification; SMS Activity; Bulk Inquiries; Sender IDs; Payments & Credits; Pricing; Suppression; Abuse; Audit Logs; Settings |

## Functional requirements

### Authentication and organization onboarding

| **ID** | **Requirement** | **Acceptance summary** |
|---|---|---|
| AUTH-01 | Email/password registration with email verification. | Unverified email cannot enter the send flow. |
| AUTH-02 | Optional mobile verification and MFA-ready architecture. | Admin MFA is mandatory before production. |
| AUTH-03 | Collect company name, SEC/DTI identifier, address, industry, website/social URL, purpose and expected volume. | Submission creates Pending Review status. |
| AUTH-04 | Admin can approve, request information, suspend, reject, and reactivate. | All decisions are written to the audit log. |
| AUTH-05 | Support organization membership and role-based access. | Cross-organization access is denied and tested. |

### Recipient input and validation

| **ID** | **Requirement** | **Acceptance summary** |
|---|---|---|
| REC-01 | Accept one number, line-separated paste, or comma-separated paste. | User receives valid, invalid, duplicate, suppressed and review counts. |
| REC-02 | Accept CSV with phone_number required and optional personalization/consent fields. | Column mapping preview is shown before import. |
| REC-03 | Normalize 09XXXXXXXXX, 9XXXXXXXXX, 639XXXXXXXXX and +639XXXXXXXXX to E.164. | No destination outside configured Philippine mobile rules is accepted. |
| REC-04 | Deduplicate within the upload and against the selected campaign. | Only one send per normalized number unless explicitly allowed by policy. |
| REC-05 | Check the global and organization suppression lists before preview and again before dispatch. | Suppressed numbers are never queued. |
| REC-06 | Provide downloadable error rows without exposing unrelated records. | Error export contains row number, masked number and reason. |

### CSV specification

| **Column** | **Required** | **Rules** |
|---|---|---|
| phone_number | Yes | Text value; Philippine mobile only; normalized to E.164 |
| first_name | No | Plain text; maximum 100 characters |
| last_name | No | Plain text; maximum 100 characters |
| custom_1 … custom_5 | No | Plain text; per-field limit configured |
| consent_source | No in file; required operationally for promotional use | Examples: website signup, contract, event registration |
| consent_date | No | ISO date preferred: YYYY-MM-DD |

- CSV only for MVP; UTF-8 supported; reject password-protected, executable, macro-enabled, malformed, or oversized files.
- All cell values must be handled as data. Spreadsheet formulas and formula injection prefixes must be neutralized in exports.
- Provide a downloadable CSV template and a preview of the first valid rows.
- Original upload objects must use encrypted storage and configurable automatic deletion.

### Message composer and sending

| **ID** | **Requirement** | **Acceptance summary** |
|---|---|---|
| MSG-01 | Select only approved sender IDs available to the organization. | Unapproved sender IDs cannot be submitted. |
| MSG-02 | Composer shows characters, encoding, segments, final recipient count and estimated credit cost in real time. | Estimate matches server-side calculation. |
| MSG-03 | Support saved templates and variables such as {{first_name}} and {{custom_1}}. | Preview includes sample and longest-row results. |
| MSG-04 | Support test send, immediate send, and Asia/Manila scheduled send. | Confirmation always displays the absolute Philippine date/time. |
| MSG-05 | Run content/risk checks for blocked patterns, links, abusive use and policy configuration. | Flagged jobs cannot bypass required admin review. |
| MSG-06 | Final confirmation displays sender, sample message, recipients, exclusions, segments, cost, schedule and lawful-basis checkbox. | No job is created without confirmation. |
| MSG-07 | Dispatch is idempotent. Repeated clicks or worker retries do not create duplicate sends. | Duplicate-request test produces one billable dispatch. |

#### Segmentation and cost calculation

The client may display estimates, but the server is authoritative. Determine encoding and segment length according to the partner contract. Personalization must be rendered per recipient before final segment calculation. If actual cost can differ from the estimate, reserve the maximum approved amount and reconcile using an immutable credit ledger.

### Campaign lifecycle and reporting

| **Platform status** | **Meaning** |
|---|---|
| DRAFT | Editable and not submitted |
| PENDING_APPROVAL | Waiting for customer or platform approval |
| SCHEDULED | Validated and awaiting scheduled time |
| QUEUED | Accepted for dispatch |
| PROCESSING | Dispatch in progress |
| SENT | Accepted by partner |
| DELIVERED | Partner confirmed delivery |
| PARTIAL | Mixed final or non-final results |
| FAILED | Dispatch or partner failure |
| REJECTED | Policy, validation or partner rejection |
| CANCELLED | Cancelled before irreversible dispatch |

- Summary: requested, excluded, queued, sent, delivered, failed, credits reserved, charged and refunded.
- Recipient-level records are masked by default and permission-controlled.
- Export includes campaign metadata and permitted delivery data; every export is logged.
- Failure reasons must use a platform taxonomy while retaining the raw partner code in restricted logs.

### Credits, billing and refunds

| **ID** | **Requirement** |
|---|---|
| BILL-01 | Maintain an immutable credit ledger: purchase, promotion, reservation, charge, release, refund, admin adjustment, expiry. |
| BILL-02 | Never update balance without a corresponding ledger entry and idempotency key. |
| BILL-03 | Reject scheduling or sending when available balance is insufficient for the calculated reservation. |
| BILL-04 | Admin adjustments require reason, operator identity and timestamp. |
| BILL-05 | Payment integration must be abstracted; exact provider is a configuration/deployment decision. |

### Bulk campaign inquiry

- Collect company, contact, estimated volume, frequency, purpose, audience type, preferred date, sample message, sender-ID need, consent source and monthly forecast.
- Do not request or accept the full recipient list during inquiry.
- Admin pipeline: New → Contacted → Reviewing → Quotation Sent → Contracted → Completed or Rejected.
- Thresholds and categories that trigger the inquiry route must be editable in admin configuration.
- Notify the customer and assigned operator of status changes; email notification templates must be editable.

### Contacts, consent and suppression

- Store normalized number, display mask, optional name/custom fields, source, consent metadata, tags and group membership.
- Maintain global and organization-level suppression records separately from active contacts.
- Deleting a contact must not automatically remove its suppression record.
- Provide access, correction, export and deletion workflows subject to legal retention obligations.
- Promotional send requires a configured lawful-basis/consent declaration and opt-out treatment approved by the product owner/DPO.

### Administration and abuse controls

- Customer verification queue and evidence review
- Per-organization daily/monthly recipient and credit limits
- Sender-ID status and supporting documents
- Pricing, packages, thresholds and refund rules
- Live campaign view, safe stop where technically reversible, and incident annotations
- Blocked content configuration, URL/domain flags, velocity rules and failure-rate alerts
- Global suppression and abuse complaint processing
- Audit-log search and controlled export
- System health, partner connectivity status and webhook backlog

## Partner API integration boundary

The developer must create a provider adapter so the business logic does not depend directly on one partner payload. The adapter is in scope; the partner gateway implementation is not.

| **Adapter capability** | **Required behavior** |
|---|---|
| Authentication | Use server-side secrets only; separate sandbox and production credentials. |
| Submit | Accept normalized internal request and return platform request reference plus partner reference. |
| Delivery updates | Consume signed/verified webhook when available; otherwise use an approved polling strategy. |
| Error mapping | Map partner codes to retryable, permanent, recipient, balance, sender and policy categories. |
| Idempotency | Use internal send/item keys and partner idempotency support where available. |
| Rate limiting | Queue and throttle without blocking web requests. |
| Retries | Retry only documented transient failures with exponential backoff and maximum attempts. |
| Observability | Log correlation IDs, latency, result category and safe metadata; never log full message/number by default. |

### Minimum partner information required before build

- Sandbox and production base URLs and credentials
- Request/response schemas and sample payloads
- Synchronous and asynchronous error codes
- Delivery receipt method and signature verification
- Rate limits, timeouts, retry guidance and maintenance windows
- Message encoding and segmentation rules
- Charging point and failed-message/refund rules
- Sender-ID approval and use rules
- Permitted content and compliance requirements
- Support and incident escalation contacts

## Core data model

| **Entity** | **Key fields / relationships** |
|---|---|
| Organization | status, verification, limits, pricing plan, retention policy |
| User / Membership | identity, organization, role, MFA status |
| SenderIdentity | organization, sender value, status, evidence, partner reference |
| Contact / Group | normalized number, attributes, consent metadata, memberships |
| Suppression | normalized number, scope, reason, source, effective date |
| ImportJob / ImportRow | file reference, row status, validation reason, expiry |
| Template | organization, content, variables, version |
| Campaign | sender, content snapshot, schedule, state, creator, approver |
| MessageItem | campaign, recipient snapshot, rendered segment count, status, partner reference |
| CreditLedger | organization, type, amount, balance-after, reference, idempotency key |
| BulkInquiry | company, contact, volume, purpose, status, owner |
| AuditEvent | actor, action, object, timestamp, IP/device metadata, safe diff |

## Security and privacy requirements

| **ID** | **Requirement** |
|---|---|
| SEC-01 | TLS for all traffic; encryption at rest for databases, objects, backups and secret stores. |
| SEC-02 | Tenant isolation must be enforced at the server/data-access layer, not only in the UI. |
| SEC-03 | Mask phone numbers by default; restrict reveal/export; log every sensitive export. |
| SEC-04 | Mandatory MFA for platform administrators; strong session, password and recovery controls. |
| SEC-05 | CSRF, XSS, injection, SSRF, insecure upload, CSV injection and broken access-control protections. |
| SEC-06 | Rate limits for login, upload, preview, test send, dispatch and export. |
| SEC-07 | Secrets are stored outside source control and separated by environment. |
| SEC-08 | Configurable retention and deletion jobs for uploads, contacts, message detail, logs and backups. |
| SEC-09 | Audit trail for authentication, verification, credit changes, sends, exports, suppression and admin actions. |
| SEC-10 | Documented incident response, account suspension, credential rotation, backup and restore procedure. |

## Non-functional requirements

- **Time zone —** Store timestamps in UTC; display campaign scheduling in Asia/Manila with explicit label.
- **Reliability —** Web requests create durable jobs; workers process asynchronously; queues survive restarts.
- **Performance —** Validation and preview must remain responsive for the approved MVP file size and row limit.
- **Accessibility —** Keyboard-operable forms, visible focus, labeled controls, readable contrast and meaningful errors.
- **Responsiveness —** Desktop-first customer/admin consoles; supported mobile view for monitoring and simple sends.
- **Localization —** English first; architecture must permit Korean and other locale files without hard-coded UI text.
- **Configuration —** Thresholds, packages, limits, retention, blocked patterns and notification templates are environment/admin controlled.

## Recommended architecture constraints

- Separate web application, API service, background worker/queue, relational database, encrypted object storage, monitoring and secret management.
- Use a provider-adapter interface to isolate partner-specific code.
- Keep development, staging and production databases, credentials, storage and environment variables fully separate.
- Use migrations with rollback planning; never make uncontrolled production schema edits.
- All dispatch, credit and webhook operations require idempotency and correlation IDs.
- Infrastructure choice remains open, but the developer must document setup, deployment, backup, restore and rollback.

## Key UI states and error handling

- Empty, loading, success, partial, validation-error, permission-denied, insufficient-credit, suspended-account, partner-unavailable and unexpected-error states must be designed.
- Before irreversible sending, use a final confirmation with cost and recipient count; after submission, disable duplicate action and show progress.
- If partner service is unavailable, preserve the job safely and display a truthful status. Do not mark as sent without partner acceptance.
- Scheduled jobs can be cancelled only before the configured irreversible state.
- All user-facing errors require a human-readable action and a support reference ID.

## QA and acceptance criteria

| **Test area** | **Minimum acceptance tests** |
|---|---|
| Number handling | All supported PH formats normalize correctly; foreign, malformed, duplicate and suppressed numbers are excluded. |
| CSV | Valid import, invalid encoding, missing column, oversized file, formula content, duplicate rows, mixed valid/invalid rows. |
| Composer | Encoding/segment calculation, personalization, longest record, URL/content flags, test send. |
| Dispatch | Immediate, scheduled, retry, double-click, worker restart and partner timeout without duplicate billing/sending. |
| Webhook | Valid, invalid signature, duplicate, out-of-order and unknown partner reference. |
| Credits | Purchase, reserve, charge, release, refund, concurrent sends and admin adjustment reconcile exactly. |
| RBAC / tenant | Every role and cross-organization access attempt tested at API level. |
| Privacy | Masking, export permission, deletion, retention jobs and audit records. |
| Admin | Approval, suspension, limit change, price change, safe campaign intervention and inquiry workflow. |
| Recovery | Backup restore and release rollback demonstrated in staging. |

## Developer delivery package

- Source code in an isolated Git repository with meaningful commits and release tags
- README with local setup and architecture overview
- Example environment file with no secrets
- Database schema and versioned migrations
- API contract and partner-adapter documentation
- Admin/customer role-permission matrix
- Automated unit, integration and critical end-to-end tests
- Staging deployment and production deployment guide
- Monitoring dashboard and alert definitions
- Backup, restore, rollback and incident runbooks
- Security/privacy checklist and dependency inventory
- User acceptance test checklist and final defect report

## Delivery workflow and gates

| **Gate** | **Required output** |
|---|---|
| Pre-check | Confirmed scope, open decisions, partner sandbox, legal/policy owner, threat and data-flow review |
| Design approval | Page list, wireframes, status model, CSV rules, credit model, API adapter contract |
| Development complete | Feature branch review, automated tests, migrations and documentation |
| Staging acceptance | Partner sandbox integration, security tests, UAT and backup/restore test |
| Pilot readiness | Approved companies only, conservative limits, monitoring, support and incident contacts |
| Production release | Signed release checklist, tagged version, migration plan and tested rollback |

## Open decisions for estimation

| **Decision** | **Owner / input needed** |
|---|---|
| Product name, domain, brand and UI direction | Business owner |
| Self-service daily/monthly limits and bulk threshold | Business owner + SMS partner |
| Partner price, charge point, failure refund and credit packages | Business owner + SMS partner |
| Payment gateway, tax receipt and settlement flow | Business owner + finance |
| Sender-ID process and supported sender types | SMS partner |
| Marketing-message policy, opt-out method and required declarations | DPO/legal + SMS partner |
| CSV row/file limits and expected peak volume | Business owner + developer + partner |
| Data retention, deletion and backup retention | DPO/legal + operations |
| Hosting region and technology stack | Developer proposal subject to privacy/security approval |
| Target timeline and pilot customer count | Business owner |

## Reference policies

National Privacy Commission: [Implementing Rules and Regulations of the Data Privacy Act of 2012](https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/)

National Privacy Commission: [NPC Circular No. 2023-04 — Guidelines on Consent](https://privacy.gov.ph/wp-content/uploads/2023/11/NPC-Circular-No.-2023-04_Guidelines-on-Consent_07Nov2023.pdf)

National Privacy Commission: [Advisory Opinion No. 2020-041](https://www.privacy.gov.ph/wp-content/uploads/2020/11/Redacted-Advisory-Opinion-No.-2020-041.pdf)

> **Important** This specification is not legal advice. Final workflows, contracts, notices, consent wording, registration obligations, retention periods, and opt-out handling must be approved by the Philippine DPO/legal adviser and aligned with the SMS partner’s carrier requirements.
