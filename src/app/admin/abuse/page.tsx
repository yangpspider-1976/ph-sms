import type { Metadata } from "next";
import { desc, eq, gte, sql } from "drizzle-orm";
import { requirePlatformAdmin } from "@/server/auth/context";
import { db } from "@/server/db";
import { campaigns, organizations } from "@/server/db/schema";
import { getEditableContentPolicy } from "@/server/domain/app-config";
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
} from "@/components/ui";
import { IconShield } from "@/components/icons";
import Link from "next/link";
import { PolicyEditor } from "./policy-editor";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.admin.abuse.title };
}
export const dynamic = "force-dynamic";

/**
 * Abuse.
 *
 * Two things on one screen: the rules that decide what is blocked or held, and
 * what those rules have actually caught. A policy nobody can see the effect of
 * tends to drift.
 */
export default async function AbusePage() {
  const t = await getDictionary();

  await requirePlatformAdmin();

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [policy, flagged, counts] = await Promise.all([
    getEditableContentPolicy(),
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        reason: campaigns.approvalReason,
        createdAt: campaigns.createdAt,
        organizationName: organizations.name,
      })
      .from(campaigns)
      .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
      .where(gte(campaigns.createdAt, since))
      .orderBy(desc(campaigns.createdAt))
      .limit(100),
    db
      .select({
        pending: sql<number>`count(*) filter (where ${campaigns.status} = 'PENDING_APPROVAL')::int`,
        rejected: sql<number>`count(*) filter (where ${campaigns.rejectedAt} is not null)::int`,
        approved: sql<number>`count(*) filter (where ${campaigns.approvedAt} is not null)::int`,
      })
      .from(campaigns)
      .where(gte(campaigns.createdAt, since)),
  ]);

  const held = flagged.filter((c) => c.reason !== null);
  const summary = counts[0] ?? { pending: 0, rejected: 0, approved: 0 };

  return (
    <>
      <PageHeader
        title={t.admin.abuse.title}
        description={t.admin.abuse.subheading}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t.admin.abuse.statPending} value={summary.pending} hint={t.admin.abuse.statPendingHint} />
        <Stat label={t.admin.abuse.statApproved} value={summary.approved} hint={t.admin.abuse.last30Days} />
        <Stat label={t.admin.abuse.statRejected} value={summary.rejected} hint={t.admin.abuse.last30Days} />
      </div>

      <div className="mt-5">
        <Notice tone="warning" title={t.admin.abuse.warnTitle}>
          {t.admin.abuse.warnBody}
        </Notice>
      </div>

      <div className="mt-5">
        <PolicyEditor policy={policy} />
      </div>

      <Card className="mt-5">
        <CardHeader
          title={t.admin.abuse.heldTitle}
          description={t.admin.abuse.heldDescription}
        />
        {held.length === 0 ? (
          <EmptyState
            title={t.admin.abuse.heldEmptyTitle}
            description={t.admin.abuse.heldEmptyBody}
            icon={<IconShield size={20} />}
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>{t.admin.colCampaign}</th>
                <th>{t.admin.colOrganization}</th>
                <th>{t.admin.abuse.colWhyHeld}</th>
                <th>{t.admin.colStatus}</th>
                <th>{t.admin.colCreated}</th>
              </tr>
            </thead>
            <tbody>
              {held.map((campaign) => (
                <tr key={campaign.id}>
                  <td>
                    <Link
                      href={`/admin/activity?campaignId=${campaign.id}`}
                      className="font-semibold text-ink hover:text-brand-700"
                    >
                      {campaign.name}
                    </Link>
                  </td>
                  <td className="text-muted">{campaign.organizationName}</td>
                  <td className="max-w-md text-muted">{campaign.reason}</td>
                  <td>
                    <Pill tone={toneFor(campaign.status)}>
                      {t.status.campaign[campaign.status]}
                    </Pill>
                  </td>
                  <td className="whitespace-nowrap text-muted">
                    {formatManila(campaign.createdAt)}
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

function toneFor(status: string) {
  if (status === "PENDING_APPROVAL") return "warning" as const;
  if (status === "CANCELLED") return "danger" as const;
  if (status === "FINISHED") return "success" as const;
  return "neutral" as const;
}
