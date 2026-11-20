import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/server/auth/context";
import { getDictionary, getI18n } from "@/i18n/server";
import { formatDateTime, formatMoney, formatNumber } from "@/i18n/format";
import { campaignName } from "@/i18n/campaign-name";
import { getReportsForOrg, parseReportFilters, reportQuery, REPORT_PURPOSES, REPORT_STATUSES } from "@/server/domain/reports";
import { Button, ButtonLink, Card, CardHeader, DataTable, DownloadButton, EmptyState, Field, Input, Notice, PageHeader, Select, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).reports.title };
}

export default async function ReportsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("reports.view");
  const { t, locale } = await getI18n();
  const r = t.reports;
  let filters;
  let invalid = false;
  try { filters = parseReportFilters(await searchParams); }
  catch { filters = parseReportFilters({}); invalid = true; }
  const report = invalid ? null : await getReportsForOrg(ctx.org.organizationId, filters);
  return <>
    <PageHeader title={r.title} description={r.description} action={
      !invalid && ctx.can("reports.export.masked") ? <DownloadButton href={`/app/exports?kind=reports&${reportQuery(filters)}`}>{r.download}</DownloadButton> : null
    } />
    <Card className="mb-5 p-5">
      <form action="/app/reports" className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Field label={r.from} htmlFor="report-from"><Input id="report-from" type="date" name="from" defaultValue={filters.from} required /></Field>
        <Field label={r.to} htmlFor="report-to"><Input id="report-to" type="date" name="to" defaultValue={filters.to} required /></Field>
        <Field label={r.status} htmlFor="report-status"><Select id="report-status" name="status" defaultValue={filters.status}>
          <option value="">{t.common.all}</option>{REPORT_STATUSES.map((status) => <option key={status} value={status}>{t.status.campaign[status]}</option>)}
        </Select></Field>
        <Field label={r.purpose} htmlFor="report-purpose"><Select id="report-purpose" name="purpose" defaultValue={filters.purpose}>
          <option value="">{t.common.all}</option>{REPORT_PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{t.status.purpose[purpose]}</option>)}
        </Select></Field>
        <Button type="submit">{r.apply}</Button>
      </form>
    </Card>
    {invalid ? <Notice tone="danger" title={r.invalidFilters} /> : null}
    {report ? <>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={r.campaigns} value={formatNumber(report.totals.campaigns, locale)} />
        <Stat label={r.recipients} value={formatNumber(report.totals.recipients, locale)} />
        <Stat label={r.accepted} value={formatNumber(report.totals.accepted, locale)} />
        <Stat label={r.delivered} value={formatNumber(report.totals.delivered, locale)} tone="success" />
        <Stat label={r.notDelivered} value={formatNumber(report.totals.notDelivered, locale)} />
        <Stat label={r.unresolved} value={formatNumber(report.totals.unresolved, locale)} />
        <Stat label={r.charged} value={formatMoney(report.totals.charged, locale)} />
        <Stat label={r.authorized} value={formatMoney(report.totals.authorized, locale)} />
      </div>
      <p className="mb-2 text-sm text-muted">{r.totalsNote}</p>
      <p className="mb-5 max-w-4xl text-sm text-muted">{r.accountingNote}</p>
      <Card>
        <CardHeader title={r.results} description={r.exportLimit} />
        {report.rows.length === 0 ? <EmptyState title={r.emptyTitle} description={r.emptyBody} /> :
          <DataTable><thead><tr>
            <th>{r.campaign}</th><th>{r.created}</th><th>{r.status}</th><th>{r.recipients}</th>
            <th>{r.accepted}</th><th>{r.delivered}</th><th>{r.notDelivered}</th><th>{r.unresolved}</th><th>{r.charged}</th><th>{r.details}</th>
          </tr></thead><tbody>{report.rows.map((row) => <tr key={row.id}>
            <td className="cell-title"><Link href={`/app/campaigns/${row.id}`} className="hover:text-brand-700">{campaignName(row, t, locale)}</Link></td>
            <td>{formatDateTime(row.createdAt, locale)}</td><td>{t.status.campaign[row.status]}</td>
            <td>{formatNumber(row.recipients, locale)}</td><td>{formatNumber(row.accepted, locale)}</td>
            <td>{formatNumber(row.delivered, locale)}</td><td>{formatNumber(row.notDelivered, locale)}</td>
            <td>{formatNumber(row.unresolved, locale)}</td><td>{formatMoney(row.charged, locale)}</td>
            <td>{ctx.can("reports.export.masked") ? <DownloadButton href={`/app/exports?kind=campaign&campaignId=${row.id}`}>{t.common.download}</DownloadButton> : t.common.dash}</td>
          </tr>)}</tbody></DataTable>}
      </Card>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{r.page(report.page, report.pages, report.totals.campaigns)}</p>
        <div className="flex gap-2">
          {report.page > 1 ? <ButtonLink size="sm" variant="ghost" href={`/app/reports?${reportQuery(filters, report.page - 1)}`}>{r.previous}</ButtonLink> : null}
          {report.page < report.pages ? <ButtonLink size="sm" variant="ghost" href={`/app/reports?${reportQuery(filters, report.page + 1)}`}>{r.next}</ButtonLink> : null}
        </div>
      </div>
    </> : null}
  </>;
}
