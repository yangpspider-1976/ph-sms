import "@/server/load-env";
import { client } from "@/server/db";
import { runRetention } from "./retention";

/**
 * `npm run retention`. Schedule it daily.
 *
 * On Vercel the same job runs from `/api/cron/retention`, which is why the
 * logic lives in `retention.ts` and this file is only the entry point.
 */
const summary = await runRetention();
console.log("retention run complete:");
for (const [key, value] of Object.entries(summary)) {
  console.log(`  ${key}: ${value}`);
}
await client.end({ timeout: 5 });
