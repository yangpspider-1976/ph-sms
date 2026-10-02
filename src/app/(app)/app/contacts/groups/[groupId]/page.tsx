import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireOrgContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { contactGroups } from "@/server/db/schema";
import { listGroupMembers } from "@/server/domain/groups";
import { listContacts } from "@/server/domain/contacts";
import {
  ButtonLink,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { IconUsers } from "@/components/icons";
import { GroupMembers } from "./group-members";
import { GroupSettings } from "./group-settings";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.groups.colGroup };
}
export const dynamic = "force-dynamic";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const t = await getDictionary();

  const { groupId } = await params;
  const ctx = await requireOrgContext();
  const orgId = ctx.org.organizationId;

  const [group] = await db
    .select()
    .from(contactGroups)
    .where(and(eq(contactGroups.id, groupId), eq(contactGroups.organizationId, orgId)))
    .limit(1);

  // Scoped by organization, so another tenant's group is simply not found
  // rather than forbidden — which would confirm that it exists.
  if (!group) notFound();

  const [members, allContacts] = await Promise.all([
    listGroupMembers({ organizationId: orgId, groupId }),
    listContacts(orgId, 200),
  ]);

  const memberIds = new Set(members.map((m) => m.contactId));
  const candidates = allContacts
    .filter((c) => !memberIds.has(c.id))
    .map((c) => ({
      id: c.id,
      masked: c.numberMasked,
      name: [c.firstName, c.lastName].filter(Boolean).join(" "),
    }));

  const canManage = ctx.can("contacts.manage");

  return (
    <>
      <PageHeader
        title={group.name}
        description={group.description ?? t.groups.subheading}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/app/contacts/groups" variant="ghost">
              {t.groups.allGroups}
            </ButtonLink>
            {members.length > 0 ? (
              <ButtonLink href={`/app/send?groupId=${group.id}`}>{t.groups.sendToGroup}</ButtonLink>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title={t.groups.memberCount(members.length)}
            description={t.groups.membersDescription}
          />
          {members.length === 0 ? (
            <EmptyState
              title={t.groups.emptyMembersTitle}
              description={t.groups.emptyMembersBody}
              icon={<IconUsers size={20} />}
            />
          ) : canManage ? (
            <GroupMembers groupId={group.id} members={members} />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th>{t.contacts.colRecipient}</th>
                  <th>{t.contacts.colName}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.contactId}>
                    <td className="font-mono text-[12.5px]">{member.masked}</td>
                    <td>
                      {[member.firstName, member.lastName].filter(Boolean).join(" ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>

        {canManage ? (
          <div className="grid content-start gap-5">
            <GroupSettings
              groupId={group.id}
              name={group.name}
              description={group.description}
            />
            <GroupMembers.AddPanel groupId={group.id} candidates={candidates} />
          </div>
        ) : null}
      </div>
    </>
  );
}
