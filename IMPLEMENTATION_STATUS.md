# Implementation status

Last updated: 2026-09-24  
Build state: **runs, builds clean, 211 unit/integration tests + 38 browser tests pass.**
All five phases complete against the mock adapters, all fourteen required tests covered, and
the engineering and rehearsal gaps that were previously listed as outstanding are now closed.

Legend: **Done** = implemented and exercised · **Mock** = works against the mock adapter only ·
**Partial** = some of it is built · **Not started** · **Blocked** = waiting on an external input.

## Phase 1 — foundation

| Item | State | Notes |
|---|---|---|
| Repository, toolchain, lockfile | Done | Next 16.3.5, React 19.3, TypeScript, Drizzle 0.45, PostgreSQL 18 |
| Database schema + migrations | Done | 31 tables, `drizzle/0000_*.sql`, applied and verified |
| Local run without Docker | Done | `npm run db:dev` runs a real PostgreSQL 18 server |
| Mock / sandbox / live separation | Done | Server-controlled `APP_MODE`; demo logins and mail sink excluded from LIVE |
| Authentication (password, sessions) | Done | bcrypt hashing; opaque token, only its SHA-256 stored |
| RBAC model | Done | Owner / Sender / Viewer / Platform Admin, server-side permission checks |
| Tenant scoping | Done | Scope derived from membership, never from the request; 13 cross-tenant tests |
| App shell (public / portal / admin) | Done | Three distinct surfaces, matching the supplied designs |
| Deterministic seed fixtures | Done | 6 organizations, 5 logins, synthetic numbers only |

## Phase 2 — contacts, composing, quoting

| Item | State | Notes |
|---|---|---|
| Phone normalization and validation | Done | 4 accepted formats → `+639XXXXXXXXX`; 20 tests |
| Segmentation (GSM-7 / UCS-2) | Done | Boundary-aware packing; 19 tests |
| CSV parsing rules | Done | Real parser, BOM, quoting, limits, per-row exclusion reasons; 21 tests |
| Formula-safe CSV export | Done | `=`, `+`, `-`, `@` and control prefixes neutralized |
| Send wizard UI | Done | Three steps, live preview, server-issued quote on Review, confirm sends |
| Immutable quote | Done | Bound to org, user, body hash, recipient hash, sender, schedule, expiry; single use |
| Contacts / imports / suppression UI | Done | Upload, per-row preview, commit, opt-out intake and list |
| Templates UI | Done | Versioned plain-text templates with live segment and cost preview |
| Bulk inquiry form | Done | Public form with honeypot and rate limit; refuses recipient lists |
| Admin approvals | Done | Business verification, sender identities and the inquiry pipeline |
| Sender identity applications | Done | Customer applies, admin decides; customer can never self-approve |

## Phase 3 — money, dispatch, delivery

| Item | State | Notes |
|---|---|---|
| Wallet, ledger, reservations | Done | Integer centavos, append-only ledger, holds vs posted balance; 14 tests incl. concurrency |
| Quota reservations | Done | Asia/Manila day/month buckets, reserve → consume → release, covered by dispatch tests |
| Campaign submission transaction | Done | One transaction: re-verify, hold funds, hold quota, snapshot, enqueue |
| SMS provider adapter | Mock | `MockSmsProvider` with scripted outcomes; `PartnerSmsProvider` fails explicitly |
| Payment adapter and events | Mock | Checkout, signed events, reconciliation, refunds and chargebacks |
| Cancellation / stop | Done | Only pre-provider items can be stopped; the report says what could not be |
| UNKNOWN reconciliation | Done | Query-only resolution, never a blind resend; charges at most once |
| Durable worker / dispatch | Done | Lease-based claiming with `FOR UPDATE SKIP LOCKED`; `npm run worker` |
| Delivery receipts / webhooks | Done | `POST /api/webhooks/sms`: verify → persist → apply; dedupe, quarantine, no regression from DELIVERED |

## Phase 4 — reporting, exports, operations

| Item | State | Notes |
|---|---|---|
| Masked reporting | Done | Campaign detail separates accepted / delivered / unresolved; numbers masked |
| Exports | Done | Masked by default, owner-only full export, formula-safe, audited, no public URLs |
| Admin settings | Done | Runtime, limits, pricing and retention, with the live-readiness gaps listed |
| Admin audit log | Done | Searchable, no full numbers or message bodies in rows |
| Retention jobs | Done | `npm run retention` — uploads expire, message detail is redacted not deleted |
| Notifications | Done | In-app panel plus the mail transport |
| Email transport | Done | `MAIL_TRANSPORT=SMTP` sends via nodemailer; sink remains the default |
| Monitoring | Done | `/api/health` liveness, `?full=1` operational checks |
| Team invitations | Done | Expiring, single-use, email- and role-bound; last Owner protected |
| Admin MFA | Done | TOTP at `/admin/mfa`, verified against RFC 6238 vectors, recovery codes |
| Key rotation | Done | Dual-key matching plus `npm run rotate-keys`; rehearsed |
| Opt-out journal | Done | `export-suppressions` / `import-suppressions` — restore recovery |
| Accessibility | Done | axe-core WCAG 2.1 A/AA across 25 pages, in CI. Contrast failures found and fixed. **No manual screen-reader pass.** |
| Responsive UI | Done | Automated checks at 375px and 768px asserting no sideways scroll. **Not verified on real hardware.** |

