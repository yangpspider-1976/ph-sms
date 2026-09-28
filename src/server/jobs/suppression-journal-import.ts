import "@/server/load-env";
import { client } from "@/server/db";
import { importSuppressions } from "./suppression-journal";

/**
 * Import entry point.
 *
 * A separate file rather than an env-var switch, because `JOURNAL_MODE=import`
 * is not portable across shells and this command is run under pressure, after a
 * restore, by someone who should not be debugging quoting rules.
 */
const path = process.argv[2] ?? "./backups/opt-outs.json";

const summary = await importSuppressions(path);
console.log(
  `Read ${summary.read} entries: ${summary.restored} restored, ${summary.alreadyPresent} already present.`,
);
if (summary.restored > 0) {
  console.log(
    "\nThose opt-outs were missing from the database. Investigate why before sending anything.",
  );
}

await client.end({ timeout: 5 });
