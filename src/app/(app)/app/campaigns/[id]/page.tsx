import { notFound } from "next/navigation";
import { requireOrgContext } from "@/server/auth/context";
import {
  campaignSummaryForOrg,
  getCampaignForOrg,
  listCampaignItemsForOrg,
} from "@/server/domain/campaigns";
import { formatCentavos, formatManila } from "@/server/config";
import {
  Card,
  CardHeader,
  DataTable,
  DetailRow,
  Notice,
  PageHeader,
  Pill,
  Stat,
  type Tone,
} from "@/components/ui";
import { StopCampaignButton } from "./stop-button";
import { getDictionary } from "@/i18n/server";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  SCHEDULED: "success",
  QUEUED: "info",
  PROCESSING: "info",
  PAUSED_REVIEW: "warning",
  FINISHED: "success",
  CANCELLED: "neutral",
};

const SUBMISSION_TONE: Record<string, Tone> = {
  PENDING: "neutral",
  SUBMITTING: "info",
  ACCEPTED: "success",
  REJECTED: "danger",
  UNKNOWN: "warning",
  CANCELLED: "neutral",
  EXCLUDED: "neutral",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getDictionary();

  const { id } = await params;
  const ctx = await requireOrgContext();

  // Scoped by organization: another tenant's id simply does not resolve.
  const campaign = await getCampaignForOrg(id, ctx.org.organizationId);
  if (!campaign) notFound();

  const [counts, items] = await Promise.all([
    campaignSummaryForOrg(campaign.id, ctx.org.organizationId),
    listCampaignItemsForOrg(campaign.id, ctx.org.organizationId),
  ]);

  const stoppable = ["SCHEDULED", "QUEUED", "PROCESSING", "PAUSED_REVIEW"].includes(
    campaign.status,
  );

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={`${campaign.senderValueSnapshot} · ${campaign.purpose.toLowerCase()} · ${
          campaign.encoding === "GSM7" ? "GSM-7" : "Unicode"
        }`}
        action={
          stoppable && ctx.can("campaign.cancel") ? (
            <StopCampaignButton campaignId={campaign.id} />
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Pill tone={STATUS_TONE[campaign.status] ?? "neutral"}>
          {t.status.campaign[campaign.status]}
        </Pill>
        {campaign.status === "FINISHED" ? (
          <span className="text-[12.5px] text-muted">
            {t.campaignDetail.finishedNote}
          </span>
        ) : null}
      </div>

      {campaign.status === "PENDING_APPROVAL" ? (
        <div className="mb-5">
          <Notice tone="warning" title={t.campaignDetail.heldTitle}>
            {campaign.approvalReason ?? t.campaignDetail.heldFallback}{" "}
            {t.campaignDetail.heldBody}
          </Notice>
        </div>
      ) : null}

      {campaign.rejectionReason ? (
        <div className="mb-5">
          <Notice tone="danger" title={t.campaignDetail.rejectedTitle}>
            {campaign.rejectionReason} {t.campaignDetail.rejectedBody}
          </Notice>
        </div>
      ) : null}

      {campaign.status === "PAUSED_REVIEW" ? (
        <div className="mb-5">
          <Notice tone="warning" title={t.campaignDetail.pausedTitle}>
            {campaign.pausedReason ?? t.campaignDetail.pausedFallback}{" "}
            {t.campaignDetail.pausedBody}
          </Notice>
        </div>
      ) : null}

      {campaign.status === "CANCELLED" ? (
        <div className="mb-5">
          <Notice tone="info" title={t.campaignDetail.stoppedTitle}>
            {t.campaignDetail.stoppedPrevented(counts.cancelled)}
            {counts.accepted > 0 ? t.campaignDetail.stoppedAccepted(counts.accepted) : ""}
            {counts.unresolved > 0 ? t.campaignDetail.stoppedUnresolved(counts.unresolved) : ""}
          </Notice>
        </div>
      ) : null}

      {counts.unresolved > 0 ? (
        <div className="mb-5">
          <Notice tone="warning" title={`${counts.unresolved} message(s) unresolved`}>
            The connection dropped after these were submitted, so we cannot say whether the
            provider accepted them. They are not retried automatically, because that risks
            sending twice. Their cost stays held pending reconciliation.
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label={t.campaignDetail.statRecipients} value={campaign.includedCount} />
        <Stat label={t.campaignDetail.statAccepted} value={counts.accepted} tone="success" />
        <Stat label={t.campaignDetail.statDelivered} value={counts.delivered} hint={t.campaignDetail.statDeliveredHint} />
        <Stat label={t.campaignDetail.statNotDelivered} value={counts.undelivered + counts.rejected} />
        <Stat label={t.campaignDetail.statCharged} value={formatCentavos(counts.charged)} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title={t.campaignDetail.recipientsTitle}
            description={t.campaignDetail.recipientsDescription}
          />
                      <DataTable>
              <thead>
                <tr>
                  <th>{t.campaignDetail.colRecipient}</th>
                  <th>{t.campaignDetail.colSubmission}</th>
                  <th>{t.campaignDetail.colDelivery}</th>
                  <th>{t.campaignDetail.colSegments}</th>
                  <th>{t.campaignDetail.colCost}</th>
                  <th>{t.campaignDetail.colDetail}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="font-mono text-[12.5px]">{item.numberMasked}</td>
                    <td>
                      <Pill tone={SUBMISSION_TONE[item.submissionStatus] ?? "neutral"}>
                        {t.status.submission[item.submissionStatus]}
                      </Pill>
                    </td>
                    <td className="text-muted">
                      {item.submissionStatus === "ACCEPTED"
                        ? t.status.delivery[item.deliveryStatus]
                        : "—"}
                    </td>
                    <td>{item.segments}</td>
                    <td>{item.charged ? formatCentavos(item.costCentavos) : "—"}</td>
                    <td className="text-muted">
                      {item.excludedReason ?? item.errorCode ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
        </Card>

        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <h2 className="card-title">{t.campaignDetail.messageTitle}</h2>
            <p className="mt-2 whitespace-pre-wrap rounded-[9px] bg-canvas p-3 text-[13px] text-ink">
              {campaign.body}
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="card-title">{t.campaignDetail.detailsTitle}</h2>
            <dl className="mt-2">
              <DetailRow label={t.campaignDetail.rowSender} value={campaign.senderValueSnapshot} />
              <DetailRow label={t.campaignDetail.rowRequested} value={campaign.requestedCount} />
              <DetailRow
                label={t.campaignDetail.rowExcluded}
                value={
                  campaign.requestedCount -
                  campaign.includedCount +
                  counts.excluded +
                  counts.cancelled
                }
              />
              <DetailRow label={t.campaignDetail.rowIncluded} value={campaign.includedCount} />
              <DetailRow
                label={t.campaignDetail.rowSegmentsEach}
                value={campaign.segmentsPerMessage}
              />
              <DetailRow
                label={t.campaignDetail.rowPricePerSegment}
                value={formatCentavos(campaign.unitPriceCentavos)}
              />
              <DetailRow
                label={t.campaignDetail.rowMaxAuthorized}
                value={formatCentavos(campaign.maxAuthorizedCostCentavos)}
              />
              <DetailRow
                label={campaign.scheduledAt ? t.campaignDetail.rowScheduledFor : t.common.created}
                value={formatManila(campaign.scheduledAt ?? campaign.createdAt)}
              />
              {campaign.finishedAt ? (
                <DetailRow label={t.campaignDetail.rowFinished} value={formatManila(campaign.finishedAt)} />
              ) : null}
            </dl>
            <p className="mt-3 text-[12px] text-muted">
              {t.campaignDetail.timesNote}
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
