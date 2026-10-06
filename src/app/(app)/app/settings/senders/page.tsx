import type { Metadata } from "next";
import { requireOrgContext } from "@/server/auth/context";
import { listSenders } from "@/server/actions/senders";
import { demoFeaturesEnabled } from "@/server/env";
import {
  Card,
  CardHeader,
  EmptyState,
  Notice,
  PageHeader,
  Pill,
  type Tone,
} from "@/components/ui";
import { IconTag } from "@/components/icons";
import { SenderApplicationForm } from "./application-form";
import { DemoApproveButton } from "./demo-approve-button";
import { getDictionary, getI18n } from "@/i18n/server";
import { formatDateTime } from "@/i18n/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.settings.senders.title };
}
export const dynamic = "force-dynamic";

const TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "neutral",
  REVOKED: "danger",
};

export default async function SenderIdentitiesPage() {
  const { t, locale } = await getI18n();

  const ctx = await requireOrgContext();
  const rows = await listSenders(ctx.org.organizationId);
  const approved = rows.filter((s) => s.status === "APPROVED");

  return (
    <>
      <PageHeader
        title={t.settings.senders.title}
        description={t.settings.senders.subheading}
      />

      {approved.length === 0 ? (
        <div className="mb-5 max-w-3xl">
          <Notice tone="warning" title={t.settings.senders.cannotSendTitle}>
            {t.settings.senders.cannotSendBody}
          </Notice>
        </div>
      ) : null}

      {ctx.can("sender.apply") ? (
        <div className="mb-5">
          <SenderApplicationForm />
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={t.settings.senders.count(rows.length)}
          description={t.settings.senders.approvalNote}
        />
        {rows.length === 0 ? (
          <EmptyState
            title={t.settings.senders.emptyTitle}
            description={t.settings.senders.emptyBody}
            icon={<IconTag size={20} />}
          />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((sender) => (
              <div key={sender.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-ink">{sender.value}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {t.settings.senders.timeline(
                        formatDateTime(sender.createdAt, locale),
                        sender.decidedAt ? formatDateTime(sender.decidedAt, locale) : null,
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {sender.status === "APPROVED" ? (
                      <Pill tone="neutral" dot={false}>
                        {sender.supportsInboundReplies
                            ? t.settings.senders.canReceiveReplies
                            : t.settings.senders.oneWay}
                      </Pill>
                    ) : null}
                    <Pill tone={TONE[sender.status] ?? "neutral"}>
                      {t.status.sender[sender.status]}
                    </Pill>
                  </div>
                </div>

                {sender.decisionReason ? (
                  <p className="mt-2 text-[13px] text-body">{sender.decisionReason}</p>
                ) : null}

                {sender.status === "APPROVED" && !sender.supportsInboundReplies ? (
                  <p className="mt-2 text-[12.5px] text-muted">
                    {t.settings.senders.oneWayNote}
                  </p>
                ) : null}

                {sender.status === "PENDING" && demoFeaturesEnabled() ? (
                  <div className="mt-3">
                    <DemoApproveButton senderId={sender.id} value={sender.value} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
