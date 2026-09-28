/**
 * Side-effect module: loads .env files before anything reads process.env.
 *
 * ES module imports are evaluated in source order, so scripts that need the
 * environment import this FIRST, ahead of any module that reads a variable at
 * import time (such as the database client). Next.js loads .env itself, so this
 * is only for standalone scripts: seed, migrate and the worker.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });
