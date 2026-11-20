# Staging deployment guide

Prepared 2026-11-17. This is a procedure for a future isolated staging
environment. No environment was provisioned and no deployment was performed as
part of the feature completion work.

## Environment boundary

Use a separate project, database, encryption/HMAC keys and hostname from both
development and production. Start with `APP_MODE=MOCK`, `MAIL_TRANSPORT=SINK`,
synthetic recipients and demo payments. Never attach a preview to a production
database. Do not use real customer exports as seed data.

Use Node 24.x (the package engine), a UTF-8 PostgreSQL database and a checkout of
the exact revision being tested. Confirm database encoding with
`SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = current_database();`.
WIN1252 cannot store Korean: migrate data into a separately created UTF-8 database
under a reviewed backup plan; never reset a database containing user work.

## Prepare and verify

1. Install the lockfile with `npm ci`.
2. Copy the variable names from `.env.example` into the hosting secret store.
   Set `DATABASE_URL` to staging and `DATABASE_URL_UNPOOLED` to its direct
   migration connection where needed. Generate independent 32-byte keys for
   `DATA_ENCRYPTION_KEY` and `SUPPRESSION_HMAC_KEY`. Set `APP_BASE_URL` to staging.
3. Keep partner/payment credentials absent and `MAIL_TRANSPORT=SINK`. Set an
   independent `CRON_SECRET` only if testing authenticated cron routes.
4. Back up the staging database before `npm run db:migrate`. Review the generated
   migration; this release adds localized email templates, inquiry locale,
   encrypted personalized snapshots and provider pacing state.
5. Run `npm run seed` **only against the disposable staging database**. It resets
   demo fixtures and is not an upgrade command for an existing customer database.
6. Run `npm run typecheck`, `npm test` and `npm run e2e` with separate
   `TEST_DATABASE_URL` and `E2E_DATABASE_URL`. Those databases are reset by tests.
7. Build with `npm run build`; serve with `npm start` and run `npm run worker`
   as a separate supervised process. For an isolated Vercel mock demo, follow
   [DEPLOYMENT.md](DEPLOYMENT.md); page visits or best-effort schedules do not
   establish a production dispatch guarantee.
8. Verify `/api/health`, `/admin/health`, worker processing, a future Manila-time
   send, cancellation, Korean downloads, pricing changes, email templates and
   promotional/personalized sends. Follow [UAT-CHECKLIST.md](UAT-CHECKLIST.md).
9. Capture revision, migration IDs, configuration versions, test output, defects
   and reviewer decisions. Follow [MONITORING.md](MONITORING.md) for alert checks.

## Recovery and rollback rehearsal

Before testing a rollback, pause dispatch and stop new submissions. Back up both
the database and opt-out journal. Deploy the previously reviewed application
revision only after verifying its schema compatibility. Added nullable columns
and tables should normally remain in place during application rollback; do not
drop snapshots or undo ledger data to make an old build fit.

For a database restore, follow [RUNBOOK.md](RUNBOOK.md), including reapplying
every opt-out since the backup, reconciling in-flight/UNKNOWN submissions and
checking ledger/reservation totals before restarting the worker. Record a real
restore result against the selected managed provider; local test results do not
prove that provider's recovery procedure.

## Later sandbox/live phase

Only after partner contracts and approvals arrive should a separate task
implement and validate `PARTNER_SANDBOX` integrations. The existing partner
adapter deliberately refuses unconfigured requests. Live credentials, paid
services, production alerts, real mail, payment capture and production activation
remain outside this implementation. See [LIVE-READINESS.md](LIVE-READINESS.md).
