import { desc, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { organizations } from "@/server/db/schema";
import { requirePlatformAdmin } from "@/server/auth/context";
import { formatManila } from "@/server/config";
import {
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
  Pill,
  type Tone,
} from "@/components/ui";
import { IconShield } from "@/components/icons";
import { VerificationDecision } from "./decision-form";
import { getDictionary } from "@/i18n/server";

export const metadata = { title: "Business verification" };
export const dynamic = "force-dynamic";

const TONE: Record<string, Tone> = {
  PENDING_REVIEW: "warning",
  NEEDS_INFORMATION: "warning",
  ACTIVE: "success",
  SUSPENDED: "danger",
  REJECTED: "neutral",
};

export default async function VerificationPage() {
  const t = await getDictionary();

  await requirePlatformAdmin();

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

      <Card>
        <CardHeader
          title={`Review queue (${queue.length})`}
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
                      Submitted {formatManila(org.createdAt)}
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
                  Personal ID scans are not collected. Verification is based on the business
                  registration details supplied.
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
                  <td>{org.name}</td>
                  <td>
                    <Pill tone={TONE[org.status] ?? "neutral"}>
                      {t.status.org[org.status]}
                    </Pill>
                  </td>
                  <td className="text-muted">{org.statusReason ?? "—"}</td>
                  <td className="whitespace-nowrap text-muted">
                    {org.statusChangedAt ? formatManila(org.statusChangedAt) : "—"}
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
