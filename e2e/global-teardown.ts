import { spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";

/**
 * Stops the dispatch worker started by the global setup.
 *
 * The worker is spawned through `npm run`, so the direct child is a shell or
 * the npm CLI and the real node process is its grandchild. Killing only the
 * child leaves the worker running, which keeps the whole test run from exiting.
 * Kill the tree.
 */
async function globalTeardown(): Promise<void> {
  const worker = (globalThis as { __e2eWorker?: ChildProcess }).__e2eWorker;
  const pid = worker?.pid;
  if (!worker || !pid || worker.killed) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      // Negative pid targets the process group created by `detached: true`.
      process.kill(-pid, "SIGTERM");
    } catch {
      worker.kill("SIGTERM");
    }
  }
}

export default globalTeardown;
