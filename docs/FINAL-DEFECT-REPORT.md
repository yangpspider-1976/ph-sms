# Final defect report — demo feature completion

Updated 2026-11-17 (Asia/Manila). Scope: the requested remaining demo features and
handover documents. This is an engineering report; client UAT sign-off remains
open. See [TEST-REPORT.md](TEST-REPORT.md) for final automated results.

## Fixed in this change

| ID | Defect / gap | Resolution and evidence |
|---|---|---|
| DEMO-01 | Admin Overview export did nothing | Authenticated, rate-limited, audited CSV route; browser download check |
| DEMO-02 | File contents and download/upload errors stayed English | Dictionary-backed export fields/status/reasons and refusal HTML; Korean sample re-import and browser checks |
| DEMO-03 | Scheduling across time zones was difficult to compare | Current Manila clock beside schedule; existing Seoul/Los Angeles browser cases |
| SEND-01 | Personalization rejected by design | Saved contact fields, exact rendered segment/cost pricing, encrypted immutable snapshots, privacy jobs and domain/browser regressions |
| SEND-02 | The promotional route was fixed in code | Admin → Settings → Promotional messages, off by default so promotions keep the inquiry route the client's request specifies; when on, consent is checked at the quote, at confirmation and before dispatch, with suppression |
| DATA-01 | Unrecognized CSV columns could not be mapped | Explicit matching/ignore controls, preview, server validation and mapping-to-send browser journey |
| ADMIN-01 | Email wording could not be edited | Localized admin editor, validation, preview, audit and reset; protected actions |
| ADMIN-02 | Inquiry status changes did not notify people | Serialized change detection; localized customer/assigned-operator mail; repeated/concurrent saves do not duplicate the change notification |
| ADMIN-03 | Resetting a price then saving reused a history version | Allocate from retained history and serialize per-key updates; reset/resave and concurrency tests |
| REPORT-01 | No dedicated Reports page | Tenant-scoped filtering, aggregates, pagination and matching audited export; Manila boundary/isolation tests |
| OPS-01 | No shared provider pace | Database admission clock across workers; bounded run pauses before SUBMITTING and releases its lease without charge/retry consumption |
| OPS-02 | Monitoring had no alert definitions | Dashboard, active severity/response links, JSON alert list and documented external routing work |
| LOC-01 | Korean support-confirmation subject remained untranslated | Localized subject; dictionary coverage test |
| SEC-01 | A same-origin referrer path beginning // could create an external back link | Refused-download page rejects protocol-relative paths; regression test |
| QA-01 | Older browser selectors became ambiguous with new controls | Use explicit Message and Pipeline status labels; update changed inquiry wording assertion |
| REV-01 | Found in review (2026-11-19): promotional self-service had been switched on for every business | Restored the inquiry route as the default behind the admin switch (SEND-02); requirement 13's test restored |
| REV-02 | Found in review: a campaign whose message stayed UNKNOWN (a provider that cannot be queried, as the partner adapter is) was re-run about every second, indefinitely, with its attempts reset; a temporary failure was retried every second instead of after the lease | A claim is released early only when a run stopped early (deadline or no provider slot); otherwise it keeps its lease, as before; regression tests fail on the earlier behaviour |
| REV-03 | Found in review: the review showed the first five messages, not the longest (MSG-03) | The longest message is always among the samples, marked; tested |
| REV-04 | Found in review: a personalized test send failed unless the member's number was a saved contact | Filled from the receiving member's contact, or their profile name for the name fields; a missing custom field is refused with its own message; tested |
| REV-05 | Found in review: the send page estimated with the built-in price, not the admin's | The page reads the settings in force, as the quote does |
| REV-06 | Found in review: smaller gaps | CONSENT_MISSING shown by its label; Emails page labels styled; its reset no longer loads both dictionaries in the browser; the acceptance checklist names the current guide |

## Open limitations and acceptance work

| ID | State / owner | Required next evidence |
|---|---|---|
| ENV-01 | Existing local `ph_sms` database is WIN1252; engineering/environment owner | Move preserved data to UTF-8 before saving Korean text there. This change did not reset or replace that database. Additive migration was applied; isolated test databases are UTF-8. |
| UAT-01 | Gideon: pending | Try the two new steps in the supplied testing guide and complete [UAT-CHECKLIST.md](UAT-CHECKLIST.md) |
| DESIGN-01 | Business owner: pending | Accept or return feedback on the design, including new pages |
| A11Y-01 | Human accessibility review: pending | Real device and screen-reader review; automated axe/responsive tests are not a manual audit |
| LIVE-01 | Explicitly deferred by user | Provider contracts/integrations, commercial/privacy approval, managed infrastructure, external email/alerts and sandbox UAT; see [implementation progress](../IMPLEMENTATION_STATUS.md) |
| SECURITY-01 | Independent review: pending | Security/privacy sign-off and release-specific dependency scan; no independent audit was performed |

No live SMS, payment capture, external mail delivery or deployment was exercised.
Demo inquiry emails are checked in the database sink. No messages were sent to
Gideon, the business owner or other external contacts. All open items above must
retain their owner and disposition in the eventual release record.
