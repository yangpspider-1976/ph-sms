# Implementation decisions

Decisions that were not already settled by the specification, and why.

## Stack

**Next.js 16 (App Router) + TypeScript + PostgreSQL 18 + Drizzle.** The repository was empty, so
this follows the specification's default for a new project. A modular monolith with a separate
worker process, not separate services.

**Drizzle over Prisma.** Migrations are plain SQL that can be reviewed, and the query builder
exposes `FOR UPDATE` and `SKIP LOCKED` directly — both are needed for the money and dispatch
paths rather than being worked around.

## Running without Docker

The target machine has neither Docker nor PostgreSQL. `docker-compose.yml` is the documented
primary path; `npm run db:dev` runs a real PostgreSQL 18 server from the `embedded-postgres`
package as a **dev-only** fallback.

That package has no stable release (alpha/beta only). It is a `devDependency`, is never imported
by application code, and only launches a server — the application talks to an ordinary
`DATABASE_URL`. The alternative, PGlite, is single-connection, which would have made the
concurrency tests untestable. Those tests are a specification requirement, so a real
multi-connection server won.

## Hosting on Vercel

**Dispatch runs where requests run, not in a worker.** Vercel cannot keep `npm run worker` alive.
On the Hobby plan its cron runs at most once a day. So dispatch happens in three places, all
through the worker's own claim, `runNextJob`: right after a send or approval responds (`after()`),
from `/api/cron/dispatch` every five minutes by GitHub Actions, and from a daily Vercel Cron.
The lease and `SKIP LOCKED` already made concurrent workers safe, so none of this needed new
coordination.

**A serverless run stops between messages, not during one.** A function killed after
`PENDING → SUBMITTING` but before the outcome is written strands that message for an operator.
`dispatchCampaign` takes a deadline and stops before starting the next message. The rest stay
`PENDING`, and the job is claimed again when its lease lapses.

**The after-response dispatch is off unless running on Vercel.** Locally, and in the browser
tests, dispatch is still a separate process. Tests that let the web process send would stop
showing that the worker works.

**Production builds migrate. Previews do not, unless told their database is their own.** A
preview built from an unmerged branch must not change the production schema.

**Singapore (`sin1`).** It is the closest Vercel region to Manila with a matching Neon region,
and the database has to be near the functions more than near the users.

## Authentication

Password hashing uses `bcryptjs`; sessions are opaque 32-byte random tokens with only their
SHA-256 stored. No authentication framework was adopted: Lucia is deprecated in favour of exactly
this pattern, and Auth.js's credentials provider does not support database sessions well. This
uses standard primitives from `node:crypto` and a maintained hashing library — it is not a
home-made crypto scheme, which is what the specification prohibits.

## Deviations from the supplied designs

- **Three-step wizard, not five.** The design shows Recipients → Message → Review; the
  specification lists five steps including Timing and Results. The designs win, as instructed:
  timing sits inside the Message step, and results are the campaign detail page.
- **"PH SMS", not "FirstG SMS".** The designs use PH SMS throughout. The name is a single
  constant in `src/components/brand.tsx` and remains configurable.
- **One seeded campaign detail line changed.** The design shows "Customer promo announcement"
  against a self-service scheduled campaign. Promotional sending is inquiry-only in the MVP, so
  seeding that would contradict a rule the code enforces. The campaign name is unchanged; the
  detail line reads "Customer update announcement" and the campaign's purpose is INFORMATIONAL.
- **Demo marker wording.** The designs show "Design preview • Sample content"; the specification
  requires a visible "Demo — no real SMS or payments". Both appear in one line.

## Domain choices

**Landline checked before length.** `0281234567` is both a landline and nine digits. The prefix
check runs first so the user is told "not a Philippine mobile number" rather than "too few
digits" — both are true, one is useful.

**Duplicate CSV headers are read from the raw header row.** With `header: true` the parser
silently renames a repeated column to `name_1`, which would quietly drop a column instead of
reporting the problem.

**Numbers are stored three ways.** AES-256-GCM ciphertext (needed to send), a keyed HMAC (dedupe
and suppression matching), and a display mask. A keyed MAC, not a bare digest: a phone number has
too little entropy for a plain hash to be anonymisation. The key version is stored per row so
keys can be rotated.

**Segment packing is boundary-aware.** A GSM escape pair or a surrogate pair moves whole to the
next segment rather than straddling it, so the count is not simply `ceil(units / limit)`. There
is a test for the case where the two differ.

**`available = posted balance − holds`.** `RESERVE`/`RELEASE` move holds only; `PURCHASE`,
`CHARGE`, `REFUND` and `ADJUSTMENT` move the posted balance. Capturing a hold releases it and
posts the charge in one transaction, so the two can never be observed apart.

**A chargeback beyond remaining funds records debt and freezes sending** rather than clamping the
balance at zero, which would hide the deficit.