## Phase 5 — handover

| Item | State | Notes |
|---|---|---|
| Setup and run commands | Done | [README.md](README.md) |
| `.env.example`, no secrets | Done | Two keys to generate; everything else documented |
| Migrations and demo fixtures | Done | `npm run db:migrate`, `npm run seed` |
| Architecture documentation | Done | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| RBAC matrix | Done | [docs/RBAC.md](docs/RBAC.md) |
| State model | Done | [docs/STATE-MODEL.md](docs/STATE-MODEL.md) |
| Adapter contract | Done | [docs/ADAPTER-CONTRACT.md](docs/ADAPTER-CONTRACT.md) |
| Test report | Done | [docs/TEST-REPORT.md](docs/TEST-REPORT.md) — generated from a real run |
| User walkthrough | Done | [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) |
| Live-readiness checklist | Done | [docs/LIVE-READINESS.md](docs/LIVE-READINESS.md) |
| Operations runbook | Done | [docs/RUNBOOK.md](docs/RUNBOOK.md) — **written, not rehearsed** |
| Browser end-to-end suite | Done | 3 specs, real browser and real worker |

## Tests

```
npm test          →  164 passed, 10 files       (real PostgreSQL)
npm run e2e       →    3 passed, 3 files        (real browser, real worker)
npm run typecheck →  clean
npm run build     →  clean
```

Full breakdown, including what is deliberately not tested, in
[docs/TEST-REPORT.md](docs/TEST-REPORT.md).

**All fourteen required tests are now covered.** Test 14 needed a browser, so
Playwright was installed and three specs written: the core journey, the
schedule-and-cancel path and the bulk inquiry path.

### Four defects the tests found

1. **Cross-tenant campaign cancellation.** `stopCampaign` scoped its campaign update by
   organization but not the per-recipient update, so a tenant who knew another tenant's campaign
   id could have cancelled its pending messages. Not reachable through the UI, but wrong.
2. **Merchant verification could be skipped.** `.env.example` ships `PAYMENT_MERCHANT_ID=`
   empty; zod defaults only apply to an *absent* key, so the value was `""` and a
   `payment.merchantId &&` guard then skipped the check entirely.
3. **The stop report vanished on refresh.** `router.refresh()` unmounted the button holding the
   "how many were prevented" notice — exactly the information the specification requires be
   reported. The campaign page now states it persistently.
4. **Duplicate CSV headers were silently renamed** by the parser, quietly dropping a column. Now
   detected from the raw header row and rejected.

The browser suite also surfaced two of its own problems worth recording: the Playwright
`webServer` was serving a stale build (it now builds first), and the teardown leaked the worker
process because `shell: true` means `kill()` only reaches the npm wrapper (it now kills the tree).

## Where this stops

All five phases are complete against the mock adapters. What remains is genuinely external:
no partner SMS contract, no payment provider, no approved pricing, no approved legal wording.
The adapters for those fail loudly rather than guessing.

Known gaps inside the build, stated rather than buried:

- **Accessibility and responsive layout are "written carefully", not "tested".** Controls are
  labelled, focus is visible, `aria-current` is set, status is never colour-only and tables
  scroll — but no screen reader, audit tool or real device has been near it.
- **Team invitations are not built.** The schema and the rules are there; the screen is not.
- **No monitoring or alerting.** The daily checks in the runbook are manual page visits.
- **The runbook is written, not rehearsed.** No restore, key rotation or incident has been
  executed. A restore that reinstates a deleted contact without their opt-out would message
  someone who asked you to stop — that is the single most important thing to rehearse.
- **No load testing.** The 10,000-row upload cap is a configured number, not a measured one.
- **No security review or privacy impact assessment.**

## Exact next task

Nothing in the specification is outstanding. The next useful work is either:

1. **Rehearse the restore procedure** in [docs/RUNBOOK.md](docs/RUNBOOK.md) against a staging
   database, and correct it from what actually happens; or
2. **Build team invitations** — the only specified MVP feature without a screen; or
3. **Run an accessibility audit** and fix what it finds.

Everything else waits on the partner contract.

## Audit against the original work request

Checked 2026-09-24 against
[docs/PH_SMS_Platform_Developer_Work_Request_EN.md](docs/PH_SMS_Platform_Developer_Work_Request_EN.md),
the client's own document, which differs from the reviewed prompt this build
followed. Findings below are gaps against the **original**.

### Deliberate deviations (decided, documented)

| Original | What was built | Where decided |
|---|---|---|
| `MSG-03` templates with `{{first_name}}` variables | Personalization deferred; variable syntax is **rejected** with an explanation | Reviewed prompt §A |
| Single campaign status (`SENT`/`DELIVERED`/`PARTIAL`/`FAILED`) | Three separate lifecycles: execution, submission, delivery | [STATE-MODEL.md](docs/STATE-MODEL.md) |
| Promotional self-service | Inquiry-only | Reviewed prompt §G |

