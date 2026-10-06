import type { Metadata } from "next";
import { requireOrgContext } from "@/server/auth/context";
import { listOrganizationSuppressions } from "@/server/domain/suppression";
import {
  ButtonLink,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  Notice,
  PageHeader,
} from "@/components/ui";
import { IconBlock, IconDownload } from "@/components/icons";
import { OptOutForm } from "./opt-out-form";
import { getDictionary, getI18n } from "@/i18n/server";
import { formatDateTime } from "@/i18n/format";
import type { Dictionary } from "@/i18n/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.contacts.optOuts.title };
}
export const dynamic = "force-dynamic";

export default async function OptOutsPage() {
  const { t, locale } = await getI18n();

  const ctx = await requireOrgContext();
  const rows = await listOrganizationSuppressions(ctx.org.organizationId, 200);

  return (
    <>
      <PageHeader
        title={t.contacts.optOuts.title}
        description={t.contacts.optOuts.subheading}
        action={
          ctx.can("reports.export.masked") ? (
            <ButtonLink href="/app/exports?kind=suppression" variant="ghost" prefetch={false}>
              <IconDownload size={15} /> {t.common.export}
            </ButtonLink>
          ) : null
        }
      />

      <div className="mb-5 max-w-3xl">
        <Notice tone="info" title={t.contacts.optOuts.howUsed}>
          {t.contactsExtra.optOutUsage}
        </Notice>
      </div>

      {ctx.can("suppression.manage") ? (
        <div className="mb-5">
          <OptOutForm />
        </div>
      ) : null}

      <Card>
        <CardHeader title={t.contactsExtra.countOptedOut(rows.length)} />
        {rows.length === 0 ? (
          <EmptyState
            title={t.contacts.optOuts.emptyTitle}
            description={t.contacts.optOuts.emptyBody}
            icon={<IconBlock size={20} />}
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>{t.contacts.colRecipient}</th>
                <th>{t.contacts.optOuts.colReason}</th>
                <th>{t.contacts.optOuts.colSource}</th>
                <th>{t.contacts.optOuts.colRecorded}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono text-[12.5px]">{row.numberMasked}</td>
                  <td className="cell-text">{row.reason}</td>
                  <td className="text-muted">{sourceLabel(t, row.source)}</td>
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

/**
 * Suppression sources are free text in the schema rather than an enum, so an
 * unrecognised value falls back to the raw word instead of rendering nothing.
 */
function sourceLabel(t: Dictionary, source: string): string {
  const known = t.status.suppressionSource as Record<string, string | undefined>;
  return known[source] ?? t.status.unknown(source);
}