**A test send is a real send, restricted by who owns the number.** A test is priced, charged,
dispatched and delivered through exactly the same path as any other message — a test that took a
shortcut would not be testing what the customer is about to do. It may go only to a mobile number
a member of the organization has verified by receiving a code on it. Without that restriction a
"test" is just an unreviewed send to any number the sender cares to type, and the self-service
ceiling and content rules become optional.

**A review-flagged message can still be tested to the sender's own handset.** MSG-05 says flagged
jobs cannot bypass required review, and the campaign that reaches the public is held exactly as
before. The test send is not that campaign: it reaches one verified number belonging to a member
of the sending organization, so holding it protects nobody while making it impossible for the
sender to see the message they are being asked to fix. Content that is *blocked* is still blocked,
for tests as for everything else. If the client would rather hold tests too, this is a one-line
change in `issueQuote`.

**Mobile verification is optional.** Nothing about ordinary sending depends on it; a user who
declines simply cannot use the test-send shortcut. Codes are six digits, stored only as a hash,
valid for ten minutes, and limited to five guesses — after which the challenge is destroyed rather
than left open. The attempt counter is committed before the error is raised, because an increment
inside a transaction that then throws is rolled back with it, and the limit would silently do
nothing.

**A credential limit counts failures; a resource limit counts attempts.** Sign-in and two-factor
verification check the limit without recording, and record only when the attempt turns out to be
wrong — a correct password clears the counter. Counting successes would lock out the person who
signed in ten times today and would do nothing to an attacker, who is failing every time either
way. Quotes, uploads, exports, test sends and dispatches use the other primitive, which records
every attempt, because there each attempt costs something whether or not it succeeds.

The browser tests found this: nineteen legitimate parallel sign-ins tripped a limit meant for
credential guessing.

**A rate limit that cannot identify the client is skipped, not shared.** Limits are keyed per
account, per organization or per client address. When a deployment does not pass
`x-forwarded-for`, the per-client key is unavailable — and bucketing every such request under one
placeholder would not limit per client, it would limit the platform: ten failed sign-ins from
anyone would lock out everyone. So the per-client check is skipped and the per-account check, which
is the one that actually defends a specific account, still applies. A deployment that wants the
per-client limit has to pass the header from its proxy.

This was found by the browser tests, which log in many times from one machine with no proxy header
and were locked out by it.

## Localization

**A dictionary is a typed object, not a key lookup.** `en.ts` is the source; every other locale is
typed against it, so a missing or misspelled key is a compile error rather than a blank space on a
customer's screen. A runtime `t("some.key")` lookup would let an untranslated screen ship and show
a raw key to whoever found it first.

**Anything that varies with a value is a function, not a template.** `remainingToday(n)` rather
than `"{n} remaining today"`. Word order, pluralisation and counter words differ between languages,
and a function lets each locale write its own sentence instead of filling slots in an English one.
A test calls every one of them and fails if a translation takes fewer arguments than the source,
because that silently drops a value out of the sentence.

**Locale lives in a cookie, not the URL.** That keeps the existing route structure intact and works
identically for the marketing site and the signed-in app. The cost is that pages which were static
are now rendered per request; the benefit is that adding a language touched no routing at all. If
per-language URLs are needed for search indexing, a `[locale]` segment can be layered on top
without changing a single string.

**An explicit choice outranks the browser.** `Accept-Language` decides for a first-time visitor, so
a Korean speaker gets Korean without hunting for the switcher; once someone picks a language, their
browser preference stops overriding it.

**The time zone and the currency do not follow the locale.** Every timestamp a customer sees is
Asia/Manila and every amount is pesos. A Korean reader gets Korean date order and digit grouping,
but showing them a Seoul time for a Manila send would be worse than useless.

**Three tests keep it honest.** One fails if a Korean value is still the English string; one fails
if a component renders a literal instead of reading the dictionary; one fails if the allowlist for
that check outlives the line it excused.

## Testing

Domain rules are unit-tested; money and concurrency are tested against a real PostgreSQL database
with genuinely parallel transactions, because a mocked database cannot demonstrate that two
competing sends fail to overspend a wallet.

Browser tests run against a production build on its own port and database, with the dispatch
worker running as a separate process. Dispatch *is* a separate process in this architecture, and
a browser test that skipped it would be testing a screen rather than the system.

Fixtures use the synthetic `+63917 0xxxxxx` block only. No test sends to a real number.

**A demo shortcut for sender approval exists** (`approveSenderForDemoAction`). A single person
can then walk the whole flow in mock mode without a second admin login. It is excluded from LIVE,
the action refuses to run there, and it writes the same status field the real admin decision
writes — a shortcut through the queue, not around the rule.

## Not decided here

Live pricing, tax treatment, refund rules, retention periods and legal wording are configuration
and business decisions. The code carries provisional demo values, labels them as such, and
`liveConfigGaps()` refuses to treat them as approved live configuration.
