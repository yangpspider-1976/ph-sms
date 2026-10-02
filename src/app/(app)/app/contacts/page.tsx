import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/server/auth/context";
import { countContacts, listContacts, listImports } from "@/server/domain/contacts";
import { listGroups } from "@/server/domain/groups";
import { listOrganizationSuppressions } from "@/server/domain/suppression";
import { getEffectiveConfig } from "@/server/domain/app-config";
import { formatManila } from "@/server/config";
import {
  ButtonLink,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
  Pill,
  Stat,
} from "@/components/ui";
import { IconDownload, IconUsers } from "@/components/icons";
import { ImportPanel } from "./import-panel";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.contacts.metaTitle };
}
export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const t = await getDictionary();

  const ctx = await requireOrgContext();
  const orgId = ctx.org.organizationId;

  const [rows, total, recentImports, optOuts, groups, config] = await Promise.all([
    listContacts(orgId, 50),
    countContacts(orgId),
    listImports(orgId, 5),
    listOrganizationSuppressions(orgId, 5),
    listGroups(orgId),
    getEffectiveConfig(),
  ]);

  return (
    <>
      <PageHeader
        title={t.contacts.title}
        description={t.contacts.subheading}
        action={
          <div className="flex gap-2">
            <ButtonLink href="/app/contacts/groups" variant="ghost">
              {t.groups.title}
            </ButtonLink>
            <ButtonLink href="/app/contacts/opt-outs" variant="ghost">
              {t.contacts.optOuts.title}
            </ButtonLink>
            {ctx.can("reports.export.masked") ? (
              <ButtonLink href="/app/exports?kind=contacts" variant="ghost" prefetch={false}>
                <IconDownload size={15} /> {t.common.export}
              </ButtonLink>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t.contacts.statContacts} value={total} />
        <Stat label={t.contacts.statOptOuts} value={optOuts.length} hint={t.contacts.statOptOutsHint} />
        <Stat label={t.contacts.statGroups} value={groups.length} hint={t.contacts.statGroupsHint} />
      </div>

      {ctx.can("contacts.manage") ? (
        <div className="mt-5">
          <ImportPanel maxUploadBytes={config.maxUploadBytes} maxDataRows={config.maxDataRows} />
        </div>
      ) : null}

      <Card className="mt-5">
        <CardHeader
          title={t.contacts.listTitle}
          description={t.contacts.listDescription}
        />
        {rows.length === 0 ? (
          <EmptyState
            title={t.contacts.emptyTitle}
            description={t.contacts.emptyBody}
            icon={<IconUsers size={20} />}
          />
        ) : (
                      <DataTable>
              <thead>
                <tr>
                  <th>{t.contacts.colRecipient}</th>
                  <th>{t.contacts.colName}</th>
                  <th>{t.contacts.colConsentSource}</th>
                  <th>{t.contacts.colAdded}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[12.5px]">
                      <Link href={`/app/contacts/${row.id}`} className="hover:text-brand-700">
                        {row.numberMasked}
                      </Link>
                    </td>
                    <td>{[row.firstName, row.lastName].filter(Boolean).join(" ") || "—"}</td>
                    <td className="text-muted">{row.consentSource ?? "—"}</td>
                    <td className="whitespace-nowrap text-muted">{formatManila(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
        )}
        {total > rows.length ? (
          <p className="px-5 pb-4 text-[12.5px] text-muted">
            Showing {rows.length} of {total}.
          </p>
        ) : null}
      </Card>

      {recentImports.length > 0 ? (
        <Card className="mt-5">
          <CardHeader
            title={t.contacts.recentImports}
            description={`Uploaded files and rejected rows are deleted automatically after the retention window.`}
          />
          <DataTable>
            <thead>
              <tr>
                <th>{t.contacts.colFile}</th>
                <th>{t.contacts.colRows}</th>
                <th>{t.contacts.colEligible}</th>
                <th>{t.contacts.colExcluded}</th>
                <th>{t.common.status}</th>
                <th>{t.contacts.colUploaded}</th>
              </tr>
            </thead>
            <tbody>
              {recentImports.map((record) => (
                <tr key={record.id}>
                  <td>
                    <Link href={`/app/contacts/imports/${record.id}`} className="hover:text-brand-700">
                      {record.filename}
                    </Link>
                  </td>
                  <td>{record.rawRowCount}</td>
                  <td>{record.eligibleCount}</td>
                  <td className="text-muted">
                    {record.blankCount + record.invalidCount + record.duplicateCount + record.suppressedCount}
                  </td>
                  <td>
                    <Pill tone={record.status === "EXPIRED" ? "neutral" : "success"}>
                      {record.status === "EXPIRED" ? t.status.importFile.EXPIRED : t.status.importFile.READY}
                    </Pill>
                  </td>
                  <td className="whitespace-nowrap text-muted">{formatManila(record.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      ) : null}
    </>
  );
}
