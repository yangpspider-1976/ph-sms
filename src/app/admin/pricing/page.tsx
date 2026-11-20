import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/server/auth/context";
import { getEffectiveConfig, listConfig, configHistory } from "@/server/domain/app-config";
import { env } from "@/server/env";
import { Card, CardHeader, DataTable, DetailRow, EmptyState, Notice, PageHeader } from "@/components/ui";
import { getDictionary, getI18n } from "@/i18n/server";
import { formatDateTime, formatMoney } from "@/i18n/format";
import { ConfigEditor } from "../settings/config-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminPricing.title };
}

export const dynamic = "force-dynamic";

export default async function AdminPricingPage() {
  await requirePlatformAdmin();
  const { t, locale } = await getI18n();
  const [config, rows, history] = await Promise.all([
    getEffectiveConfig(), listConfig(), configHistory("unitPriceCentavos"),
  ]);
  return (
    <>
      <PageHeader title={t.adminPricing.title} description={t.adminPricing.description} />
      <div className="mb-5">
        <Notice tone="info" title={t.adminPricing.demoTitle}>{t.adminPricing.demoNote}</Notice>
      </div>
      <Card className="mb-5 p-5">
        <h2 className="card-title">{t.adminPricing.current}</h2>
        <dl className="mt-3">
          <DetailRow label={t.admin.settings.rowUnitPrice} value={t.adminExtra.perSegment(formatMoney(config.unitPriceCentavos, locale))} />
          <DetailRow label={t.admin.settings.rowPricingVersion} value={config.pricingPolicyVersion} />
          <DetailRow label={t.admin.settings.rowTaxVersion} value={config.taxPolicyVersion} />
          <DetailRow label={t.admin.settings.rowPricingApproved} value={config.pricingApproved ? t.common.yes : t.common.no} />
        </dl>
        <p className="mt-3 text-[13px] text-muted">{t.adminPricing.snapshotNote}</p>
      </Card>
      <ConfigEditor mode={env.APP_MODE} rows={rows.filter((row) => row.key === "unitPriceCentavos" || row.key === "quoteValiditySeconds").map((row) => ({ ...row, updatedAt: row.updatedAt?.toISOString() ?? null }))} />
      <Card className="mt-5">
        <CardHeader title={t.adminPricing.history} description={t.adminPricing.historyNote} />
        {history.length === 0 ? <EmptyState title={t.adminPricing.noHistory} description={t.adminPricing.noHistoryNote} /> : (
          <DataTable>
            <thead><tr><th>{t.adminPricing.changedAt}</th><th>{t.adminPricing.revision}</th><th>{t.admin.settings.rowUnitPrice}</th></tr></thead>
            <tbody>{history.map((row) => <tr key={`${row.key}:${row.version}`}><td>{formatDateTime(row.createdAt, locale)}</td><td>{row.version}</td><td>{formatMoney(Number(row.value), locale)}</td></tr>)}</tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
