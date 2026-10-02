import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { db } from "@/server/db";
import { inquiries } from "@/server/db/schema";
import { requirePlatformAdmin } from "@/server/auth/context";
import { formatManila } from "@/server/config";
import { Card, CardHeader, EmptyState, Notice, PageHeader, Pill, type Tone } from "@/components/ui";
import { IconDocument } from "@/components/icons";
import { InquiryForm } from "./inquiry-form";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminExtra.inquiriesPageTitle };
}
export const dynamic = "force-dynamic";

const TONE: Record<string, Tone> = {
  NEW: "info",
  CONTACTED: "info",
  REVIEWING: "warning",
  QUOTATION_SENT: "violet",
  CONTRACTED: "success",
  COMPLETED: "success",
  REJECTED: "neutral",
};

export default async function InquiriesPage() {
  const t = await getDictionary();

  await requirePlatformAdmin();

  const rows = await db.select().from(inquiries).orderBy(desc(inquiries.createdAt)).limit(50);

  return (
    <>
      <PageHeader
        title={t.adminExtra.inquiriesPageTitle}
        description={t.adminExtra.inquiriesPageSubheading}
      />

      <div className="mb-5 max-w-3xl">
        <Notice tone="info" title={t.adminExtra.crmOnlyTitle}>
          {t.adminExtra.crmOnlyBody}
        </Notice>
      </div>

      <Card>
        <CardHeader title={`${rows.length} inquiries`} />
        {rows.length === 0 ? (
          <EmptyState
            title={t.adminExtra.inquiriesPageEmptyTitle}
            description={t.adminExtra.inquiriesPageEmptyBody}
            icon={<IconDocument size={20} />}
          />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((inquiry) => (
              <div
                key={inquiry.id}
                className="px-5 py-5"
                data-testid="inquiry-card"
                data-company={inquiry.company}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-ink">{inquiry.company}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {inquiry.contactName} · {inquiry.contactEmail} ·{" "}
                      {formatManila(inquiry.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {inquiry.purpose === "PROMOTIONAL" ? (
                      <Pill tone="violet">{t.adminExtra.purposePromotional}</Pill>
                    ) : (
                      <Pill tone="neutral">{t.adminExtra.purposeInformational}</Pill>
                    )}
                    <Pill tone={TONE[inquiry.status] ?? "neutral"}>
                      {t.status.inquiry[inquiry.status]}
                    </Pill>
                  </div>
                </div>

                <dl className="mt-4 grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-3">
                  <Detail label={t.adminExtra.rowVolume} value={inquiry.estimatedVolume.toLocaleString()} />
                  <Detail label={t.adminExtra.rowFrequency} value={inquiry.frequency} />
                  <Detail label={t.adminExtra.rowPreferredDate} value={inquiry.preferredDate} />
                  <Detail label={t.adminExtra.rowAudience} value={inquiry.audience} />
                  <Detail label={t.adminExtra.rowConsentSource} value={inquiry.consentSource} />
                  <Detail label={t.adminExtra.rowSenderNeeds} value={inquiry.senderNeeds} />
                </dl>

                <div className="mt-3 rounded-[9px] bg-canvas p-3">
                  <p className="text-[12px] font-semibold text-ink">{t.adminExtra.sampleMessage}</p>
                  <p className="mt-1 text-[13px] text-body">{inquiry.sampleMessage}</p>
                </div>

                <div className="mt-4">
                  <InquiryForm
                    inquiryId={inquiry.id}
                    status={inquiry.status}
                    note={inquiry.internalNote}
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

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="text-[13px] font-medium text-ink">{value || "—"}</dd>
    </div>
  );
}
