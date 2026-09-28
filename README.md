# PH SMS

Business SMS to Philippine mobile numbers, for verified businesses.

**This build runs in mock mode. No SMS is sent and no payment is taken.**

| Document | What it covers |
|---|---|
| [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) | Exactly what is built, mocked, deferred or externally blocked |
| [DECISIONS.md](DECISIONS.md) | Choices made and why |
| [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) | **Start here** — a guided tour of the running app |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the pieces fit together |
| [docs/STATE-MODEL.md](docs/STATE-MODEL.md) | The three lifecycles and why they stay separate |
| [docs/RBAC.md](docs/RBAC.md) | Roles and the permission matrix |
| [docs/ADAPTER-CONTRACT.md](docs/ADAPTER-CONTRACT.md) | What the SMS partner and payment provider must supply |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Daily checks, reconciliation, incidents, restore |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deploying to Vercel, and what the Hobby plan costs |
| [docs/TEST-REPORT.md](docs/TEST-REPORT.md) | What is tested, and what is not |
| [docs/LIVE-READINESS.md](docs/LIVE-READINESS.md) | What must be true before going live |

## Requirements

Node 20+ and a PostgreSQL 15+ database.

## Setup

```bash
npm install
cp .env.example .env.local
```

Generate the two development keys and paste them into `.env.local` as
`SUPPRESSION_HMAC_KEY` and `DATA_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Database

With Docker:

```bash
docker compose up -d
# DATABASE_URL=postgres://ph_sms:ph_sms_dev@127.0.0.1:5432/ph_sms
```

Without Docker — runs a real PostgreSQL 18 server locally, development only:

```bash
npm run db:dev      # leave running in its own terminal
# DATABASE_URL=postgres://ph_sms:ph_sms_dev@127.0.0.1:54329/ph_sms
```

Then:

```bash
npm run db:migrate
npm run seed
npm run dev         # http://localhost:3000
```

## Demo logins

Password for all: `DemoPass123!` — these exist only outside `APP_MODE=LIVE`.

| Account | Role |
|---|---|
| `owner@demo.test` | Organization Owner |
| `sender@demo.test` | Sender — can send, cannot change billing or roles |
| `viewer@demo.test` | Viewer — masked reports only |
| `admin@phsms.test` | Platform Admin (`/admin`) |
| `owner@demoretail.test` | A second tenant, for checking isolation |

The login page lists them in mock mode. Verification emails are written to a database sink and
shown on `/verify-email`; nothing leaves the machine.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Unit and integration tests (needs the database running) |
| `npm run e2e` | Browser tests: journeys, accessibility, responsive layout |
| `npm run benchmark` | Measure import throughput against the configured caps |
| `npm run typecheck` | Type check only |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run seed` | Reset demo fixtures |
| `npm run db:dev` / `npm run db:reset` | Local database server / wipe it |
| `npm run worker` | Dispatch worker — run alongside `dev` to actually send |
| `npm run retention` | Apply retention windows (uploads, message detail, audit, sessions) |
| `npm run export-suppressions` | Write the opt-out journal — **store it off-database** |
| `npm run import-suppressions` | Re-apply the journal after a restore |
| `npm run rotate-keys` | Re-key stored hashes and ciphertext during a key rotation |
| `npm run rehearse-restore` | Rehearse backup/restore on throwaway databases |

Tests run against `TEST_DATABASE_URL`, a separate database, so they never touch dev data.

## Layout

```
src/
  app/
    (public)/     marketing site, pricing, legal drafts
    (auth)/       login, signup, email verification
    (app)/app/    customer portal — dashboard, send wizard
    admin/        platform admin console
  components/     design system, icons, layout
  server/
    db/           schema, migrations, seed
    domain/       phone, segments, csv, wallet, quota  <- the rules live here
    auth/         sessions, RBAC
    security/     encryption, hashing, signed tokens
```

The server is authoritative for authorization, validation, segmentation, pricing, limits and
state transitions. Anything the browser calculates is a preview.

## Sending something

With `npm run dev` and `npm run worker` both running, sign in as `owner@demo.test`, go to
**Send SMS**, paste a number and follow the wizard. The mock provider scripts its outcome from
the last four digits, which makes the awkward paths reproducible:

| Ends with | What the mock provider does |
|---|---|
| `9001` | Rejects it — unknown subscriber. The hold is released, nothing is charged. |
| `9002` | Accepts it, then drops the connection. Recorded UNKNOWN, resolved by reconciliation, charged once. |
| `9003` | Transient failure before acceptance. Safe to retry, and it is. |
| `9004` | Accepted, later reported undelivered. |
| `9005` | Accepted, no delivery receipt ever arrives. |
| anything else | Accepted and delivered. |

Use the `+63917 0xxxxxx` block for fixtures; those numbers are synthetic.

## Languages

English and Korean. The language follows, in order: an explicit choice saved in the `locale`
cookie, then the browser's `Accept-Language`, then English.

Times are always Asia/Manila and amounts are always pesos — the locale changes how a date or a
number is written, never which moment or which currency it names.

**To add a language:**

1. Copy `src/i18n/locales/en.ts` to `src/i18n/locales/<code>.ts`, rename the export and type it
   as `Dictionary`. It will not compile until every string is translated — that is deliberate.
2. Add the code to `LOCALES`, `LOCALE_NAMES` and `LOCALE_TAGS` in `src/i18n/config.ts`.
3. Add it to `DICTIONARIES` in `src/i18n/dictionaries.ts`.
4. Run `npm test` — the dictionary tests will tell you about anything still in English, any
   empty value, and any templated string whose translation dropped an argument.

Strings that vary with a value are functions, so each language writes its own sentence:

```ts
remainingToday: (n: number) => `${n} remaining today (Asia/Manila)`,
```

`npm test` also fails if a component renders a literal instead of reading the dictionary.
`node scripts/find-hardcoded-strings.mjs` prints the same report on demand.

**Not yet translated:** messages the server returns as data — validation errors from server
actions, domain error messages and email bodies. They are rendered through a `Notice` or sent to
an inbox, so a reader in Korean still sees those in English. The domain errors already carry
stable codes, so finishing this means mapping code to wording in the dictionary rather than
restructuring anything.

## Modes

`APP_MODE` is read from the environment and can never be set by a request.

- `MOCK` (default) — demo logins, mail sink and demo funding; a visible demo marker on every page.
- `PARTNER_SANDBOX` — for a partner's sandbox credentials once they exist.
- `LIVE` — requires approved pricing, policy text and real credentials. Demo affordances are
  excluded from the build.

## Health and monitoring

`GET /api/health` is liveness only — cheap enough for a load balancer.
`GET /api/health?full=1` returns the operational checks from the runbook as
machine-readable JSON: whether the worker is running, unresolved submissions,
quarantined delivery events, paused campaigns, frozen accounts, rejected
payment events and outstanding live-readiness gaps.

`failing` means the service is not working. `degraded` means someone should
look today. Nothing is pointed at it yet — that is a deployment task.

## Retention and backups

`npm run retention` applies the configured windows: uploaded files and rejected rows expire
first, message detail is *redacted rather than deleted* so campaign totals and the ledger still
reconcile, and processed provider events are dropped while quarantined ones are kept for an
operator.

Two things the job cannot do, both found by rehearsing the restore:

1. **Restoring a backup brings deleted data back**, and loses every opt-out
   recorded since the backup was taken.
2. **The audit log is restored away too**, so the database cannot tell you which
   opt-outs to re-apply.

That is what `npm run export-suppressions` is for: a journal held outside the
database, re-applied with `npm run import-suppressions` after a restore. The
full procedure is in [docs/RUNBOOK.md](docs/RUNBOOK.md).

## Deploying

Vercel, step by step: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Vercel cannot keep `npm run worker`
running, so there dispatch runs right after a send and from `/api/cron/dispatch` on a schedule.
Retention runs from `/api/cron/retention`. Production builds apply migrations first.

## Before going live

See [docs/LIVE-READINESS.md](docs/LIVE-READINESS.md). The partner API, payment provider,
approved pricing and approved legal wording are all still outstanding, and the adapters are
written to fail loudly rather than guess at a payload shape.
