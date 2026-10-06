import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { imports } from "@/server/db/schema";
import { requireOrgContext } from "@/server/auth/context";
import { getImportRows } from "@/server/domain/contacts";
import { getI18n } from "@/i18n/server";
import { formatDateTime } from "@/i18n/format";
import {
  Card,
  CardHeader,
  DataTable,
  DetailRow,
  Notice,
  PageHeader,
  Pill,
  type Tone,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const ROW_TONE: Record<string, Tone> = {
  ELIGIBLE: "success",
  BLANK: "neutral",
  INVALID: "warning",
  DUPLICATE: "neutral",
  SUPPRESSED: "violet",
  OVER_CEILING: "warning",
};

export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t, locale } = await getI18n();

  const { id } = await params;
  const ctx = await requireOrgContext();

  const record = (
    await db
      .select()
      .from(imports)
      .where(and(eq(imports.id, id), eq(imports.organizationId, ctx.org.organizationId)))
      .limit(1)
  )[0];
  if (!record) notFound();

  const rows = await getImportRows(id, ctx.org.organizationId);

  return (
    <>
      <PageHeader title={record.filename} description={t.contacts.imports.subheading} />

      {record.status === "EXPIRED" ? (
        <div className="mb-5 max-w-2xl">
          <Notice tone="neutral" title={t.contacts.imports.expiredTitle}>
            {t.contacts.imports.expiredBody}
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title={t.contacts.imports.rowsTitle} description={t.contacts.imports.rowsDescription} />
          {rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">
              {t.contacts.imports.noRowsStored}
            </p>
          ) : (
                          <DataTable>
                <thead>
                  <tr>
                    <th>{t.contactsExtra.colRow}</th>
                    <th>{t.contacts.colRecipient}</th>
                    <th>{t.contacts.imports.colResult}</th>
                    <th>{t.contacts.optOuts.colReason}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.sourceRowNumber}</td>
                      <td
                        className="cell-title font-mono text-[12px]"
                        title={row.numberMasked ? undefined : (row.rawValue ?? undefined)}
                      >
                        {row.numberMasked ?? row.rawValue ?? "—"}
                      </td>
                      <td>
                        <Pill tone={ROW_TONE[row.status] ?? "neutral"}>
                          {t.status.importRow[row.status]}
                        </Pill>
                      </td>
                      <td className="text-muted">{row.reasonDetail ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="card-title">{t.contacts.imports.summary}</h2>
          <dl className="mt-2">
            <DetailRow label={t.contacts.imports.rowsRead} value={record.rawRowCount} />
            <DetailRow label={t.contacts.imports.eligible} value={record.eligibleCount} />
            <DetailRow label={t.contacts.imports.blank} value={record.blankCount} />
            <DetailRow label={t.contacts.imports.invalid} value={record.invalidCount} />
            <DetailRow label={t.contacts.imports.duplicate} value={record.duplicateCount} />
            <DetailRow label={t.contacts.imports.optedOut} value={record.suppressedCount} />
            <DetailRow label={t.contacts.imports.uploaded} value={formatDateTime(record.createdAt, locale)} />
            <DetailRow
              label={t.contacts.imports.originalDeleted}
              value={record.expiresAt ? formatDateTime(record.expiresAt, locale) : "—"}
            />
          </dl>
        </Card>
      </div>
    </>
  );
}
