# Monitoring dashboard and alert definitions

Implemented locally for the demo. `/admin/health` is the authenticated operator
dashboard, refreshes every 30 seconds while visible, and offers manual refresh.
It shows observed checks, active alerts and response links in English or Korean.
`/api/health` is database liveness; `/api/health?full=1` returns the check timestamp,
mode, checks and alerts as JSON. Responses are not cached. Critical service
failure returns HTTP 503; degraded conditions return 200 and require inspecting
the alert list. The full endpoint exposes counts/state, not recipient records.

| Stable check ID | Trigger | Severity | Initial response |
|---|---|---|---|
| `database` | Database ping fails | Critical | Check database reachability/credentials and service status |
| `dispatch_worker` | At least one pending job is over 120s late, or a claimed lease expired over 120s ago | Critical | Check worker/scheduler, leases and logs; inspect Activity |
| `unresolved_submissions` | At least one UNKNOWN item | Warning | Query/reconcile acceptance; never blindly resend |
| `quarantined_delivery_events` | At least one quarantined receipt | Warning | Match provider reference and verify webhook contract |
| `paused_campaigns` | At least one paused review campaign | Warning | Review suspension/sender/policy cause before intervention |
| `frozen_accounts` | At least one frozen wallet | Warning | Reconcile ledger and payment/chargeback cause in Credits |
| `rejected_payment_events_24h` | Mismatch or unknown-reference payment event in 24h | Warning | Verify merchant/reference/amount and investigate event |
| `failed_jobs` | At least one exhausted job | Warning | Inspect failure and partial submission before restarting |
| `key_rotation` | A previous key remains configured | Warning | Complete rotation and verify migration before retiring key |
| `live_readiness_gaps` | Missing prerequisites while mode is LIVE | Critical | Stop activation and satisfy the documented release gates |

The rule source is `src/server/domain/monitoring.ts`; thresholds and evidence
come from `health.ts`. No backlog is an absence of overdue work, not proof of a
worker heartbeat. A down database produces only the database alert: other checks
are unavailable, not successful. Outstanding live prerequisites in MOCK mode do
not produce a false outage.

## Alert routing to configure later

The dashboard and JSON definitions are implemented. There is no external paging,
email sender, monitoring account or webhook destination configured by this work.
When production work is authorized, assign a named primary and backup responder,
poll once per minute, page on a critical condition persisting for two polls,
and create a same-day task for warning conditions. Deduplicate on environment
plus check ID; resolve only after two successful observations. A fetch timeout
must trigger monitor-unreachable rather than silently clearing all alerts.

Record chosen thresholds, retention, destination, acknowledgement/escalation
times and named owners before activation. Test with the worker stopped and a
synthetic overdue job in isolated staging, then verify recovery after restart.
Use [RUNBOOK.md](RUNBOOK.md) for incidents/reconciliation and
[STAGING-DEPLOYMENT.md](STAGING-DEPLOYMENT.md) for environment separation.

## Provider pacing

Admin Settings exposes a shared submissions-per-second setting. All campaign
workers and mobile verification use a database-backed admission clock per mode
and provider, including retries. A campaign waits before changing an item to
SUBMITTING, respects a bounded dispatch deadline and resumes pending work without
spending an attempt or charging for the wait. The demo rate is 10 submissions/s.
This is a configurable demo mechanism; partner-specific throughput, query limits,
burst policy, backoff and approved capacity still require the partner contract.
