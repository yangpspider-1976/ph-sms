import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { campaigns, memberships, organizations, wallets } from "@/server/db/schema";
import { requirePlatformAdmin } from "@/server/auth/context";
import { MOCK_DEFAULTS, formatCentavos, formatManila } from "@/server/config";
import { Card, CardHeader, EmptyState, PageHeader, Pill, type Tone } from "@/components/ui";
import { IconUsers } from "@/components/icons";
import { LimitsForm } from "./limits-form";
import { getDictionary } from "@/i18n/server";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

const TONE: Record<string, Tone> = {
  PENDING_REVIEW: "warning",
  NEEDS_INFORMATION: "warning",
  ACTIVE: "success",
  SUSPENDED: "danger",
  REJECTED: "neutral",
};

export default async function CustomersPage() {
  const t = await getDictionary();

  await requirePlatformAdmin();

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      status: organizations.status,
      createdAt: organizations.createdAt,
      dailyLimit: organizations.dailyDestinationLimit,
      monthlyLimit: organizations.monthlyDestinationLimit,
      balance: wallets.postedBalanceCentavos,
      held: wallets.heldCentavos,
      frozen: wallets.sendingFrozen,
      members: sql<number>`(
        select count(*) from ${memberships}
        where ${memberships.organizationId} = ${organizations.id}
      )::int`,
      campaignCount: sql<number>`(
        select count(*) from ${campaigns}
        where ${campaigns.organizationId} = ${organizations.id}
      )::int`,
    })
    .from(organizations)
    .leftJoin(wallets, eq(wallets.organizationId, organizations.id))
    .orderBy(desc(organizations.createdAt))
    .limit(100);

  return (
    <>
      <PageHeader
        title={t.admin.customers.title}
        description={t.admin.customers.subheading}
      />

      <Card>
        <CardHeader
          title={`${rows.length} organizations`}
          description={`Blank limits use the platform defaults of ${MOCK_DEFAULTS.dailyDestinationQuota}/day and ${MOCK_DEFAULTS.monthlyDestinationQuota}/month.`}
        />
        {rows.length === 0 ? (
          <EmptyState
            title={t.admin.customers.emptyTitle}
            description={t.admin.customers.emptyBody}
            icon={<IconUsers size={20} />}
          />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((org) => (
              <div key={org.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-bold text-ink">{org.name}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {org.members} member{org.members === 1 ? "" : "s"} · {org.campaignCount}{" "}
                      campaign{org.campaignCount === 1 ? "" : "s"} · joined{" "}
                      {formatManila(org.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {org.frozen ? <Pill tone="danger">{t.admin.customers.sendingFrozen}</Pill> : null}
                    <Pill tone="neutral" dot={false}>
                      {formatCentavos((org.balance ?? 0) - (org.held ?? 0))} available
                    </Pill>
                    <Pill tone={TONE[org.status] ?? "neutral"}>
                      {t.status.org[org.status]}
                    </Pill>
                  </div>
                </div>

                <div className="mt-3">
                  <LimitsForm
                    organizationId={org.id}
                    daily={org.dailyLimit ?? MOCK_DEFAULTS.dailyDestinationQuota}
                    monthly={org.monthlyLimit ?? MOCK_DEFAULTS.monthlyDestinationQuota}
                    usingDefaults={org.dailyLimit === null}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
