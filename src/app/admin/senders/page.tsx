import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { organizations, senderIdentities } from "@/server/db/schema";
import { requirePlatformAdmin } from "@/server/auth/context";
import {
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  Notice,
  PageHeader,
  Pill,
  type Tone,
} from "@/components/ui";
import { IconTag } from "@/components/icons";
import { SenderDecision } from "./decision-form";
import { getDictionary, getI18n } from "@/i18n/server";
import { formatDateTime } from "@/i18n/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.admin.senders.title };
}
export const dynamic = "force-dynamic";

const TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "neutral",
  REVOKED: "danger",
};

export default async function SendersPage() {
  const { t, locale } = await getI18n();

  await requirePlatformAdmin();

  const rows = await db
    .select({
      id: senderIdentities.id,
      value: senderIdentities.value,
      status: senderIdentities.status,
      supportsInboundReplies: senderIdentities.supportsInboundReplies,
      evidenceNote: senderIdentities.evidenceNote,
      decisionReason: senderIdentities.decisionReason,
      decidedAt: senderIdentities.decidedAt,
      createdAt: senderIdentities.createdAt,
      organizationName: organizations.name,
    })
    .from(senderIdentities)
    .innerJoin(organizations, eq(organizations.id, senderIdentities.organizationId))
    .orderBy(desc(senderIdentities.createdAt))
    .limit(50);

  const pending = rows.filter((r) => r.status === "PENDING");
  const decided = rows.filter((r) => r.status !== "PENDING");

  return (
    <>
      <PageHeader
        title={t.admin.senders.title}
        description={t.admin.senders.subheading}
      />

      <div className="mb-5 max-w-3xl">
        <Notice tone="info" title={t.admin.senders.repliesTitle}>
          {t.adminExtra.repliesBody}
        </Notice>
      </div>

      <Card>
        <CardHeader title={t.adminExtra.awaitingReviewCount(pending.length)} />
        {pending.length === 0 ? (
          <EmptyState
            title={t.admin.senders.emptyQueueTitle}
            description={t.admin.senders.emptyQueueBody}
            icon={<IconTag size={20} />}
          />
        ) : (
          <div className="divide-y divide-line">
            {pending.map((sender) => (
              <div key={sender.id} className="px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-bold text-ink">{sender.value}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {t.adminExtra.senderLine(
                        sender.organizationName,
                        formatDateTime(sender.createdAt, locale),
                      )}
                    </p>
                  </div>
                  <Pill tone="warning">{t.admin.senders.pending}</Pill>
                </div>

                {sender.evidenceNote ? (
                  <p className="mt-3 rounded-[9px] bg-canvas p-3 text-[13px] text-body">
                    {sender.evidenceNote}
                  </p>
                ) : null}

                <div className="mt-4">
                  <SenderDecision senderId={sender.id} value={sender.value} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title={t.admin.senders.allTitle} />
        {decided.length === 0 ? (
          <EmptyState
            title={t.admin.senders.noDecisionsTitle}
            description={t.admin.senders.noDecisionsBody}
            icon={<IconTag size={20} />}
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>{t.admin.senders.colSender}</th>
                <th>{t.admin.colOrganization}</th>
                <th>{t.admin.colStatus}</th>
                <th>{t.admin.senders.colReplies}</th>
                <th>{t.admin.colReason}</th>
                <th>{t.admin.colDecided}</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((sender) => (
                <tr key={sender.id}>
                  <td>{sender.value}</td>
                  <td className="cell-title text-muted" title={sender.organizationName}>
                    {sender.organizationName}
                  </td>
                  <td>
                    <Pill tone={TONE[sender.status] ?? "neutral"}>
                      {t.status.sender[sender.status]}
                    </Pill>
                  </td>
                  <td className="text-muted">
                    {sender.supportsInboundReplies ? t.adminExtra.canReceive : t.adminExtra.oneWay}
                  </td>
                  <td className="cell-text text-muted">{sender.decisionReason ?? "—"}</td>
                  <td className="whitespace-nowrap text-muted">
                    {sender.decidedAt ? formatDateTime(sender.decidedAt, locale) : "—"}
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
