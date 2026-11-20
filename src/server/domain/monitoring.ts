import type { HealthReport } from "./health";

/** Stable identifiers are shared by the dashboard, JSON endpoint, and handover runbook. */
export const ALERT_RULES = [
  { check: "database", severity: "critical", href: "/admin/health" },
  { check: "dispatch_worker", severity: "critical", href: "/admin/activity" },
  { check: "unresolved_submissions", severity: "warning", href: "/admin/health" },
  { check: "quarantined_delivery_events", severity: "warning", href: "/admin/health" },
  { check: "paused_campaigns", severity: "warning", href: "/admin/activity" },
  { check: "frozen_accounts", severity: "warning", href: "/admin/credits" },
  { check: "rejected_payment_events_24h", severity: "warning", href: "/admin/credits" },
  { check: "failed_jobs", severity: "warning", href: "/admin/activity" },
  { check: "key_rotation", severity: "warning", href: "/admin/settings" },
  { check: "live_readiness_gaps", severity: "critical", href: "/admin/settings" },
] as const;

export type OperationalAlert = (typeof ALERT_RULES)[number] & { value: number | string };

/** Unavailable checks are unknown, never synthetic success or a cascade of invented alerts. */
export function operationalAlerts(checks: HealthReport["checks"]): OperationalAlert[] {
  return ALERT_RULES.flatMap((rule) => {
    const observed = checks.find((check) => check.name === rule.check);
    return observed && observed.status !== "ok" ? [{ ...rule, value: observed.value }] : [];
  });
}
