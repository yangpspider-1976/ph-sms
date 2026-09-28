import "@/server/load-env";
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { db, client } from "@/server/db";
import {
  auditEvents,
  campaigns,
  mailSink,
  messageItems,
  notifications,
  providerEvents,
  sessions,
} from "@/server/db/schema";
import { MOCK_DEFAULTS, type AppConfig } from "@/server/config";
import { expireImports } from "@/server/domain/contacts";
import { recordAudit } from "@/server/audit";

/**
 * Retention.
 *
 * Each class of data has its own window, because they are not the same kind of
 * record:
 *
 *  - uploads and rejected rows go first, and quickly;
 *  - message detail is reduced, not deleted: the per-recipient number and error
 *    detail are dropped while the campaign's totals survive, so reports and the
 *    ledger still reconcile;
 *  - suppression is kept far longer than contacts on purpose. An opt-out has to
 *    outlive the contact record it came from, or deleting a contact would
 *    quietly revive consent.
 *
 * Restoring a backup can bring deleted data back. That is a real gap and it
 * belongs in the restore procedure, not in this job — see README.
 */

export type RetentionSummary = {
  importsExpired: number;
  messageDetailRedacted: number;
  providerEventsDeleted: number;
  auditEventsDeleted: number;
  sessionsDeleted: number;
  notificationsDeleted: number;
  mailSinkDeleted: number;
};

export async function runRetention(
  config: AppConfig = MOCK_DEFAULTS,
  now: Date = new Date(),
): Promise<RetentionSummary> {
  const days = (n: number) => new Date(now.getTime() - n * 86_400_000);

  const importsExpired = await expireImports(db, now);

  /* --- Message detail ---------------------------------------------------- */

  // Redact rather than delete: the campaign's counts and the ledger must still
  // add up after this runs.
  const detailCutoff = days(config.messageDetailRetentionDays);
  const redacted = await db
    .update(messageItems)
    .set({
      numberEncrypted: "",
      errorCode: null,
      updatedAt: now,
    })
    .where(
      and(
        lt(messageItems.createdAt, detailCutoff),
        sql`${messageItems.numberEncrypted} <> ''`,
      ),
    )
    .returning({ id: messageItems.id });

  /* --- Provider events --------------------------------------------------- */

  // Processed callbacks are dropped; quarantined ones are kept, because they
  // are unresolved and an operator still needs them.
  const providerDeleted = await db
    .delete(providerEvents)
    .where(
      and(
        lt(providerEvents.receivedAt, detailCutoff),
        eq(providerEvents.quarantined, false),
        isNotNull(providerEvents.processedAt),
      ),
    )
    .returning({ id: providerEvents.id });

  /* --- Audit, sessions, notifications, mail ------------------------------ */

  const auditDeleted = await db
    .delete(auditEvents)
    .where(lt(auditEvents.createdAt, days(config.auditRetentionDays)))
    .returning({ id: auditEvents.id });

  const sessionsDeleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, now))
    .returning({ id: sessions.id });

  const notificationsDeleted = await db
    .delete(notifications)
    .where(lt(notifications.createdAt, days(config.auditRetentionDays)))
    .returning({ id: notifications.id });

  const mailDeleted = await db
    .delete(mailSink)
    .where(lt(mailSink.createdAt, days(7)))
    .returning({ id: mailSink.id });

  const summary: RetentionSummary = {
    importsExpired,
    messageDetailRedacted: redacted.length,
    providerEventsDeleted: providerDeleted.length,
    auditEventsDeleted: auditDeleted.length,
    sessionsDeleted: sessionsDeleted.length,
    notificationsDeleted: notificationsDeleted.length,
    mailSinkDeleted: mailDeleted.length,
  };

  // The run itself is recorded, so there is evidence the policy is being applied.
  await recordAudit({
    action: "retention.run",
    actorKind: "SYSTEM",
    objectType: "retention",
    metadata: { ...summary },
  });

  return summary;
}

/** Campaigns whose message detail has been redacted, for the reports UI. */
export async function redactedCampaignCount(config: AppConfig = MOCK_DEFAULTS): Promise<number> {
  const cutoff = new Date(Date.now() - config.messageDetailRetentionDays * 86_400_000);
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(campaigns)
    .where(lt(campaigns.createdAt, cutoff));
  return rows[0]?.n ?? 0;
}

// Allow running this file directly: `npm run retention`
if (process.argv[1]?.includes("retention")) {
  const summary = await runRetention();
  console.log("retention run complete:");
  for (const [key, value] of Object.entries(summary)) {
    console.log(`  ${key}: ${value}`);
  }
  await client.end({ timeout: 5 });
}
