# Operations runbook

Procedures for running this system.

**Backup restore and key rotation have now been rehearsed** against a real
database, and the procedures below were corrected by what those rehearsals
found — see the notes in each section. Incident response and partner failover
are still written rather than executed.

## Daily

Automated: `GET /api/health?full=1` returns all of these as machine-readable
checks. Point a monitor at it — `status: "failing"` means the service is not
working, `"degraded"` means someone should look today.

| Check | Where | What is wrong if… |
|---|---|---|
| Worker is running | `/api/health?full=1` | `dispatch_worker` is failing: jobs are due and unclaimed. Campaigns are accepted and money held, but nothing is sent |
| Unresolved submissions | `/admin/activity` | Anything above zero for more than an hour — see *Reconciling UNKNOWN* |
| Quarantined delivery events | `/admin/activity` | Above zero means receipts arriving for messages we cannot match |
| Paused campaigns | `/admin/activity` | A campaign paused for review needs a decision; it will not resume itself |
| Frozen accounts | `/admin/credits` | A reversal left a balance owed |
| Rejected payment events | `/admin/credits` | A non-zero count may be a misconfigured merchant id, or an attack |

## Processes

Two must be running. The worker is not optional — without it, campaigns are
accepted, funds are held, and nothing is ever sent.

```bash
npm run start      # web
npm run worker     # dispatch; one or more, they coordinate through the database
npm run retention  # scheduled, daily
```

Several workers can run at once. They claim jobs with `FOR UPDATE SKIP LOCKED`,
so they take different work rather than colliding.

**On Vercel** neither process exists. Dispatch runs right after a send, and
from `/api/cron/dispatch` on a schedule. Retention runs from
`/api/cron/retention`. See [DEPLOYMENT.md](DEPLOYMENT.md), including how late
scheduled sends run on the Hobby plan.

## Reconciling UNKNOWN submissions

An `UNKNOWN` submission means the connection dropped after the request left us.
The message may have been sent.

1. Check whether the provider supports lookup (`capabilities.supportsQuery`).
   If it does, `reconcileUnknown(campaignId)` resolves it without re-sending.
2. If it does not, check the provider's own dashboard or logs for the stable key.
3. **Do not re-send** unless the provider's contract guarantees idempotency for
   that key within a retention window. Re-sending is how a customer's recipient
   gets the same message twice.
4. If it cannot be resolved, decide deliberately whether to charge or release,
   and record the reason. The hold stays until someone decides.

The campaign stays open while any submission is unresolved. That is intentional.

## Quarantined delivery events

A receipt arrived that matched no message. Usually timing — the receipt beat the
submission response into the database.

```bash
# Re-attempt matching for anything quarantined.
node --conditions=react-server --import tsx -e "
  import('./src/server/jobs/delivery.ts').then(m => m.retryQuarantined().then(console.log))
"
```

If it still does not match, the reference is genuinely unknown. Keep it; do not
delete it. It is evidence of a provider or configuration problem.

## A campaign paused for review

Caused by the organization losing `ACTIVE` status or the sender identity being
revoked, detected before sending.

1. Find out what changed — `/admin/audit`, filter on `admin.`.
2. Decide whether the campaign should continue at all.
3. There is **no resume control**. If it should continue, fix the underlying
   status and the operator must re-submit. This is deliberate: a policy change
   that stopped a send should not be undone by a background process.

Remaining messages keep their holds while paused.

## Frozen account

A refund or chargeback exceeded the remaining balance. The shortfall is recorded
as debt and sending is frozen.

1. `/admin/credits` shows who and how much.
2. Settle the money commercially. The platform does not do this for you.
3. Lift the freeze at `/admin/credits`. **The debt is not cleared by this** — a
   later top-up pays it down before adding credit.

## Backup and restore

**Rehearsed** with `npm run rehearse-restore`, which reproduces the hazard on
throwaway databases and then verifies the recovery.

### What the rehearsal found

Restoring a backup loses every opt-out recorded since it was taken. That was
expected. What was not expected:

> **The audit log is in the same database.** So the record of *which* opt-outs
> to re-apply is restored away along with the opt-outs themselves. The original
> instruction here — "re-apply every suppression recorded since the backup" —
> was not executable from the database alone.

That is why the opt-out journal exists.

### The journal

Export on a schedule, and store the file **outside** the primary database —
different provider, different failure domain:

```bash
npm run export-suppressions -- ./backups/opt-outs-$(date +%F).json
```

