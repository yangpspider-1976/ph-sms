import { requireOrgContext } from "@/server/auth/context";
import { listPendingApproval } from "@/server/domain/approval";
import { formatCentavos, formatManila } from "@/server/config";
import { Card, CardHeader, EmptyState, Notice, PageHeader } from "@/components/ui";
import { IconShield } from "@/components/icons";
import { ApprovalDecision } from "./decision-form";
import { getDictionary } from "@/i18n/server";

export const metadata = { title: "Approvals" };
export const dynamic = "force-dynamic";

/**
 * Campaigns held by content checks.
 *
 * Nothing here has been sent, and nothing will be until someone decides. The
 * money is already reserved, which is why rejecting returns it explicitly.
 */
export default async function ApprovalsPage() {
  const t = await getDictionary();

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
                        formatManila(campaign.createdAt),
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
                    {t.approvalsExtra.scheduledNote(formatManila(campaign.scheduledAt))}
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
