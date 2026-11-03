import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { campaigns, messageItems, senderIdentities } from "@/server/db/schema";
import { requireOrgContext } from "@/server/auth/context";
import { demoFeaturesEnabled } from "@/server/env";
import { dispatchDueOnVisit } from "@/server/jobs/dispatch-after-response";
import { getWallet } from "@/server/domain/wallet";
import { limitsFor, quotaUsage } from "@/server/domain/quota";
import { MOCK_DEFAULTS, formatCentavos } from "@/server/config";
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
import {
  IconDocument,
  IconHelp,
  IconMegaphone,
  IconSend,
  IconTag,
  IconUsers,
} from "@/components/icons";
import { NotificationsPanel } from "@/components/notifications";
import { getDictionary, getI18n } from "@/i18n/server";
import { formatDateTime } from "@/i18n/format";

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
  const { t, locale } = await getI18n();

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
  const creditHint =
    wallet.heldCentavos > 0
      ? t.dashboard.heldForSends(formatCentavos(wallet.heldCentavos))
      : // Demo funding exists only outside LIVE; there the credit is real.
        demoFeaturesEnabled()
        ? t.dashboard.demoCredit
        : null;
  const shortcuts = [
    { href: "/app/send", label: t.nav.send, icon: <IconSend size={24} /> },
    { href: "/app/campaigns", label: t.nav.campaigns, icon: <IconMegaphone size={24} /> },
    { href: "/app/contacts", label: t.nav.contacts, icon: <IconUsers size={24} /> },
    { href: "/app/templates", label: t.nav.templates, icon: <IconDocument size={24} /> },
    { href: "/app/settings/senders", label: t.settings.tileSenders, icon: <IconTag size={24} /> },
    { href: "/app/support", label: t.nav.support, icon: <IconHelp size={24} /> },
  ];

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

      {/* The balance on the left and the places most visits go to on the
          right, as the reference's shortcut card. */}
      <Card className="mb-5 grid md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="border-b border-line px-6 py-6 md:border-b-0 md:border-r">
          <p className="text-[15px] font-bold text-ink">{t.dashboard.availableCredit}</p>
          <p className="mt-2 text-[30px] leading-tight font-bold text-brand-700 tabular-nums">
            {formatCentavos(wallet.availableCentavos)}
          </p>
          {creditHint ? <p className="mt-1 text-[12.5px] text-muted">{creditHint}</p> : null}
          {ctx.can("billing.manage") ? (
            <ButtonLink href="/app/credits" variant="ghost" size="sm" className="mt-4">
              {t.credits.addCredit}
            </ButtonLink>
          ) : null}
        </div>
        {/* The gaps show the line colour behind: hairlines for any number of columns. */}
        <ul className="grid grid-cols-3 gap-px bg-line xl:grid-cols-6">
          {shortcuts.map((shortcut) => (
            <li key={shortcut.href} className="bg-white">
              <Link
                href={shortcut.href}
                className="group flex h-full flex-col items-center justify-center gap-3 px-2 py-6 text-center text-[14px] text-ink hover:text-brand-700"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition-transform group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                  {shortcut.icon}
                </span>
                {shortcut.label}
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
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
              className="-my-1 py-1 text-[13px] font-semibold text-brand-600 hover:underline"
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
                  <td className="cell-title" title={campaign.name}>
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
                  <td className="text-muted">{formatDateTime(campaign.createdAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
