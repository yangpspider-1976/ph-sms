import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

// NODE_ENV is set by the test runner; it is read-only in the Node types.
process.env.APP_MODE ??= "MOCK";
// Integration tests run against a separate database so they never touch dev data.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://ph_sms:ph_sms_dev@127.0.0.1:54329/ph_sms_test";
