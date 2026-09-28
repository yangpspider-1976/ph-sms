import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

/**
 * Browser end-to-end tests.
 *
 * These run against a production build on its own port, pointed at a dedicated
 * database, so they never disturb dev data or the unit-test database. The
 * dispatch worker is started by the global setup, because dispatch is a
 * separate process in this architecture and a test that skipped it would not be
 * testing the real thing.
 */
const PORT = Number(process.env.E2E_PORT ?? 3311);
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://ph_sms:ph_sms_dev@127.0.0.1:54329/ph_sms_e2e";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // Build first: `next start` serves whatever .next already contains, so
    // without this the suite silently tests a stale build.
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      DATABASE_URL,
      APP_MODE: "MOCK",
      NODE_ENV: "production",
    },
  },
});
