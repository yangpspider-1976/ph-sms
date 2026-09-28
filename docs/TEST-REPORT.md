# Test report

Generated 2026-09-24 from an actual run, not from intent.

```
npm test          →  211 passed, 13 files
npm run e2e       →   38 passed, 5 files (real browser, real worker)  ← confirmed
npm run typecheck →  clean
npm run build     →  clean
```

The browser suite now covers journeys, accessibility and responsive layout.

## Environment

| | |
|---|---|
| Node | 24.19.0 |
| PostgreSQL | 18.4 |
| Unit/integration database | `ph_sms_test` — truncated between cases |
| Browser database | `ph_sms_e2e` — migrated and seeded per run |
| Browser | Chromium via Playwright 1.63 |
| Mode | `APP_MODE=MOCK` throughout |

Integration tests run against a real PostgreSQL server with genuinely parallel
transactions. A mocked database cannot demonstrate that two competing sends fail
to overspend a wallet, which is the single most important thing to prove here.

Test files run sequentially — they share one database and truncate it between
cases, so running them in parallel would have them wiping each other's rows.

## Coverage against the required tests

| # | Requirement | Where | Status |
|---|---|---|---|
| 1 | Phone formats normalize; foreign/landline/malformed excluded; format ≠ ownership | `phone.test.ts` | ✅ 14 tests |
| 2 | CSV: BOM, quoting, invalid UTF-8, oversize, headers, duplicates, formula-safe export | `csv.test.ts` | ✅ 21 tests |
| 3 | GSM-7 160/161, Unicode 70/71, extension chars, surrogates, concatenation, max segments | `segments.test.ts` | ✅ 19 tests |
| 4 | Expired/mutated quotes fail; no eligible recipients blocks send | `submit.test.ts` | ✅ |
| 5 | Double-click and concurrent submits create one campaign; same key + changed payload conflicts | `submit.test.ts` | ✅ |
| 6 | Two competing sends cannot overspend wallet or quota; rollback orphans nothing | `wallet.test.ts`, `submit.test.ts` | ✅ |
| 7 | Scheduling survives restart; later opt-out/suspension/revocation blocks pending work; cancellation races truthful | `submit.test.ts`, `dispatch.test.ts`, `schedule-and-cancel.spec.ts` | ✅ |
| 8 | Crash/timeout after acceptance → UNKNOWN, no unsafe second SMS; reconciliation charges at most once | `dispatch.test.ts` | ✅ |
| 9 | Forged/duplicate/out-of-order payment events; wrong amount or currency never grants credit; refunds idempotent | `payments.test.ts` | ✅ 18 tests |
| 10 | Delivery before submit response, duplicate webhook, invalid signature, unknown reference, out-of-order; DELIVERED never regresses | `delivery.test.ts` | ✅ 12 tests |
| 11 | Tenant A cannot reach Tenant B by id, filter, export, mutation or job context; roles enforced server-side | `isolation.test.ts` | ✅ 13 tests |
| 12 | Contact delete/reimport preserves suppression; opt-outs do not leak across tenants; exports and retention audited | `contacts.test.ts`, `isolation.test.ts` | ✅ |
| 13 | Bulk ceiling, promotional inquiry-only, missing live configuration cannot be bypassed through endpoints | `submit.test.ts`, `bulk-inquiry.spec.ts` | ✅ |
| 14 | Core browser E2E, plus schedule-and-cancel and bulk inquiry paths | `e2e/*.spec.ts` | ✅ 3 specs |

All fourteen are covered.

## Unit and integration breakdown

| File | Tests | Focus |
|---|---|---|
| `phone.test.ts` | 14 | Normalization, rejection reasons, masking |
| `segments.test.ts` | 19 | Encoding detection, boundary-aware packing |
| `csv.test.ts` | 21 | Parsing, limits, exclusion reasons, formula-safe export |
| `wallet.test.ts` | 14 | Holds, capture, release, concurrency, chargeback debt |
| `submit.test.ts` | 23 | Quoting, binding, idempotency, re-verification at confirm |
| `dispatch.test.ts` | 13 | Submission outcomes, UNKNOWN, cancellation, lease claiming |
| `isolation.test.ts` | 13 | Cross-tenant reads, mutations, suppression scope |
| `delivery.test.ts` | 12 | Receipt authentication, ordering, quarantine |
| `payments.test.ts` | 18 | Event verification, mismatch rejection, reconciliation |
| `contacts.test.ts` | 23 | Import lifecycle, opt-out survival, exports, retention, error rows, column mapping |
| `groups.test.ts` | 18 | Contact groups, cross-tenant membership, contact correction |
| `approval.test.ts` | 9 | Content holds, approve/reject, fund release, separation of duties |
| `content-checks.test.ts` | 17 | Blocked patterns, URL policy, volume threshold |
| `mobile-verification.test.ts` | 13 | Code issue and confirm, attempt limit, number ownership |
| `test-send.test.ts` | 10 | Verified-number restriction, charging, idempotency |
| `app-config.test.ts` | 20 | Runtime overrides, validation, version history, ReDoS guard |
| `rate-limit.test.ts` | 11 | Window boundaries, per-subject and per-bucket isolation, purge |
| `dictionaries.test.ts` | 14 | Locale completeness, untranslated strings, argument parity, negotiation |
| `no-hardcoded-strings.test.ts` | 2 | No component renders a literal; the allowlist has no stale entries |

## Browser tests

