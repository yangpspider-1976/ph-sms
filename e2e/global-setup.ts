import { spawn, type ChildProcess } from "node:child_process";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://ph_sms:ph_sms_dev@127.0.0.1:54329/ph_sms_e2e";

let worker: ChildProcess | undefined;

function run(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", script], {
      env: { ...process.env, DATABASE_URL, APP_MODE: "MOCK" },
      stdio: "inherit",
      shell: true,
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`)),
    );
  });
}

/**
 * Prepares the end-to-end database and starts the dispatch worker.
 *
 * The worker runs as its own process in this architecture, so the tests start
 * one too. Without it a submitted campaign would sit in the queue and the test
 * would be checking a screen rather than the system.
 */
async function globalSetup(): Promise<void> {
  await run("db:migrate");
  await run("seed");

  worker = spawn("npm", ["run", "worker"], {
    env: { ...process.env, DATABASE_URL, APP_MODE: "MOCK" },
    stdio: "inherit",
    shell: true,
    // Own process group on POSIX so the teardown can signal the whole tree;
    // on Windows the teardown uses taskkill /T instead.
    detached: process.platform !== "win32",
  });

  (globalThis as { __e2eWorker?: ChildProcess }).__e2eWorker = worker;
}

export default globalSetup;
