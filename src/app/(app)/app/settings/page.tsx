import type { Metadata } from "next";
import { requireOrgContext } from "@/server/auth/context";
import { Card, DetailRow, NavTile, Notice, PageHeader, Pill } from "@/components/ui";
import { getDictionary, getI18n } from "@/i18n/server";
import { formatDateTime } from "@/i18n/format";
import {
  IconBuilding,
  IconShield,
  IconTag,
  IconUser,
  IconUsers,
} from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.settings.title };
}
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { t, locale } = await getI18n();

  const ctx = await requireOrgContext({ allowInactive: true });
  const verified = ctx.org.organizationStatus === "ACTIVE";

  return (
    <>
      <PageHeader
        title={t.settings.title}
        description={t.settings.subheading}
      />

      {!verified ? (
        <div className="mb-5 max-w-3xl">
          <Notice tone="warning" title={t.settings.notVerifiedTitle}>
            {t.settings.notVerifiedBody}
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <NavTile
          href="/app/settings/profile"
          icon={<IconUser size={20} />}
          title={t.settings.tileProfile}
          subtitle={t.settings.tileProfileSub}
          tint="brand"
        />
        <NavTile
          href="/app/settings/team"
          icon={<IconUsers size={20} />}
          title={t.settings.tileTeam}
          subtitle={t.settings.tileTeamSub}
          tint="teal"
        />
        <NavTile
          href="/app/settings/senders"
          icon={<IconTag size={20} />}
          title={t.settings.tileSenders}
          subtitle={t.settings.tileSendersSub}
          tint="violet"
        />
        <NavTile
          href="/app/contacts/opt-outs"
          icon={<IconShield size={20} />}
          title={t.settings.tileOptOuts}
          subtitle={t.settings.tileOptOutsSub}
          tint="navy"
        />
      </div>

      <Card className="mt-5 max-w-3xl p-5">
        <h2 className="card-title">{t.settings.businessProfile}</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          {t.settings.businessProfileNote}
        </p>
        <dl className="mt-3 divide-y divide-line">
          <DetailRow
            label={t.settings.organization}
            value={
              <span className="flex flex-wrap items-center gap-2">
                <IconBuilding size={14} className="text-muted" />
                {ctx.org.organizationName}
              </span>
            }
          />
          <DetailRow
            label={t.common.status}
            value={
              verified ? (
                <Pill tone="success" dot={false}>
                  {t.common.verified}
                </Pill>
              ) : (
                <Pill tone="warning">
                  {t.status.org[ctx.org.organizationStatus]}
                </Pill>
              )
            }
          />
          <DetailRow
            label={t.settings.yourRoleHere}
            value={
              <span>
                {t.roles.labels[ctx.org.role]}
                <span className="mt-0.5 block text-[12.5px] text-muted">
                  {t.roles.descriptions[ctx.org.role]}
                </span>
              </span>
            }
          />
          <DetailRow label={t.settings.timesShownIn} value={t.settings.timezoneValue} />
          <DetailRow label={t.settings.currency} value={t.settings.currencyValue} />
          <DetailRow label={t.settings.viewed} value={formatDateTime(new Date(), locale)} />
        </dl>
      </Card>
    </>
  );
}
