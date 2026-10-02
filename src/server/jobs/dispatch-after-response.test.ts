import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The page-view drain.
 *
 * What matters is when it fires, not what the drain does (dispatch.test.ts
 * covers that): on every signed-in page would be a claim query per request,
 * never would leave scheduled sends waiting for GitHub's schedule.
 */

const { after, drainDueJobs, env } = vi.hoisted(() => ({
  after: vi.fn<(callback: () => Promise<void>) => void>(),
  drainDueJobs: vi.fn(async () => 0),
  env: { DISPATCH_AFTER_RESPONSE: true },
}));

vi.mock("next/server", () => ({ after }));
vi.mock("@/server/env", () => ({ env }));
vi.mock("./dispatch", () => ({ drainDueJobs }));

async function load() {
  vi.resetModules();
  return import("./dispatch-after-response");
}

describe("dispatchDueOnVisit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T08:00:00Z"));
    after.mockClear();
    drainDueJobs.mockClear();
    env.DISPATCH_AFTER_RESPONSE = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drains once the response has been sent", async () => {
    const { dispatchDueOnVisit } = await load();
    dispatchDueOnVisit();

    expect(after).toHaveBeenCalledTimes(1);
    expect(drainDueJobs).not.toHaveBeenCalled();
    await after.mock.calls[0]![0]();
    expect(drainDueJobs).toHaveBeenCalledTimes(1);
  });

  it("drains at most once per half minute on one instance", async () => {
    const { dispatchDueOnVisit } = await load();
    dispatchDueOnVisit();
    vi.advanceTimersByTime(29_000);
    dispatchDueOnVisit();
    expect(after).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    dispatchDueOnVisit();
    expect(after).toHaveBeenCalledTimes(2);
  });

  it("does nothing where a worker process does the dispatching", async () => {
    env.DISPATCH_AFTER_RESPONSE = false;
    const { dispatchDueOnVisit } = await load();
    dispatchDueOnVisit();
    expect(after).not.toHaveBeenCalled();
  });
});
