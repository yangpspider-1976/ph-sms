import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/server/auth/context";
import { dispatchDueOnVisit } from "@/server/jobs/dispatch-after-response";
import { listCampaignsForOrg } from "@/server/domain/campaigns";
import { formatCentavos, formatManila } from "@/server/config";
import {
  ButtonLink,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  Pill,
  type Tone,
} from "@/components/ui";
import { IconMegaphone } from "@/components/icons";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.campaigns.metaTitle };
}
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

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const t = await getDictionary();

  const ctx = await requireOrgContext();
  dispatchDueOnVisit();
  const { filter } = await searchParams;
  const orgId = ctx.org.organizationId;

  const scheduledOnly = filter === "scheduled";
  const rows = await listCampaignsForOrg(orgId, { scheduledOnly });

  return (
    <>
      <PageHeader
        title={t.campaigns.title}
        description={t.campaigns.subheading}
        action={
          ctx.can("campaign.send") ? <ButtonLink href="/app/send">{t.nav.send}</ButtonLink> : null
        }
      />

      <div className="mb-4 flex gap-2">
        <FilterTab href="/app/campaigns" active={!scheduledOnly} label={t.campaigns.filterAll} />
        <FilterTab href="/app/campaigns?filter=scheduled" active={scheduledOnly} label={t.campaigns.filterScheduled} />
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={scheduledOnly ? t.campaigns.nothingScheduledTitle : t.campaigns.noneTitle}
            description={
              scheduledOnly
                ? t.campaigns.nothingScheduledBody
                : t.campaigns.noneBody
            }
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
                <th>{t.campaigns.colAccepted}</th>
                <th>{t.campaigns.colDelivered}</th>
                <th>{t.campaigns.colReserved}</th>
                <th>{t.campaigns.colWhen}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/app/campaigns/${row.id}`} className="hover:text-brand-700">
                      {row.name}
                    </Link>
                  </td>
                  <td>
                    <Pill tone={TONE[row.status] ?? "neutral"}>{t.status.campaign[row.status]}</Pill>
                  </td>
                  <td>{row.includedCount}</td>
                  <td>{row.accepted}</td>
                  <td>{row.delivered}</td>
                  <td>{formatCentavos(row.cost)}</td>
                  <td className="whitespace-nowrap text-muted">
                    {formatManila(row.scheduledAt ?? row.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}

function FilterTab({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "rounded-lg bg-brand-600 px-3.5 py-1.5 text-[13px] font-semibold text-white"
          : "rounded-lg border border-line bg-white px-3.5 py-1.5 text-[13px] font-semibold text-body hover:bg-navy-50"
      }
    >
      {label}
    </Link>
  );
}
