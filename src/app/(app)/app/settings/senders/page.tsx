import { requireOrgContext } from "@/server/auth/context";
import { listSenders } from "@/server/actions/senders";
import { formatManila } from "@/server/config";
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
import { getDictionary } from "@/i18n/server";

export const metadata = { title: "Sender identities" };
export const dynamic = "force-dynamic";

const TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "neutral",
  REVOKED: "danger",
};

export default async function SenderIdentitiesPage() {
  const t = await getDictionary();

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
            You need at least one approved sender identity before any campaign can be submitted.
            Apply below; a reviewer checks the name against your registered business.
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
          title={`${rows.length} sender identit${rows.length === 1 ? "y" : "ies"}`}
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
                      Applied {formatManila(sender.createdAt)}
                      {sender.decidedAt ? ` · decided ${formatManila(sender.decidedAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {sender.status === "APPROVED" ? (
                      <Pill tone="neutral" dot={false}>
                        {sender.supportsInboundReplies ? "Can receive replies" : "One-way"}
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
                    This sender cannot receive replies, so your messages must not tell recipients
                    to reply STOP. Record opt-out requests on your opt-out list instead.
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
