import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { campaigns } from "@/server/db/schema";
import { requireOrgContext } from "@/server/auth/context";
import { listPendingApproval } from "@/server/domain/approval";
import { formatCentavos } from "@/server/config";
import { Card, CardHeader, EmptyState, Notice, PageHeader } from "@/components/ui";
import { IconShield } from "@/components/icons";
import { ApprovalDecision } from "./decision-form";
import { getDictionary, getI18n } from "@/i18n/server";
import { formatDateTime } from "@/i18n/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.approvals.metaTitle };
}
export const dynamic = "force-dynamic";

/**
 * Campaigns held by content checks.
 *
 * Nothing here has been sent, and nothing will be until someone decides. The
 * money is already reserved, which is why rejecting returns it explicitly.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ decided?: string }>;
}) {
  const { t, locale } = await getI18n();

  const ctx = await requireOrgContext();

  if (!ctx.can("campaign.approve")) {
    return (
      <>
        <PageHeader title={t.approvals.title} description={t.approvals.subheadingDenied} />
        <Card className="max-w-2xl p-6">
          <Notice tone="warning" title={t.approvals.deniedTitle}>
            {t.approvalsExtra.deniedBody}
          </Notice>
        </Card>
      </>
    );
  }

  const pending = await listPendingApproval(ctx.org.organizationId);

  // Set after a decision. Read back from the campaign — scoped to this
  // organization — so the notice states what was stored, not what was asked.
  const { decided: decidedId } = await searchParams;
  const decided =
    decidedId && UUID.test(decidedId)
      ? (
          await db
            .select({
              name: campaigns.name,
              approvedAt: campaigns.approvedAt,
              rejectedAt: campaigns.rejectedAt,
              scheduledAt: campaigns.scheduledAt,
            })
            .from(campaigns)
            .where(
              and(eq(campaigns.id, decidedId), eq(campaigns.organizationId, ctx.org.organizationId)),
            )
            .limit(1)
        )[0]
      : undefined;
  const decidedNotice = !decided
    ? null
    : decided.rejectedAt
      ? t.approvalsExtra.rejectedNotice(decided.name)
      : decided.approvedAt
        ? decided.scheduledAt
          ? t.approvalsExtra.approvedScheduledNotice(decided.name, formatDateTime(decided.scheduledAt, locale))
          : t.approvalsExtra.approvedNotice(decided.name)
        : null;

  return (
    <>
      <PageHeader
        title={t.approvals.title}
        description={t.approvals.subheading}
      />

      {ctx.org.role === "APPROVER" ? (
        <div className="mb-5 max-w-3xl">
          <Notice tone="info" title={t.approvals.separationTitle}>
            {t.approvalsExtra.approverSeparationBody}
          </Notice>
        </div>
      ) : null}

      {decidedNotice ? (
        <div className="mb-5 max-w-3xl">
          <Notice tone="success" title={t.approvals.decisionRecorded}>
            {decidedNotice}
          </Notice>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={t.approvalsExtra.awaitingDecision(pending.length)}
          description={t.approvals.fundsNote}
        />
        {pending.length === 0 ? (
          <EmptyState
            title={t.approvals.emptyTitle}
            description={t.approvals.emptyBody}
            icon={<IconShield size={20} />}
          />
        ) : (
          <div className="divide-y divide-line">
            {pending.map((campaign) => (
              <div key={campaign.id} className="px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-ink">{campaign.name}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {t.approvalsExtra.summary(
                        campaign.senderValue,
                        campaign.includedCount,
                        formatCentavos(campaign.maxAuthorizedCostCentavos),
                        formatDateTime(campaign.createdAt, locale),
                      )}
                    </p>
                  </div>
                </div>

                {campaign.approvalReason ? (
                  <div className="mt-3">
                    <Notice tone="warning" title={t.approvals.whyHeld}>
                      {campaign.approvalReason}
                    </Notice>
                  </div>
                ) : null}

                <div className="mt-3 rounded-[9px] bg-canvas p-3">
                  <p className="text-[12px] font-semibold text-ink">{t.approvals.message}</p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] text-body">
                    {campaign.body}
                  </p>
                </div>

                {campaign.scheduledAt ? (
                  <p className="mt-2 text-[12.5px] text-muted">
                    {t.approvalsExtra.scheduledNote(formatDateTime(campaign.scheduledAt, locale))}
                  </p>
                ) : null}

                <div className="mt-4">
                  <ApprovalDecision
                    campaignId={campaign.id}
                    isOwnWork={campaign.createdBy === ctx.user.id}
                    canSelfApprove={ctx.org.role === "OWNER"}
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
