import type { Metadata } from "next";
import { requireOrgContext } from "@/server/auth/context";
import { listOrganizationSuppressions } from "@/server/domain/suppression";
import { formatManila } from "@/server/config";
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
import { getDictionary } from "@/i18n/server";
import type { Dictionary } from "@/i18n/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.contacts.optOuts.title };
}
export const dynamic = "force-dynamic";

export default async function OptOutsPage() {
  const t = await getDictionary();

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
              <IconDownload size={15} /> Export
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
        <CardHeader title={`${rows.length} opted out`} />
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
                  <td>{row.reason}</td>
                  <td className="text-muted">{sourceLabel(t, row.source)}</td>
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

/**
 * Suppression sources are free text in the schema rather than an enum, so an
 * unrecognised value falls back to the raw word instead of rendering nothing.
 */
function sourceLabel(t: Dictionary, source: string): string {
  const known = t.status.suppressionSource as Record<string, string | undefined>;
  return known[source] ?? t.status.unknown(source);
}
