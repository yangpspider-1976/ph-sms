import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { senderIdentities, templates } from "@/server/db/schema";
import { requireOrgContext } from "@/server/auth/context";
import { getWallet } from "@/server/domain/wallet";
import { limitsFor, quotaUsage } from "@/server/domain/quota";
import { listTestRecipients } from "@/server/domain/test-send";
import { listGroups } from "@/server/domain/groups";
import { MOCK_DEFAULTS } from "@/server/config";
import { Card, Notice, PageHeader } from "@/components/ui";
import { SendWizard } from "./send-wizard";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.send.title };
}
export const dynamic = "force-dynamic";

export default async function SendPage({
  searchParams,
}: {
  searchParams: Promise<{ groupId?: string }>;
}) {
  const t = await getDictionary();

  const { groupId } = await searchParams;
  const ctx = await requireOrgContext();
  const orgId = ctx.org.organizationId;

  if (!ctx.can("campaign.send")) {
    return (
      <>
        <PageHeader title={t.send.title} description={t.send.subheading} />
        <Card className="max-w-2xl p-6">
          <Notice tone="warning" title={t.send.deniedTitle}>
            {t.send.deniedBody(t.roles.labels[ctx.org.role])}
          </Notice>
        </Card>
      </>
    );
  }

  const [senders, savedTemplates, wallet, usage, testRecipients, groups] = await Promise.all([
    db
      .select({
        id: senderIdentities.id,
        value: senderIdentities.value,
        supportsInboundReplies: senderIdentities.supportsInboundReplies,
      })
      .from(senderIdentities)
      .where(
        and(eq(senderIdentities.organizationId, orgId), eq(senderIdentities.status, "APPROVED")),
      ),
    db
      .select({ id: templates.id, name: templates.name, body: templates.body })
      .from(templates)
      .where(eq(templates.organizationId, orgId))
      .limit(20),
    getWallet(orgId),
    quotaUsage(db, orgId, limitsFor(MOCK_DEFAULTS)),
    listTestRecipients({ organizationId: orgId, userId: ctx.user.id }),
    listGroups(orgId),
  ]);

  return (
    <>
      <PageHeader title={t.send.title} description={t.send.subheading} />
      <SendWizard
        senders={senders}
        templates={savedTemplates}
        testRecipients={testRecipients}
        groups={groups.map((g) => ({ id: g.id, name: g.name, memberCount: g.memberCount }))}
        initialGroupId={groupId}
        limits={{
          ceiling: MOCK_DEFAULTS.selfServiceCeiling,
          maxSegments: MOCK_DEFAULTS.maxSegmentsPerMessage,
          maxScheduleDays: MOCK_DEFAULTS.maxScheduleDays,
          unitPriceCentavos: MOCK_DEFAULTS.unitPriceCentavos,
          dailyRemaining: usage.daily.remaining,
          availableCentavos: wallet.availableCentavos,
        }}
      />
    </>
  );
}
