/**
 * Vercel's build command (see vercel.json).
 *
 * Production builds apply pending migrations first. A migration that fails
 * fails the build, and the previous deployment keeps serving. The old code
 * runs against the new schema until the switch, so migrations must stay
 * backward-compatible.
 *
 * Preview builds migrate only when MIGRATE_PREVIEWS=true, which should be set
 * only when each preview has its own database (a Neon branch per preview).
 * Against a shared database, a preview of an unmerged branch would change the
 * production schema.
 */
import { spawnSync } from "node:child_process";

function run(script) {
  const result = spawnSync(`npm run ${script}`, { stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const target = process.env.VERCEL_ENV;
const migrate =
  target === "production" || (target === "preview" && process.env.MIGRATE_PREVIEWS === "true");

if (migrate) {
  run("db:migrate");
} else {
  console.log(`Skipping migrations (VERCEL_ENV=${target ?? "unset"}).`);
}
run("build");
