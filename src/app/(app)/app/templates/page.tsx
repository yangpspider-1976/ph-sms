import type { Metadata } from "next";
import { requireOrgContext } from "@/server/auth/context";
import { listTemplates } from "@/server/actions/templates";
import { analyzeMessage } from "@/server/domain/segments";
import { formatCentavos, formatManila, MOCK_DEFAULTS } from "@/server/config";
import { Card, CardHeader, EmptyState, PageHeader, Pill } from "@/components/ui";
import { IconDocument } from "@/components/icons";
import { TemplateForm } from "./template-form";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.templates.title };
}
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const t = await getDictionary();

  const ctx = await requireOrgContext();
  const rows = await listTemplates(ctx.org.organizationId);
  const active = rows.filter((t) => !t.archivedAt);

  return (
    <>
      <PageHeader
        title={t.templates.title}
        description={t.templates.subheading}
      />

      {ctx.can("templates.manage") ? (
        <div className="mb-5">
          <TemplateForm />
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={`${active.length} templates`}
          description={t.templates.segmentNote}
        />
        {active.length === 0 ? (
          <EmptyState
            title={t.templates.emptyTitle}
            description={t.templates.emptyBody}
            icon={<IconDocument size={20} />}
          />
        ) : (
          <div className="divide-y divide-line">
            {active.map((template) => {
              const info = analyzeMessage(template.body);
              const cost = info.segments * MOCK_DEFAULTS.unitPriceCentavos;
              return (
                <div key={template.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14.5px] font-bold text-ink">{template.name}</p>
                      <p className="mt-0.5 text-[12px] text-muted">
                        Version {template.version} · saved {formatManila(template.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone="neutral" dot={false}>
                        {info.encoding === "GSM7" ? "GSM-7" : t.common.unicode}
                      </Pill>
                      <Pill tone={info.segments > 1 ? "warning" : "success"} dot={false}>
                        {t.common.segments(info.segments)}
                      </Pill>
                      <Pill tone="neutral" dot={false}>
                        {formatCentavos(cost)} each
                      </Pill>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap rounded-[9px] bg-canvas p-3 text-[13px] text-body">
                    {template.body}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
