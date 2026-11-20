import { describe, expect, it } from "vitest";
import { operationalAlerts } from "./monitoring";

describe("operational alert definitions", () => {
  it("reports only observed unhealthy checks, with stable severity and destinations", () => {
    expect(operationalAlerts([
      { name: "database", status: "ok", value: "reachable", detail: "Connected" },
      { name: "dispatch_worker", status: "failing", value: 2, detail: "Stalled" },
      { name: "unresolved_submissions", status: "degraded", value: 1, detail: "Unresolved" },
    ])).toEqual([
      { check: "dispatch_worker", severity: "critical", href: "/admin/activity", value: 2 },
      { check: "unresolved_submissions", severity: "warning", href: "/admin/health", value: 1 },
    ]);
  });

  it("does not invent healthy results or downstream alerts when the database is unavailable", () => {
    expect(operationalAlerts([])).toEqual([]);
    expect(operationalAlerts([{ name: "database", status: "failing", value: "unreachable", detail: "Unavailable" }]))
      .toEqual([{ check: "database", severity: "critical", href: "/admin/health", value: "unreachable" }]);
  });
});
