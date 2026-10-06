import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/server/auth/context";
import { listPlatformSuppressions } from "@/server/domain/suppression";
import {
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  Notice,
  PageHeader,
} from "@/components/ui";
import { IconBlock } from "@/components/icons";
import { PlatformBlockForm } from "./block-form";
import { getDictionary, getI18n } from "@/i18n/server";
import { formatDateTime } from "@/i18n/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminNav.suppression };
}
export const dynamic = "force-dynamic";

export default async function AdminSuppressionPage() {
  const { t, locale } = await getI18n();

  await requirePlatformAdmin();
  const rows = await listPlatformSuppressions(200);

  return (
    <>
      <PageHeader
        title={t.admin.suppression.title}
        description={t.admin.suppression.subheading}
      />

      <div className="mb-5 max-w-3xl">
        <Notice tone="warning" title={t.admin.suppression.notSameTitle}>
          {t.adminExtra.platformBlockNotice}
        </Notice>
      </div>

      <div className="mb-5">
        <PlatformBlockForm />
      </div>

      <Card>
        <CardHeader
          title={t.adminExtra.blockedCount(rows.length)}
          description={t.admin.suppression.maskedNote}
        />
        {rows.length === 0 ? (
          <EmptyState
            title={t.admin.suppression.emptyTitle}
            description={t.admin.suppression.emptyBody}
            icon={<IconBlock size={20} />}
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>{t.contacts.colRecipient}</th>
                <th>{t.admin.colReason}</th>
                <th>{t.contacts.optOuts.colSource}</th>
                <th>{t.admin.suppression.colBlocked}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono text-[12.5px]">{row.numberMasked}</td>
                  <td className="cell-text">{row.reason}</td>
                  <td className="text-muted">
                    {(t.status.suppressionSource as Record<string, string>)[row.source] ??
                      t.status.unknown(row.source)}
                  </td>
                  <td className="whitespace-nowrap text-muted">{formatDateTime(row.createdAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
