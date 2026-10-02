import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { campaigns, inquiries, organizations, senderIdentities } from "@/server/db/schema";
import { formatManilaDate } from "@/server/config";
import { getDictionary } from "@/i18n/server";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  NavTile,
  PageHeader,
  Pill,
  type Tone,
} from "@/components/ui";
import {
  IconBlock,
  IconChat,
  IconDocument,
  IconDownload,
  IconShield,
  IconSliders,
  IconTag,
  IconChevronRight,
} from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminExtra.overviewTitle };
}
export const dynamic = "force-dynamic";

const INQUIRY_TONE: Record<string, Tone> = {
  NEW: "info",
  CONTACTED: "info",
  REVIEWING: "warning",
  QUOTATION_SENT: "violet",
  CONTRACTED: "success",
  COMPLETED: "success",
  REJECTED: "danger",
};

/**
 * Campaign execution states shown to an operator.
 * "Finished" deliberately does not claim delivery — it means no dispatch work
 * remains. Per-recipient delivery lives on the campaign detail page.
 */
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

export default async function AdminOverviewPage() {
  const t = await getDictionary();

  const [recentInquiries, recentCampaigns, pendingOrgs, pendingSenders] = await Promise.all([
    db.select().from(inquiries).orderBy(desc(inquiries.createdAt)).limit(3),
    db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(3),
    db
      .select()
      .from(organizations)
      .where(inArray(organizations.status, ["PENDING_REVIEW", "NEEDS_INFORMATION"]))
      .orderBy(desc(organizations.createdAt))
      .limit(4),
    db
      .select({ id: senderIdentities.id })
      .from(senderIdentities)
      .where(eq(senderIdentities.status, "PENDING")),
  ]);

  const orgNames = new Map(
    (
      await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
    ).map((o) => [o.id, o.name]),
  );

  const newInquiries = recentInquiries.filter((i) => i.status === "NEW").length;

  return (
    <>
      <PageHeader
        title={t.adminExtra.overviewTitle}
        description={t.adminExtra.overviewSubheading}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <NavTile
          href="/admin/verification"
          icon={<IconShield size={20} />}
          title={t.adminExtra.tileVerification}
          subtitle={pendingOrgs.length > 0 ? `${pendingOrgs.length} in review queue` : "Review queue"}
          tint="teal"
        />
        <NavTile
          href="/admin/inquiries"
          icon={<IconDocument size={20} />}
          title={t.adminExtra.tileInquiries}
          subtitle={newInquiries > 0 ? `${newInquiries} new requests` : "New requests"}
          tint="brand"
        />
        <NavTile
          href="/admin/senders"
          icon={<IconTag size={20} />}
          title={t.adminExtra.tileSenders}
          subtitle={
            pendingSenders.length > 0 ? `${pendingSenders.length} awaiting review` : "Awaiting review"
          }
          tint="violet"
        />
        <NavTile
          href="/admin/activity"
          icon={<IconChat size={20} />}
          title={t.adminExtra.tileActivity}
          subtitle={t.adminExtra.tileActivitySub}
          tint="teal"
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title={t.adminExtra.inquiriesTitle}
              action={
                <Link
                  href="/admin/inquiries"
                  className="text-[13px] font-semibold text-brand-600 hover:underline"
                >
                  {t.adminExtra.viewAll}
                </Link>
              }
            />
            {recentInquiries.length === 0 ? (
              <EmptyState
                title={t.adminExtra.inquiriesEmptyTitle}
                description={t.adminExtra.inquiriesEmptyBody}
                icon={<IconDocument size={20} />}
              />
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <th>{t.adminExtra.colCompany}</th>
                    <th>{t.adminExtra.colPurpose}</th>
                    <th>{t.admin.colStatus}</th>
                    <th className="w-[130px]">{t.adminExtra.colAction}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInquiries.map((inquiry) => (
                    <tr key={inquiry.id}>
                      <td>{inquiry.company}</td>
                      <td>
                        {/* Clamped by CSS so it ends in an ellipsis; cutting the
                            string left "Ticket holders for the" with no sign
                            that anything was missing. */}
                        <span className="line-clamp-2 min-w-[160px]" title={inquiry.audience}>
                          {inquiry.audience}
                        </span>
                      </td>
                      <td>
                        <Pill tone={INQUIRY_TONE[inquiry.status] ?? "neutral"}>
                          {t.status.inquiry[inquiry.status]}
                        </Pill>
                      </td>
                      <td>
                        <ButtonLink
                          href={`/admin/inquiries/${inquiry.id}`}
                          size="sm"
                          variant={inquiry.status === "NEW" ? "primary" : "secondary"}
                          className="w-[104px] justify-center py-2"
                        >
                          {inquiry.status === "NEW" ? t.adminExtra.review : t.adminExtra.open}
                        </ButtonLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Card>

          <Card>
            <CardHeader
              title={t.adminExtra.campaignsTitle}
              action={
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <IconDownload size={15} /> Export report
                </Button>
              }
            />
            {recentCampaigns.length === 0 ? (
              <EmptyState
                title={t.adminExtra.campaignsEmptyTitle}
                description={t.adminExtra.campaignsEmptyBody}
                icon={<IconChat size={20} />}
              />
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <th>{t.admin.colCampaign}</th>
                    <th>{t.adminExtra.colAccount}</th>
                    <th>{t.admin.colStatus}</th>
                    <th>{t.adminExtra.colDetails}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCampaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td>
                        <Link
                          href={`/admin/activity/${campaign.id}`}
                          className="hover:text-brand-700"
                        >
                          {campaign.name}
                        </Link>
                      </td>
                      <td>{orgNames.get(campaign.organizationId) ?? "—"}</td>
                      <td>
                        <Pill tone={CAMPAIGN_TONE[campaign.status] ?? "neutral"}>
                          {t.status.campaign[campaign.status]}
                        </Pill>
                      </td>
                      <td className="text-muted">
                        {campaign.includedCount} recipients · {campaign.purpose.toLowerCase()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title={t.adminExtra.verificationQueue}
              action={
                <Link
                  href="/admin/verification"
                  className="text-[13px] font-semibold text-brand-600 hover:underline"
                >
                  {t.adminExtra.viewAll}
                </Link>
              }
            />
            {pendingOrgs.length === 0 ? (
              <EmptyState
                title={t.adminExtra.queueEmptyTitle}
                description={t.adminExtra.queueEmptyBody}
                icon={<IconShield size={20} />}
              />
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <th>{t.adminExtra.colBusiness}</th>
                    <th>{t.adminExtra.colSubmitted}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pendingOrgs.map((org) => (
                    <tr key={org.id}>
                      <td>
                        <span className="block">{org.name}</span>
                        <span className="block text-[12.5px] font-normal text-muted">
                          {t.adminExtra.businessRegistration}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-muted">
                        {formatManilaDate(org.createdAt)}
                      </td>
                      <td className="text-right">
                        <ButtonLink
                          href={`/admin/verification/${org.id}`}
                          size="sm"
                          variant="secondary"
                          className="py-2"
                        >
                          {t.adminExtra.viewDocuments}
                        </ButtonLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Card>

          <Card className="p-2">
            <h2 className="px-3 pb-1 pt-3 card-title">{t.adminExtra.controlsTitle}</h2>
            <div className="mt-1 space-y-1">
              <ControlRow
                href="/admin/settings"
                icon={<IconSliders size={19} />}
                title={t.adminExtra.controlLimits}
                subtitle={t.adminExtra.controlLimitsSub}
              />
              <ControlRow
                href="/admin/suppression"
                icon={<IconBlock size={19} />}
                title={t.adminExtra.controlSuppression}
                subtitle={t.adminExtra.controlSuppressionSub}
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function ControlRow({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 rounded-[9px] px-3 py-3 transition-colors hover:bg-brand-50/60"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-bold text-ink">{title}</span>
        <span className="block truncate text-[12.5px] text-muted">{subtitle}</span>
      </span>
      <IconChevronRight size={16} className="shrink-0 text-muted" />
    </Link>
  );
}
