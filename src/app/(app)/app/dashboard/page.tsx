import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { campaigns, messageItems, senderIdentities } from "@/server/db/schema";
import { requireOrgContext } from "@/server/auth/context";
import { dispatchDueOnVisit } from "@/server/jobs/dispatch-after-response";
import { getWallet } from "@/server/domain/wallet";
import { limitsFor, quotaUsage } from "@/server/domain/quota";
import { MOCK_DEFAULTS, formatCentavos, formatManila } from "@/server/config";
import {
  ButtonLink,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
  Pill,
  Stat,
  type Tone,
} from "@/components/ui";
import { IconMegaphone, IconSend } from "@/components/icons";
import { NotificationsPanel } from "@/components/notifications";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getDictionary();
  return { title: t.dashboard.metaTitle };
}
export const dynamic = "force-dynamic";

const CAMPAIGN_TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  SCHEDULED: "success",
  QUEUED: "info",
  PROCESSING: "info",
  PAUSED_REVIEW: "warning",
  FINISHED: "success",
  CANCELLED: "neutral",
};

export default async function DashboardPage() {
  const t = await getDictionary();

  const ctx = await requireOrgContext();
  dispatchDueOnVisit();
  const orgId = ctx.org.organizationId;

  const [wallet, usage, recent, senders, totals] = await Promise.all([
    getWallet(orgId),
    quotaUsage(db, orgId, limitsFor(MOCK_DEFAULTS)),
    db
      .select()
      .from(campaigns)
      .where(eq(campaigns.organizationId, orgId))
      .orderBy(desc(campaigns.createdAt))
      .limit(5),
    db
      .select()
      .from(senderIdentities)
      .where(
        and(eq(senderIdentities.organizationId, orgId), eq(senderIdentities.status, "APPROVED")),
      ),
    db
      .select({
        accepted: sql<number>`count(*) filter (where ${messageItems.submissionStatus} = 'ACCEPTED')::int`,
        delivered: sql<number>`count(*) filter (where ${messageItems.deliveryStatus} = 'DELIVERED')::int`,
      })
      .from(messageItems)
      .where(eq(messageItems.organizationId, orgId)),
  ]);

  const counts = totals[0] ?? { accepted: 0, delivered: 0 };

  return (
    <>
      <PageHeader
        title={t.dashboard.welcome(ctx.user.fullName.split(" ")[0] ?? "")}
        description={t.dashboard.subheading}
        action={
          ctx.can("campaign.send") ? (
            <ButtonLink href="/app/send">
              <IconSend size={16} /> {t.nav.send}
            </ButtonLink>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t.dashboard.availableCredit}
          value={formatCentavos(wallet.availableCentavos)}
          hint={
            wallet.heldCentavos > 0
              ? t.dashboard.heldForSends(formatCentavos(wallet.heldCentavos))
              : t.dashboard.demoCredit
          }
        />
        <Stat
          label={t.dashboard.todaysDestinations}
          value={`${usage.daily.used} / ${usage.daily.limit}`}
          hint={t.dashboard.remainingToday(usage.daily.remaining)}
        />
        <Stat
          label={t.dashboard.acceptedByProvider}
          value={counts.accepted}
          hint={t.dashboard.acceptedHint}
        />
        <Stat label={t.dashboard.delivered} value={counts.delivered} hint={t.dashboard.deliveredHint} />
      </div>

      {senders.length === 0 ? (
        <Card className="mt-5 p-5">
          <p className="text-[13.5px] font-bold text-ink">{t.dashboard.noSenderTitle}</p>
          <p className="mt-1 text-[13px] text-body">
            {t.dashboard.noSenderBodyBefore}{" "}
            <Link href="/app/settings/senders" className="font-semibold text-brand-700 hover:underline">
              {t.dashboard.noSenderLink}
            </Link>
            .
          </p>
        </Card>
      ) : null}

      <NotificationsPanel organizationId={orgId} userId={ctx.user.id} />

      <Card className="mt-5">
        <CardHeader
          title={t.dashboard.recentCampaigns}
          action={
            <Link
              href="/app/campaigns"
              className="text-[13px] font-semibold text-brand-600 hover:underline"
            >
              {t.dashboard.viewAll}
            </Link>
          }
        />
        {recent.length === 0 ? (
          <EmptyState
            title={t.dashboard.noCampaignsTitle}
            description={t.dashboard.noCampaignsBody}
            icon={<IconMegaphone size={20} />}
            action={
              ctx.can("campaign.send") ? (
                <ButtonLink href="/app/send" size="sm">
                  {t.dashboard.sendFirst}
                </ButtonLink>
              ) : null
            }
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>{t.campaigns.colCampaign}</th>
                <th>{t.campaigns.colStatus}</th>
                <th>{t.campaigns.colRecipients}</th>
                <th>{t.campaigns.colCreated}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((campaign) => (
                <tr key={campaign.id}>
                  <td>
                    <Link href={`/app/campaigns/${campaign.id}`} className="hover:text-brand-700">
                      {campaign.name}
                    </Link>
                  </td>
                  <td>
                    <Pill tone={CAMPAIGN_TONE[campaign.status] ?? "neutral"}>
                      {t.status.campaign[campaign.status]}
                    </Pill>
                  </td>
                  <td>{campaign.includedCount}</td>
                  <td className="text-muted">{formatManila(campaign.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
