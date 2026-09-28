import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { campaigns, dispatchJobs, messageItems, organizations, providerEvents } from "@/server/db/schema";
import { requirePlatformAdmin } from "@/server/auth/context";
import { formatManila } from "@/server/config";
import {
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  Notice,
  PageHeader,
  Pill,
  Stat,
  type Tone,
} from "@/components/ui";
import { IconChat } from "@/components/icons";
import { getDictionary } from "@/i18n/server";

export const metadata = { title: "SMS activity" };
export const dynamic = "force-dynamic";

const TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  SCHEDULED: "success",
  QUEUED: "info",
  PROCESSING: "info",
  PAUSED_REVIEW: "warning",
  FINISHED: "success",
  CANCELLED: "neutral",
};

export default async function ActivityPage() {
  const t = await getDictionary();

  await requirePlatformAdmin();

  const [rows, totals, jobs, quarantined] = await Promise.all([
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        includedCount: campaigns.includedCount,
        createdAt: campaigns.createdAt,
        organizationName: organizations.name,
        accepted: sql<number>`(
          select count(*) from ${messageItems}
          where ${messageItems.campaignId} = ${campaigns.id}
            and ${messageItems.submissionStatus} = 'ACCEPTED')::int`,
        unresolved: sql<number>`(
          select count(*) from ${messageItems}
          where ${messageItems.campaignId} = ${campaigns.id}
            and ${messageItems.submissionStatus} in ('UNKNOWN','SUBMITTING'))::int`,
      })
      .from(campaigns)
      .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
      .orderBy(desc(campaigns.createdAt))
      .limit(50),
    db
      .select({
        accepted: sql<number>`count(*) filter (where ${messageItems.submissionStatus} = 'ACCEPTED')::int`,
        unresolved: sql<number>`count(*) filter (where ${messageItems.submissionStatus} in ('UNKNOWN','SUBMITTING'))::int`,
        delivered: sql<number>`count(*) filter (where ${messageItems.deliveryStatus} = 'DELIVERED')::int`,
      })
      .from(messageItems),
    db
      .select({
        pending: sql<number>`count(*) filter (where ${dispatchJobs.status} in ('PENDING','CLAIMED'))::int`,
        paused: sql<number>`count(*) filter (where ${dispatchJobs.status} = 'PAUSED')::int`,
        failed: sql<number>`count(*) filter (where ${dispatchJobs.status} = 'FAILED')::int`,
      })
      .from(dispatchJobs),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(providerEvents)
      .where(eq(providerEvents.quarantined, true)),
  ]);

  const counts = totals[0] ?? { accepted: 0, unresolved: 0, delivered: 0 };
  const queue = jobs[0] ?? { pending: 0, paused: 0, failed: 0 };
  const quarantinedCount = quarantined[0]?.n ?? 0;

  return (
    <>
      <PageHeader
        title={t.admin.activity.title}
        description={t.admin.activity.subheading}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label={t.admin.activity.statAccepted} value={counts.accepted} />
        <Stat label={t.admin.activity.statDelivered} value={counts.delivered} hint={t.admin.activity.statDeliveredHint} />
        <Stat
          label={t.admin.activity.statUnresolved}
          value={counts.unresolved}
          tone={counts.unresolved > 0 ? "warning" : "neutral"}
          hint={t.admin.activity.statUnresolvedHint}
        />
        <Stat label={t.admin.activity.statQueued} value={queue.pending} />
        <Stat
          label={t.admin.activity.statPaused}
          value={queue.paused + queue.failed}
          tone={queue.paused + queue.failed > 0 ? "warning" : "neutral"}
        />
      </div>

      {counts.unresolved > 0 || quarantinedCount > 0 ? (
        <div className="mt-5 max-w-3xl">
          <Notice tone="warning" title={t.admin.activity.needsOperator}>
            {counts.unresolved > 0
              ? `${counts.unresolved} submission(s) are unresolved: the connection dropped after they were sent, so the provider may or may not have accepted them. They are never retried automatically. `
              : ""}
            {quarantinedCount > 0
              ? `${quarantinedCount} delivery event(s) are quarantined because they did not match a known message.`
              : ""}
          </Notice>
        </div>
      ) : null}

      <Card className="mt-5">
        <CardHeader
          title={t.admin.activity.recentTitle}
          description={t.admin.activity.recentDescription}
        />
        {rows.length === 0 ? (
          <EmptyState
            title={t.admin.activity.emptyTitle}
            description={t.admin.activity.emptyBody}
            icon={<IconChat size={20} />}
          />
        ) : (
                      <DataTable>
              <thead>
                <tr>
                  <th>{t.admin.colCampaign}</th>
                  <th>{t.admin.colOrganization}</th>
                  <th>{t.admin.colStatus}</th>
                  <th>{t.admin.colRecipients}</th>
                  <th>{t.admin.colAccepted}</th>
                  <th>{t.admin.colUnresolved}</th>
                  <th>{t.admin.colCreated}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td className="text-muted">{row.organizationName}</td>
                    <td>
                      <Pill tone={TONE[row.status] ?? "neutral"}>
                        {t.status.campaign[row.status]}
                      </Pill>
                    </td>
                    <td>{row.includedCount}</td>
                    <td>{row.accepted}</td>
                    <td className={row.unresolved > 0 ? "font-semibold text-warning-fg" : "text-muted"}>
                      {row.unresolved}
                    </td>
                    <td className="whitespace-nowrap text-muted">{formatManila(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
        )}
      </Card>
    </>
  );
}
