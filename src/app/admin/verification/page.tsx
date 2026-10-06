import type { Metadata } from "next";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { organizations } from "@/server/db/schema";
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
import { IconShield } from "@/components/icons";
import { VerificationDecision } from "./decision-form";
import { getDictionary, getI18n } from "@/i18n/server";
import { formatDateTime } from "@/i18n/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.admin.verification.title };
}
export const dynamic = "force-dynamic";

const TONE: Record<string, Tone> = {
  PENDING_REVIEW: "warning",
  NEEDS_INFORMATION: "warning",
  ACTIVE: "success",
  SUSPENDED: "danger",
  REJECTED: "neutral",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function VerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ decided?: string }>;
}) {
  const { t, locale } = await getI18n();

  await requirePlatformAdmin();

  // Set after a decision is recorded. Read back from the database rather than
  // echoed from the form, so the notice states what is actually stored.
  const { decided: decidedId } = await searchParams;
  const justDecided =
    decidedId && UUID.test(decidedId)
      ? (
          await db
            .select({ name: organizations.name, status: organizations.status })
            .from(organizations)
            .where(eq(organizations.id, decidedId))
            .limit(1)
        )[0]
      : undefined;

  const queue = await db
    .select()
    .from(organizations)
    .where(inArray(organizations.status, ["PENDING_REVIEW", "NEEDS_INFORMATION"]))
    .orderBy(organizations.createdAt);

  const decided = await db
    .select()
    .from(organizations)
    .where(inArray(organizations.status, ["ACTIVE", "SUSPENDED", "REJECTED"]))
    .orderBy(desc(organizations.statusChangedAt))
    .limit(10);

  return (
    <>
      <PageHeader
        title={t.admin.verification.title}
        description={t.admin.verification.subheading}
      />

      {justDecided ? (
        <div className="mb-5 max-w-3xl">
          <Notice tone="success" title={t.admin.verification.recordedTitle}>
            {t.admin.verification.recordedBody(justDecided.name, t.status.org[justDecided.status])}
          </Notice>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={t.adminExtra.reviewQueueCount(queue.length)}
          description={t.admin.verification.queueDescription}
        />
        {queue.length === 0 ? (
          <EmptyState
            title={t.admin.verification.emptyTitle}
            description={t.admin.verification.emptyBody}
            icon={<IconShield size={20} />}
          />
        ) : (
          <div className="divide-y divide-line">
            {queue.map((org) => (
              <div key={org.id} className="px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-ink">{org.name}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {t.adminExtra.submittedAt(formatDateTime(org.createdAt, locale))}
                    </p>
                  </div>
                  <Pill tone={TONE[org.status] ?? "neutral"}>
                    {t.status.org[org.status]}
                  </Pill>
                </div>

                <dl className="mt-4 grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
                  <Detail label={t.admin.verification.rowRegistration} value={org.registrationId} />
                  <Detail label={t.admin.verification.rowIndustry} value={org.industry} />
                  <Detail label={t.admin.verification.rowAddress} value={org.address} />
                  <Detail label={t.admin.verification.rowWebsite} value={org.websiteUrl} />
                  <Detail label={t.admin.verification.rowContact} value={org.contactName} />
                  <Detail label={t.admin.verification.rowPhone} value={org.contactPhone} />
                </dl>

                {org.intendedUsage ? (
                  <div className="mt-3 rounded-[9px] bg-canvas p-3">
                    <p className="text-[12px] font-semibold text-ink">{t.admin.verification.statedPurpose}</p>
                    <p className="mt-1 text-[13px] text-body">{org.intendedUsage}</p>
                  </div>
                ) : null}

                <p className="mt-3 text-[12px] text-muted">
                  {t.adminExtra.noIdScansNote}
                </p>

                <div className="mt-4">
                  <VerificationDecision organizationId={org.id} name={org.name} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title={t.admin.verification.recentTitle} />
        {decided.length === 0 ? (
          <EmptyState
            title={t.admin.verification.noDecisionsTitle}
            description={t.admin.verification.noDecisionsBody}
            icon={<IconShield size={20} />}
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>{t.admin.verification.colBusiness}</th>
                <th>{t.admin.colStatus}</th>
                <th>{t.admin.colReason}</th>
                <th>{t.admin.colDecided}</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((org) => (
                <tr key={org.id}>
                  <td className="cell-title" title={org.name}>
                    {org.name}
                  </td>
                  <td>
                    <Pill tone={TONE[org.status] ?? "neutral"}>
                      {t.status.org[org.status]}
                    </Pill>
                  </td>
                  <td className="cell-text text-muted">{org.statusReason ?? "—"}</td>
                  <td className="whitespace-nowrap text-muted">
                    {org.statusChangedAt ? formatDateTime(org.statusChangedAt, locale) : "—"}
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

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="text-[13px] font-medium text-ink">{value || "—"}</dd>
    </div>
  );
}