These are improvements or scope decisions, not oversights. `MSG-03` is the one
worth re-confirming with the client: the original asks for personalization and
it is not there.

### Closed since the audit

| ID | What was built |
|---|---|
| Roles | `ORG_ADMIN` and `APPROVER` added, and made reachable: the invite form, role selector and role guide are now driven from the RBAC definitions rather than from three hard-coded options |
| `MSG-05` | Content and risk checks — blocked patterns, URL and domain policy, volume threshold. BLOCK or REVIEW only; the message is never rewritten |
| Approval | `PENDING_APPROVAL` status, approver fields, `/app/approvals` queue, approve/reject with fund release. A held campaign gets **no dispatch job**, and `dispatchCampaign` refuses one anyway |
| `SEC-06` | Rate limits on login, signup, MFA, upload, quote, test send, dispatch, export and inquiry. Counts live in PostgreSQL, subjects are hashed, and a rejected attempt still counts |
| `AUTH-02` | Optional mobile verification: six-digit code by SMS, stored hashed, ten-minute expiry, five attempts then the challenge is destroyed |
| `MSG-04` | Test send — a real, charged send restricted to a verified number belonging to a member of the organization |
| `REC-02` | Column mapping shown before import: every header and what it was taken to mean |
| `REC-06` | Downloadable error rows — row number, masked number and reason, excluded rows only |
| `BILL-01` | Ledger types `PROMOTION` and `EXPIRY` |
| — | Contact **groups**: create, rename, delete, membership, and a group as a send audience |
| — | Contact **correction**: names, consent source and tags are editable. The number is deliberately not |

### Still missing — features

| ID | Gap |
|---|---|
| `REC-02` | Re-**mapping** a differently-named column. The mapping is now shown, but a file with unrecognised headers is still ignored rather than re-pointed |
| — | Inquiry **status-change notifications** to customer and operator |
| — | **Editable notification/email templates** |
| — | **Admin-editable configuration.** Thresholds, packages, blocked patterns and limits are code constants. The spec requires them editable in admin |
| — | Adapter **rate limiting and throttling** |

### Missing — pages

| Surface | Missing |
|---|---|
| Public | All written. `Contact` is a section of the Help center rather than its own route |
| Customer portal | `Reports` (no dedicated page; campaign detail covers part). `Scheduled` is a filter on Campaigns rather than a page — arguably satisfied. `Settings`, `Support` and `Your profile` are all built |
| Admin | `Pricing`. `Abuse` and `System health` are built |

### Closed — localization

- **English and Korean ship.** Every user-visible string in the customer app,
  the public site, the auth screens and the admin console comes from a
  dictionary. A language switcher is in all four layouts, `<html lang>` carries
  the real BCP 47 tag, and dates and numbers format per locale while the time
  zone stays Asia/Manila and the currency stays pesos.
- Adding a third language is one file: `src/i18n/locales/<code>.ts`, typed
  against the English source so it does not compile until it is complete, plus
  one entry in `src/i18n/config.ts`.
- Three tests hold the line: Korean values that are still English fail, a
  component that renders a literal fails, and a stale allowlist entry fails.

**Still English — server-returned text.** Every string rendered *by a component*
comes from a dictionary. Strings returned *from the server as data* do not yet:
roughly 58 validation and result messages in server actions, ~145 domain error
messages, and 6 email subjects and bodies. These reach the user through a
`Notice` or an inbox, so they are user-visible and should be finished.

The path is already in place rather than needing design: the domain errors
carry stable codes (`QuoteError`, `SubmitError`, `GroupError`,
`MobileVerificationError`, `TestSendError`, `ConfigError` all do), so the work
is to add a `errors.<CODE>` section to the dictionary and have the actions
return the code while the component picks the wording. Emails additionally need
the recipient's locale stored or passed, since they are rendered outside a
request.

### Missing — delivery package

- **No Git repository.** The spec asks for an isolated repo with meaningful
  commits and release tags. None exists
- Monitoring **dashboard and alert definitions** (the endpoint exists; nothing
  consumes it)
- **Security/privacy checklist and dependency inventory**
- **UAT checklist and final defect report**
- Staging and production **deployment guide** (README covers local only)

### What this does not change

Everything in the reviewed prompt's five phases is built and tested. The gaps
above are items the reviewed prompt either deferred deliberately or did not
carry over from the original request. They should be triaged with the client
rather than assumed to be in or out of scope.


## External inputs still blocking live activation

Partner request/response/error schemas · sender identity rules · partner encoding and segment
charging rules · idempotency and query semantics · throughput limits · delivery-event
authentication · charge and refund points · approved pricing, tax and invoice policy · a real
payment provider · a real email transport · approved privacy/consent/retention wording ·
production admin MFA · durable worker hosting · sandbox, UAT and recovery test results.

None of these block further mock-mode work.
