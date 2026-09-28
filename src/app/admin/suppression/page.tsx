import { requirePlatformAdmin } from "@/server/auth/context";
import { listPlatformSuppressions } from "@/server/domain/suppression";
import { formatManila } from "@/server/config";
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
import { getDictionary } from "@/i18n/server";

export const metadata = { title: "Suppression" };
export const dynamic = "force-dynamic";

export default async function AdminSuppressionPage() {
  const t = await getDictionary();

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
          A block here stops every organization from messaging that number. A customer&apos;s own
          opt-out list only affects that customer, is invisible to others, and cannot be edited
          from this screen. Use this only where a platform-level safety or abuse reason applies.
        </Notice>
      </div>

      <div className="mb-5">
        <PlatformBlockForm />
      </div>

      <Card>
        <CardHeader
          title={`${rows.length} blocked platform-wide`}
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
                  <td>{row.reason}</td>
                  <td className="text-muted">{row.source.toLowerCase()}</td>
                  <td className="whitespace-nowrap text-muted">{formatManila(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
