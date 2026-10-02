import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/server/auth/context";
import { listGroups } from "@/server/domain/groups";
import { formatManila } from "@/server/config";
import {
  ButtonLink,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { IconUsers } from "@/components/icons";
import { CreateGroupForm } from "./create-group-form";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.groups.title };
}
export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const t = await getDictionary();

  const ctx = await requireOrgContext();
  const groups = await listGroups(ctx.org.organizationId);

  return (
    <>
      <PageHeader
        title={t.groups.title}
        description={t.groups.subheading}
        action={
          <ButtonLink href="/app/contacts" variant="ghost">
            {t.contacts.detail.allContacts}
          </ButtonLink>
        }
      />

      {ctx.can("contacts.manage") ? (
        <div className="mb-5">
          <CreateGroupForm />
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={t.groups.yoursTitle}
          description={t.groups.yoursDescription}
        />
        {groups.length === 0 ? (
          <EmptyState
            title={t.groups.emptyTitle}
            description={t.groups.emptyBody}
            icon={<IconUsers size={20} />}
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>{t.groups.colGroup}</th>
                <th>{t.groups.colContacts}</th>
                <th>{t.common.description}</th>
                <th>{t.common.updated}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id}>
                  <td>
                    <Link
                      href={`/app/contacts/groups/${group.id}`}
                      className="font-semibold text-ink hover:text-brand-700"
                    >
                      {group.name}
                    </Link>
                  </td>
                  <td>{group.memberCount}</td>
                  <td className="text-muted">{group.description ?? "—"}</td>
                  <td className="whitespace-nowrap text-muted">
                    {formatManila(group.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