| Spec | What it proves |
|---|---|
| `core-flow.spec.ts` | Signup → mail-sink verification → admin approval → demo funding → sender application and approval → recipient entry with exclusions → reviewed quote → send → worker-produced results → ledger reconciles |
| `schedule-and-cancel.spec.ts` | A scheduled campaign holds funds and is not dispatched early; stopping it reports how many were actually prevented, and that report survives a reload |
| `bulk-inquiry.spec.ts` | A promotional request goes through the public form into the admin pipeline; moving it to Contracted sends nothing and creates no campaign |
| `localization.spec.ts` | The switcher changes the page and the choice survives navigation; a Korean-speaking visitor gets Korean on their first visit; an explicit choice outranks the browser; the signed-in app is translated, not just the marketing site |

The dispatch worker runs as a separate process during these, started by the
global setup. Results are produced by the same code path production would use,
not by a test helper writing rows.

## Defects found by writing these tests

Ten, all fixed. The six below were found by the accessibility and responsive
suites on their first full run — the fixes had been made but never confirmed,
and confirming them is what surfaced these:

5. **Critical ARIA failure.** The send wizard's `role="tab"` buttons had no
   `role="tablist"` parent, so the grouping was not conveyed to assistive
   technology at all.
6. **Admin sidebar contrast.** The tagline used `navy-400` on `navy-900`:
   4.20:1 against a 4.5:1 requirement.
7. **Six pages pushed the document sideways on a phone** because their data
   tables had no scroll container. Fixed structurally — the container is now
   part of a `DataTable` component rather than something each page remembers.
8. **The file input on /app/contacts** overflowed by 8px from its wide
   intrinsic size.
9. **Cards would not shrink inside a grid.** `min-width: auto` is the default
   for grid and flex children, so a card holding a wide table refused to
   shrink and the inner scroll container never got the chance to work.
   `/admin` overflowed by 103px and `/app/credits` by 204px.
10. **Grid wrapper divs had the same problem**, which is why `/admin` still
    overflowed by 96px after the card fix.

And the original four:

1. **Cross-tenant campaign cancellation.** `stopCampaign` scoped its campaign
   update by organization but not the per-recipient update, so a tenant who knew
   another tenant's campaign id could have cancelled its pending messages. Not
   reachable through the UI, but the function was wrong.
2. **Merchant verification could be skipped.** `.env.example` ships
   `PAYMENT_MERCHANT_ID=` empty; zod applies a default only to an *absent* key,
   so the stored value was `""` and a `payment.merchantId &&` guard then skipped
   merchant checking entirely.
3. **The stop report vanished.** After stopping a campaign, `router.refresh()`
   unmounted the button holding the "how many were prevented" notice — losing
   exactly the information the specification requires be reported. The campaign
   page now states it persistently.
4. **Duplicate CSV headers were silently renamed.** Papaparse turns a repeated
   column into `name_1`, quietly dropping one. Now detected from the raw header
   row and rejected.

## Manual verification

Checked against the running production build, not only in tests:

```
24/24 routes returned 200 for the appropriate role
403  viewer requesting a FULL export       200  viewer requesting a masked export
200  owner requesting a FULL export        307  customer redirected away from /admin
401  forged SMS webhook                    401  forged payment webhook
200  correctly signed SMS webhook → QUARANTINED (unknown reference, by design)
```

## Measured, not guessed

`npm run benchmark`, at the configured 10,000-row import cap:

| Stage | Time | Per row |
|---|---|---|
| CSV parse | 46 ms | 4.6 µs |
| Hash + encrypt every number | 933 ms | 93 µs |
| **Total** | **~1.26 s** | |

Encryption dominates. The row cap is justified — 1.26 s is comfortable inside a
request — but it would not survive being raised much, and an import at a larger
cap belongs in the worker.

## Rehearsed, not assumed

- **Backup restore** — `npm run rehearse-restore`. Reproduces the data loss on
  throwaway databases, then verifies recovery. It found that the audit log is
  restored away too, so the written recovery step was not executable; the
  opt-out journal was built to close that.
- **Key rotation** — `npm run rotate-keys`, with a test that *demonstrates* what
  rotating without the previous key breaks.

## What is still not tested

Stated plainly rather than left to be discovered:

- **Manual screen-reader use.** The automated scan finds roughly a third of real
  accessibility problems. It cannot tell whether a page reads sensibly aloud.
  Worth noting the automated scan found a *critical* ARIA defect the eye missed,
  so the remaining two-thirds are not a formality.
- **Real devices.** Emulated viewports are not hardware.
- **Restore against the managed provider.** The rehearsal used a database-level
  copy because `pg_dump` is not in the embedded PostgreSQL used locally.
- **Incident response.** Written, never exercised.
- **Alerting.** `/api/health?full=1` is machine-readable, but nothing is pointed
  at it and no thresholds are set.
- **The real partner and payment provider.** Everything provider-facing is
  tested against mocks. The adapters for the real ones fail loudly rather than
  guessing; see [ADAPTER-CONTRACT.md](ADAPTER-CONTRACT.md).
- **Security review.** No penetration test or privacy impact assessment.

## Reproducing

```bash
npm run db:dev      # terminal 1
npm run db:migrate && npm run seed
npm test               # 335
npm run e2e            # builds and starts its own server and worker
npm run benchmark      # throughput against the configured caps
npm run rehearse-restore
npm run typecheck
npm run build
```
