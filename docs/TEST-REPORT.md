# Test report

Updated 2026-11-20 (Asia/Manila), based on actual local runs, after the review
fixes of 2026-11-19 (see [FINAL-DEFECT-REPORT.md](FINAL-DEFECT-REPORT.md), REV-01 to REV-06).

| Check | Result |
|---|---|
| Unit/integration suite (`npm test`) | **460 passed**, 37 files |
| Browser suite (`npm run e2e`) | **85 passed**, 11 specs, Chromium, real PostgreSQL and mock worker |
| Production build | **Passed**, executed by the Playwright web-server setup before the successful browser run |
| TypeScript (`npm run typecheck`) | **Passed** |
| Patch whitespace (`git diff --check`) | **Passed** |
| Migration | `0006_woozy_millenium_guard.sql` applied to isolated test databases and the local demo database |

## Environment and boundaries

Windows, Node 24.19.0, PostgreSQL 18. The unit/integration database is `ph_sms_test`;
the browser database is `ph_sms_e2e`. Both use UTF-8 and are separate from the
existing local demo records. Tests reset their own fixtures. No production system
or live provider was exercised. Browser tests build and serve the production
Next.js app with MOCK adapters and run a separate dispatch worker.

## New behavior verified

- Personalized fields are resolved per recipient; mixed GSM/Unicode lengths are
  priced exactly. Contact edits cannot change reviewed snapshots. Missing data,
  unsupported tokens, modified snapshots, rendered content violations and
  cross-tenant values are refused. Retention removes the new personal text.
- Promotional sending is refused while the admin switch is off (the default), at
  the quote and again at confirmation (requirement 13). With it on, promotional
  consent is required at quote, confirmation and dispatch; withdrawn consent and
  later opt-outs prevent sending/charging.
- CSV column remapping feeds a real personalized promotional browser send, with
  the switch turned on for that test and back off after it.
- A run that stops early releases its claim; one that went through every
  message keeps its lease, so an unqueryable UNKNOWN or a temporary failure is
  not re-run every second.
- Reports use tenant scope, inclusive Manila end dates and validated filters;
  aggregate totals distinguish charged amounts from authorization. Korean CSVs
  are formula-safe and exports audited.
- Email overrides/defaults/reset, unsupported syntax/header validation and audit
  events are tested. Inquiry notifications cover concurrency, repeated saves,
  assignment, localization and transactional rollback in the mail sink.
- Pricing reset/resave and concurrent changes preserve version history.
- Provider admission is shared across concurrent callers. Deadline-limited work
  remains pending, uncharged, with no consumed delivery attempt and no stranded
  lease. Alert rules report only observed unhealthy signals.
- Admin export, refused-download localization, Korean sample download/re-import,
  email editing and pricing save/reset pass in a real browser.
- Existing billing/ledger, reservation, idempotency, UNKNOWN reconciliation,
  webhook ordering, auth/RBAC, team, contact groups and localization regressions
  remain part of the complete suite.

## Browser coverage

The 11 specs cover accessibility, bulk inquiries, signup-to-send, exports,
contact groups, localization, the newly completed features, responsive layout,
scheduling/cancellation, templates and the supplied testing guide (plus the
suite's global setup/teardown are separate support files). Accessibility checks
cover the new Reports, Pricing, Emails and Health pages. Phone/tablet checks
assert no horizontal document overflow. Scheduling is checked with browser
zones Asia/Seoul and America/Los_Angeles while input remains Manila time.

Initial browser failures exposed ambiguous old Message/Pipeline selectors and
an outdated case-sensitive inquiry-confirmation assertion; those tests were
updated to the new controls/wording. The final complete rerun passed all 84.

## What this does not prove

- Gideon's guide acceptance or business-owner design approval.
- Real phone/carrier delivery, partner throughput, provider charging, payment
  settlement or SMTP delivery; those integrations remain deferred.
- Independent penetration testing, a dependency vulnerability audit, legal/privacy
  approval, manual screen-reader use or physical-device testing.
- Managed-provider restore, production rollback, monitoring delivery or on-call
  response; the new documents specify the later procedures and acceptance gates.
- Korean writes to the existing WIN1252 local demo database. Migrations were
  applied without resetting its data; Korean storage needs a UTF-8 database.

Open items and ownership: [FINAL-DEFECT-REPORT.md](FINAL-DEFECT-REPORT.md).
Human acceptance: [UAT-CHECKLIST.md](UAT-CHECKLIST.md).
