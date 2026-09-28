# Architecture

How the pieces fit together, and why they are arranged this way.

## Shape

```
                    ┌──────────────────────────────────────────┐
  browser  ────────▶│  Next.js (App Router)                    │
                    │    (public) marketing                    │
                    │    (auth)   login / signup / verify      │
                    │    (app)    customer portal              │
                    │    admin    platform console             │
                    │    api      webhooks, exports            │
                    └────────────────┬─────────────────────────┘
                                     │ server actions / route handlers
                    ┌────────────────▼─────────────────────────┐
                    │  src/server/domain  — the rules          │
                    │    phone · segments · csv · quote        │
                    │    submit · wallet · quota · suppression │
                    │    contacts · payments · exports         │
                    └────────────────┬─────────────────────────┘
                                     │ Drizzle
                    ┌────────────────▼─────────────────────────┐
                    │  PostgreSQL                              │
                    │    31 tables. Also the job queue.        │
                    └────────────────▲─────────────────────────┘
                                     │ claim with FOR UPDATE SKIP LOCKED
                    ┌────────────────┴─────────────────────────┐
                    │  worker process (npm run worker)         │
                    │    dispatch · reconcile · delivery       │
                    └────────────────┬─────────────────────────┘
                                     │ SmsProvider interface
                    ┌────────────────▼─────────────────────────┐
                    │  MockSmsProvider  |  PartnerSmsProvider   │
                    │  (scripted)       |  (throws until        │
                    │                   |   contracted)         │
                    └──────────────────────────────────────────┘
```

A modular monolith with one extra process. Splitting the web app into services
would add deployment complexity without solving a problem this product has.

## Why the queue is in PostgreSQL

Dispatch jobs live in the `dispatch_jobs` table and are claimed with
`FOR UPDATE SKIP LOCKED`. No Redis, no external broker.

The reason is transactional. When a campaign is submitted, the funds hold, the
quota hold, the campaign row, every per-recipient row and the dispatch job are
all written in **one transaction**. If any part fails, none of it happened. Push
the job to an external queue instead and you get the classic split-brain: the
transaction commits but the enqueue fails (a queued campaign nobody dispatches),
or the enqueue succeeds and the transaction rolls back (a dispatch job for a
campaign that does not exist). Neither is acceptable when money is held.

The cost is that throughput is bounded by PostgreSQL. For this volume that is
not close to a constraint, and `SKIP LOCKED` means several workers can run.

## Where the rules live

`src/server/domain/` holds the decisions. Pages and actions are thin: they
authenticate, call a domain function and render the result.

This matters because the same rules are reachable three ways — a server action,
a route handler, and the worker — and they must not drift. `reserveFunds` takes
a transaction handle rather than opening its own, so a caller composes it with
`reserveQuota` and the snapshot writes in a single transaction.

The browser recomputes some of this (segment counts, recipient validation) purely
so the customer sees a live preview. Those numbers authorize nothing.

## Request → SMS

1. **Quote** (`domain/quote.ts`). Validates the sender belongs to the
   organization and is approved, checks the message, normalizes and deduplicates
   recipients, applies the self-service ceiling *before* suppression, prices the
   result, and stores an immutable offer with an expiry.
2. **Submit** (`domain/submit.ts`). One transaction: re-verify everything (the
   organization, the sender and the opt-out list can all have changed since the
   quote), hold funds, hold quota, snapshot the campaign and each recipient,
   insert the dispatch job.
3. **Dispatch** (`jobs/dispatch.ts`). The worker claims the job, and for each
   recipient re-checks suppression immediately before submitting, moves
   `PENDING → SUBMITTING` with a compare-and-set so two workers cannot both take
   it, calls the provider, and records the outcome.
4. **Delivery** (`jobs/delivery.ts`). Receipts arrive by webhook, are verified
   against the raw body, stored before acknowledgement, and applied.

## The three states that are deliberately separate

Conflating these is the most common way an SMS product misleads its users, so
they are three columns, not one:

- **Campaign execution** — is there dispatch work left?
- **Submission** — did the provider take responsibility for this message?
- **Delivery** — did it arrive?

`FINISHED` means no work remains. It does not mean delivered. `ACCEPTED` means
the provider took it. It does not mean delivered. Delivered does not mean read.
See [STATE-MODEL.md](STATE-MODEL.md).

## UNKNOWN

When a submission times out or the transport dies, we do not know whether the
message went out. That is recorded as `UNKNOWN`, and it is neither a failure nor
a success:

- the hold stays in place — no automatic refund of an ambiguous timeout;
- it is never blindly re-sent, because a local database cannot promise
  exactly-once delivery through someone else's system;
- it is resolved by *querying* the provider, if the provider supports that;
- otherwise it waits for an operator, and the campaign stays open.

A provider may only be replayed for the same stable key if its contract
guarantees idempotency for that key. `ProviderCapabilities.guaranteesIdempotency`
exists to record that, and `PartnerSmsProvider` sets it to `false` because
nobody has told us otherwise yet.

## Money

Integer centavos throughout. `available = posted balance − holds`.

`RESERVE` and `RELEASE` move holds only. `PURCHASE`, `CHARGE`, `REFUND` and
`ADJUSTMENT` move the posted balance. Capturing a hold releases it and posts the
charge in one transaction, so the two can never be observed apart.

The ledger is append-only. Every entry carries a unique `operation_ref`, so a
retried call collides on the unique index rather than double-spending — that
index is the actual protection, not an application-level check.

## Tenancy

Every tenant-owned table has `organization_id`. The authorized scope comes from
the authenticated user's membership; a request-supplied organization id is never
trusted. The active-organization cookie only *selects* among memberships the user
already has, so tampering with it reaches nothing new.

Scoped reads live in `domain/campaigns.ts` rather than being written inline in
each page, so the pages and the isolation tests exercise the same predicate.

## Data at rest

Phone numbers are stored three ways:

| Column | What it is | Why |
|---|---|---|
| `number_encrypted` | AES-256-GCM | Reversible; needed to actually send |
| `number_hash` | Keyed HMAC-SHA-256, versioned | Dedupe and suppression matching |
| `number_masked` | `+63 917 *** 4567` | Display |

The hash is a keyed MAC, not a bare digest. A Philippine mobile number has about
10 digits of entropy; a plain SHA-256 of one is trivially reversible by
enumeration and would not be anonymisation. The key version is stored per row so
keys can be rotated.

## Modes

`APP_MODE` is read from the server environment and can never be set by a request.
`MOCK` enables seeded logins, the mail sink, demo funding and the demo payment
page; `LIVE` excludes all of them and the actions behind them refuse to run.

## Known architectural gaps

- **Exports are generated synchronously.** Fine at current limits; a large
  tenant would want them produced by the worker and fetched from object storage.
- **The mail sink is a database table.** Real delivery is a separate integration.
- **No object storage.** Uploaded CSVs are encrypted into a column. That is
  reasonable at a 5 MiB cap and would not be at a larger one.
- **Restoring a backup can resurrect deleted data.** The retention job cannot fix
  this; see [RUNBOOK.md](RUNBOOK.md).
