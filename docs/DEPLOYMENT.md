# Deploying to Vercel

How to run this on Vercel's **Hobby** plan in **MOCK** mode. That makes it a
hosted demo: no SMS is sent and no payment is taken. For what a live
deployment still needs, see [LIVE-READINESS.md](LIVE-READINESS.md).

## What changes on Vercel

Vercel runs request-driven functions. It cannot keep a process running, so the
two processes the [runbook](RUNBOOK.md) calls mandatory are replaced:

| Locally | On Vercel |
|---|---|
| `npm run start` | Vercel functions, region `sin1` (Singapore) |
| `npm run worker` | **Send now:** dispatched by the web function right after it responds (`DISPATCH_AFTER_RESPONSE`, on by default under Vercel)<br>**Scheduled sends and retries:** drained after signed-in page views in the portal and admin console (same flag, at most once per 30 seconds per instance), and by `/api/cron/dispatch`, called by [a GitHub Actions schedule](../.github/workflows/dispatch.yml), plus a daily Vercel Cron sweep as a backstop |
| `npm run retention`, daily | Vercel Cron → `/api/cron/retention`, 19:00 UTC (03:00 Asia/Manila) |
| `npm run db:migrate` | Runs automatically in production builds, before `next build` ([scripts/vercel-build.mjs](../scripts/vercel-build.mjs)) |
| Docker / `npm run db:dev` | Managed PostgreSQL. Neon in Singapore is assumed below |

Every dispatch path claims jobs with the worker's lease and `SKIP LOCKED`, so
they can overlap safely. Each one stops starting new messages before
Vercel's 300-second function limit, and the next call carries on from there.

## 1. Create the database

In the Vercel dashboard: **Storage → Create Database → Neon**. Choose the
**AWS Asia Pacific (Singapore)** region so it sits next to the functions. Every
page runs several queries, so a database on another continent makes the whole
app slow. Connect it to the project for Production and Preview.

The integration provides two connection strings, and both get used:

- `DATABASE_URL` is the pooled connection the app uses. The client already
  disables prepared statements, which transaction-mode pooling requires.
- `DATABASE_URL_UNPOOLED` is the direct connection, used by migrations.

Any PostgreSQL 15+ provider works if you set those two variables yourself.

**Preview deployments** use the Preview environment's database. If that is the
production database, previews read and write production data, and they are not
migrated. Better: enable Neon's *create a branch for each preview deployment*
and set `MIGRATE_PREVIEWS=true` for the Preview environment only.

## 2. Create the project

**Add New → Project**, import the GitHub repository. Framework, build command,
region, Fluid compute and cron jobs all come from [vercel.json](../vercel.json).
The Node version (24) comes from `engines` in `package.json`.

## 3. Set environment variables

Under **Settings → Environment Variables**. Mark the secrets *Sensitive*.

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Set by the Neon integration | |
| `APP_MODE` | `MOCK` | |
| `SUPPRESSION_HMAC_KEY` | Generate, see below | **Must not be lost or changed casually.** Stored opt-outs only match under the key that made them. Keep a copy in a password manager. Change it only through the rotation procedure in [RUNBOOK.md](RUNBOOK.md) |
| `DATA_ENCRYPTION_KEY` | Generate | Same warning: stored numbers cannot be decrypted without it |
| `CRON_SECRET` | Generate | Vercel Cron sends it automatically. Without it, `/api/cron/*` refuses every call |
| `APP_BASE_URL` | `https://<your production domain>` | Only used in real outgoing mail, but the readiness report flags `localhost` |

Leave everything else unset. The defaults are the mock providers and the mail
sink. Do not set `DISPATCH_AFTER_RESPONSE`: it is on under Vercel by default.