It contains keyed hashes and display masks, never plain numbers, so it is not a
contact list. It is only meaningful with the key that produced it, so a key
rotation and the journal have to be kept in step: re-export after rotating.

### Restore procedure

1. Restore to a **staging** database. Never straight over production.
2. Re-apply retention: `npm run retention`.
3. **Re-apply the opt-out journal**:
   ```bash
   npm run import-suppressions -- ./backups/opt-outs-<latest>.json
   ```
   Insert-only and idempotent. It reports how many were missing — if that number
   is not zero, those people would have been messaged after the restore.
   Investigate before sending anything.
4. Reconcile the ledger against the payment provider for the restored window.
   The wallet is derived from the ledger, and a restored ledger may be behind.
5. Check `/api/health?full=1` is clean.
6. Only then promote.

Step 3 is the one that matters. A restore that reinstates a deleted contact
without their opt-out will message someone who asked you to stop.

### Still outstanding

- Backup retention must be set so backups do not outlive the retention periods
  they contain. That figure has not been decided.
- The rehearsal used `CREATE DATABASE ... TEMPLATE` because `pg_dump` is not in
  the embedded PostgreSQL used locally. Re-run it against the managed provider's
  real backup and restore tooling before go-live — the hazard is identical, but
  the mechanics will differ.

## Credential rotation

Secrets live in the environment, never in the repository.

### Suppression and data keys — rehearsed

`npm run rotate-keys`, covered by `rotate-keys.test.ts`, which includes a test
that **demonstrates the hazard**: rotating without carrying the old key forward
makes every stored opt-out stop matching, silently.

1. Generate the new key. Move the current value to `SUPPRESSION_HMAC_KEY_PREVIOUS`
   (and `DATA_ENCRYPTION_KEY_PREVIOUS`), put the new one in the live variable,
   and increment `SUPPRESSION_HMAC_KEY_VERSION`.
2. Deploy. Nothing breaks: lookups check both keys while both are set, and
   `/api/health?full=1` reports `key_rotation: in progress`.
3. `npm run rotate-keys`. Safe to re-run and safe to interrupt.
4. When it reports nothing left, remove the `*_PREVIOUS` values and deploy.
5. Re-export the opt-out journal — the old export is keyed to the old key.

If it reports suppression rows it could not re-key, **keep the previous key
set**. Those are opt-outs whose number appears nowhere else in the database, so
there is nothing to recompute the hash from; they match only while the old key
is configured.

### Other secrets

| Secret | Rotating it |
|---|---|
| `PARTNER_SMS_API_KEY` | Coordinate with the partner; the adapter fails closed |
| `PAYMENT_WEBHOOK_SECRET` | Accept both old and new during the overlap, or events fail verification and are rejected |
| `SMTP_PASSWORD` | Mail fails loudly rather than silently dropping |
| Session cookies | Deleting rows from `sessions` signs everyone out |

## Incident response

1. **Contain.** To stop all sending immediately, stop the worker processes.
   Campaigns stay queued and holds stay in place; nothing is lost. On Vercel
   there is no process to stop: follow *Stopping all sending* in
   [DEPLOYMENT.md](DEPLOYMENT.md), which needs a redeploy.
2. **Assess.** `/admin/audit` and `/admin/activity`. The audit log records
   approvals, sends, stops, wallet movements, exports, suppression and policy
   changes.
3. **Decide about money.** Do not refund in bulk without checking what was
   actually accepted by the provider. `ACCEPTED` means it was sent.
4. **Communicate.** If recipients were messaged in error, the opt-out list is
   the mechanism for preventing repetition. Already-delivered SMS cannot be
   recalled, and no part of this system pretends otherwise.
5. **Record.** Note what happened and why in the incident log.

## Failed jobs

A job that fails repeatedly lands in `FAILED` after `maxDispatchAttempts`.

```sql
select id, campaign_id, attempts, last_error
from dispatch_jobs where status = 'FAILED';
```

Fix the cause, then set the row back to `PENDING` with `lease_owner` and
`lease_expires_at` cleared. Its message items keep their own states, so nothing
already accepted is re-sent.

## What has not been rehearsed

- **Incident response.** Never exercised.
- **Partner failover.** No partner exists to fail over from.
- **Restore against the real provider.** The rehearsal used a local database
  copy, not the managed provider's backup tooling.
- **Alerting.** `/api/health?full=1` exists and is machine-readable, but nothing
  is pointed at it yet and no thresholds or escalation paths are configured.
