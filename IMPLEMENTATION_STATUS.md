# Implementation progress

Updated 2026-11-17 (Asia/Manila).

The requested demo features are implemented. This remains a **MOCK** application:
no live SMS adapter, real payment integration, external monitoring account or
production deployment was added. Human acceptance and the live phase below
remain open. Verification evidence is in [docs/TEST-REPORT.md](docs/TEST-REPORT.md).

## Left: going live — deferred by request

This is the next phase to plan, not work performed in this change. A demo rate,
editable setting or passing mock test is not a production approval.

| Workstream | Needed input / decision | Work after approval | Completion evidence |
|---|---|---|---|
| SMS partner | Sandbox contract, payloads/error codes, sender registration, encoding/segment rules, charge/refund points, idempotency/query semantics and throughput | Implement the real adapter, authenticated delivery callbacks, partner-specific pacing/backoff and reconciliation | Sandbox delivery/retry/timeout/receipt tests; documented billing reconciliation; partner sign-off |
| Payments and commercial terms | Chosen provider/merchant, approved rates, tax/invoice treatment, credit packages, refunds/chargebacks | Implement the real payment adapter and checkout; map approved terms to configuration | Sandbox payment/refund/chargeback tests and finance approval |
| Privacy and promotional policy | Named DPO/legal owner; approved notices, consent evidence, opt-out process, retention and acceptable-use wording | Apply approved text/rules, review data flow and recipient consent handling | Signed policy review and [security/privacy checklist](docs/SECURITY-PRIVACY-CHECKLIST.md) |
| Production infrastructure | Hosting/region, isolated UTF-8 managed database, worker/scheduler, backup plan, secret ownership and domain | Provision infrastructure, TLS/secrets, admin MFA, durable dispatch and retention schedules | Environment review, restore/rollback rehearsal, rotation evidence and verified scheduler cadence |
| Email delivery | Mail provider/domain, verified sender, production base URL and operator recipients | Configure the existing SMTP transport and test delivery/link behavior | Received verification/invite/inquiry emails in both languages; delivery failure procedure |
| Monitoring and response | Monitoring provider, primary/backup responders, escalation path and retention | Connect [alert definitions](docs/MONITORING.md) to external notifications and uptime checks | Deliberate staging failure produces a received alert, acknowledgement and recovery notification |
| Acceptance and release | Gideon's results, business-owner design approval, sandbox UAT and security review | Resolve accepted defects; tag a reviewed release; execute migration/rollback plan | Signed UAT, final defect disposition and release checklist |

Detailed gates: [LIVE-READINESS.md](docs/LIVE-READINESS.md).
Future staging procedure: [STAGING-DEPLOYMENT.md](docs/STAGING-DEPLOYMENT.md).
No hosting account, deployment, real credential or external alert destination was
created or activated by this work.

## Completed: remaining demo details

- Admin Overview's **Export report** downloads an audited campaign summary.
- Downloaded headings/statuses/reasons, the contact sample, upload failure detail
  and refused-download pages follow English/Korean selection. Localized contact
  headers can be imported again.
- The schedule field shows the current Manila time, with the existing timezone-safe
  conversion and future-time validation.

## Completed: remaining original-request features

| Feature | Behavior now available |
|---|---|
| Personalized messages | `{{first_name}}`, `{{last_name}}`, `{{custom_1}}`–`{{custom_5}}` from saved contacts; missing/unsupported values block review. Each rendered message is validated and priced, reviewed examples are shown, and encrypted immutable snapshots preserve text/cost across contact edits. Retention and key rotation include the new ciphertext. |
| Promotional route | Off by default: promotions go to the bulk inquiry, as the client's request has it, and the quote refuses one. Admin → Settings → Promotional messages can allow them through normal sending; then every recipient needs a saved contact with a consent source, checked at the quote, at confirmation and before dispatch, and suppression, content checks, approval holds and account limits still apply. |
| Reports | `/app/reports`: Manila creation-date range, purpose/status filters, aggregate totals, pagination and filtered audited CSV. Charged amount is separate from maximum authorized cost; tenant scope applies throughout. |
| Admin Pricing | `/admin/pricing`: edit the demo segment price and quote validity, see rate history, preserve already quoted prices. Reset/resave and concurrent edits preserve version history. |
| Upload column mapping | Explicitly connect unfamiliar columns to supported fields or ignore them; preview and correct before commit. |
| Inquiry notifications | Status changes notify the customer and assigned operator; repeated saves do not duplicate status-change notifications. Demo emails stay in the sink. |
| Editable emails | `/admin/emails`: English/Korean verification, invitations, support confirmations and inquiry updates, with placeholder validation, preview and audited save/reset. Secure account links remain system-generated. |
| Sending pace | Shared database admission clock across workers/campaigns and verification messages; configurable demo rate, deadline-safe pause/resume, no charge/attempt for waiting. Actual partner limits remain a go-live input. |
| Monitoring | `/admin/health`: active alerts, severity, response links and refresh; full health JSON includes check time and alert definitions. External routing is deferred. |

## Handover package

- [Security/privacy checklist and dependency inventory](docs/SECURITY-PRIVACY-CHECKLIST.md)
- [User acceptance checklist](docs/UAT-CHECKLIST.md)
- [Final defect report](docs/FINAL-DEFECT-REPORT.md)
- [Staging deployment guide](docs/STAGING-DEPLOYMENT.md)
- [Monitoring dashboard and alert definitions](docs/MONITORING.md)
- Existing architecture, role matrix, adapter contract and recovery runbooks remain
  linked in [README.md](README.md).

## Human review still pending

Gideon needs to run the updated `docs/PH_SMS_Testing_Guide.docx` (the "2.0" copy holds his 11 November results);
the business owner still needs to review the design. Automated execution of the
guide is recorded separately and does not stand in for either person's approval.
No messages were sent to them.

## Database update and local limitation

Migration `drizzle/0006_woozy_millenium_guard.sql` adds email templates, inquiry
locale, provider pacing and nullable encrypted personalized-message snapshots.
It was applied to the local demo database and both isolated test databases.
For another demo environment, apply it with `npm run db:migrate` before using
the new pages.
The pre-existing local `ph_sms` database uses WIN1252; Korean data needs UTF-8.
It was not reset or replaced. The test databases use UTF-8.