Use fresh values for production, not the ones in your `.env.local`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # each key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # CRON_SECRET
```

## 4. Deploy

Push to `main`, or press **Deploy**. The production build applies migrations
first. If a migration fails, the build fails and nothing changes.

## 5. Load the demo data

The demo logins and sample campaigns come from `npm run seed`, run from your
machine against the production database.

> **`npm run seed` truncates every table first.** Run it on first setup, or
> when you mean to reset the demo, and never against a database holding
> anything you want to keep.

It has to use the **production keys**. The seed encrypts and hashes the demo
numbers, and data written under your local keys cannot be read by the deployed
app. Variables set in the shell take precedence over `.env.local`:

```powershell
# PowerShell
$env:DATABASE_URL = "<DATABASE_URL_UNPOOLED from Vercel>"
$env:SUPPRESSION_HMAC_KEY = "<production value>"
$env:DATA_ENCRYPTION_KEY = "<production value>"
npm run seed
Remove-Item Env:DATABASE_URL, Env:SUPPRESSION_HMAC_KEY, Env:DATA_ENCRYPTION_KEY
```

## 6. Turn on the dispatch schedule

In the GitHub repository, open **Settings → Secrets and variables → Actions**:

- **Variables** → `APP_URL` = `https://<your production domain>`
- **Secrets** → `CRON_SECRET` = the same value as in Vercel

Then open **Actions → Dispatch due SMS jobs → Run workflow** once to check it.
Until both values exist, the workflow logs a notice and does nothing.

## 7. Check it

- `https://<domain>/api/health` returns `{"status":"ok"}`.
- Sign in as `owner@demo.test` / `DemoPass123!`, send to `+63 917 000 0001`.
  The campaign shows *Accepted by provider* within a few seconds.
- Schedule a send a few minutes ahead. Once that time has passed, open the
  campaign: the page view starts the dispatch, and the page refreshes itself
  until the message shows *Accepted by provider*.
- `curl -H "Authorization: Bearer <CRON_SECRET>" https://<domain>/api/cron/dispatch`
  returns `{"ok":true,"ran":0}`, and returns 401 without the header.

## What Hobby costs

These are accepted for a demo. They are not acceptable for a live service.

- **Scheduled sends wait for someone to use the site.** GitHub runs schedules
  on a best-effort basis, and this repository's five-minute schedule has run
  every three to seven hours in practice (20 runs from 28 September to
  2 October 2026). So due work is also drained after signed-in page views:
  scheduled sends and transient-failure retries (numbers ending `9003`) go out
  within seconds of anyone opening the portal or admin console. With nobody
  signed in they wait for the next GitHub run, and the daily Vercel Cron run is
  the floor.
- **GitHub disables the schedule after 60 days without repository activity.**
  You get an email. Re-enable it from the Actions tab.
- **The health check reports the worker as failing between runs.**
  `dispatch_worker` fails once a due job has waited 120 seconds, which is
  routine here. Do not page on it on Hobby.
- **Uploads are limited to 4 MiB.** Contact imports go through a server action,
  and Vercel refuses a request body over 4.5 MB before the app sees it. The
  import cap is 4 MiB (the 10,000-row cap is usually reached first) and
  `serverActions.bodySizeLimit` in `next.config.ts` is raised to match — Next.js
  would otherwise stop at 1 MB. Anything larger needs uploads to go directly to
  object storage.
- **Hobby is for non-commercial use** under Vercel's terms.

## Stopping all sending

There is no worker process to stop. To halt dispatch:

1. GitHub **Actions → Dispatch due SMS jobs → ⋯ → Disable workflow**.
2. In Vercel, set `DISPATCH_AFTER_RESPONSE=false` (this also stops the
   page-view drain) and **delete** `CRON_SECRET`.
   Changing it would not work, because Vercel Cron sends whatever value is
   current.
3. **Redeploy.** Environment changes only reach new deployments.

Queued campaigns keep their holds, and nothing is lost. To resume, reverse the
three steps.

**Instant Rollback in Vercel does not roll back migrations.** Keep migrations
additive so the previous deployment still works against the new schema.

## Moving off Hobby

Either option keeps the dispatch after "send now", which works alongside both.

- **Vercel Pro.** In `vercel.json`, change the dispatch cron's schedule to
  `* * * * *` and delete `.github/workflows/dispatch.yml`. Scheduled sends then
  go out within a minute, and the health check's 120-second threshold holds.
- **A real worker.** Run `npm run worker` on a host that keeps a process alive
  (Railway, Fly.io, Render and similar), against the same `DATABASE_URL`. This
  is the architecture the runbook describes. Workers coordinate through the
  database, so it can run next to the Vercel crons.
