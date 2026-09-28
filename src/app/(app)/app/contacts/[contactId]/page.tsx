import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireOrgContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { contactGroupMembers, contactGroups } from "@/server/db/schema";
import { getContact } from "@/server/domain/contacts";
import { formatManila } from "@/server/config";
import { ButtonLink, Card, DetailRow, PageHeader, Pill } from "@/components/ui";
import Link from "next/link";
import { ContactForm } from "./contact-form";
import { getDictionary } from "@/i18n/server";

export const metadata = { title: "Contact" };
export const dynamic = "force-dynamic";

export default async function ContactPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const t = await getDictionary();

  const { contactId } = await params;
  const ctx = await requireOrgContext();
  const orgId = ctx.org.organizationId;

  const contact = await getContact({ organizationId: orgId, contactId });
  if (!contact) notFound();

  const groups = await db
    .select({ id: contactGroups.id, name: contactGroups.name })
    .from(contactGroupMembers)
    .innerJoin(contactGroups, eq(contactGroups.id, contactGroupMembers.groupId))
    .where(
      and(
        eq(contactGroupMembers.contactId, contactId),
        eq(contactGroupMembers.organizationId, orgId),
      ),
    );

  return (
    <>
      <PageHeader
        title={[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.masked}
        description={t.contacts.detail.subheading}
        action={
          <ButtonLink href="/app/contacts" variant="ghost">
            {t.contacts.detail.allContacts}
          </ButtonLink>
        }
      />

      <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="card-title">{t.contacts.detail.record}</h2>
          <dl className="mt-3 divide-y divide-line">
            <DetailRow label={t.contacts.detail.mobileNumber} value={contact.masked} />
            <DetailRow
              label={t.contacts.detail.consentRecorded}
              value={contact.consentDate ? formatManila(contact.consentDate) : t.common.notRecorded}
            />
            <DetailRow label={t.contacts.detail.added} value={formatManila(contact.createdAt)} />
            <DetailRow label={t.contacts.detail.lastUpdated} value={formatManila(contact.updatedAt)} />
            <DetailRow
              label={t.contacts.detail.groups}
              value={
                groups.length === 0 ? (
                  t.common.none
                ) : (
                  <span className="flex flex-wrap gap-1.5">
                    {groups.map((group) => (
                      <Link key={group.id} href={`/app/contacts/groups/${group.id}`}>
                        <Pill tone="neutral" dot={false}>
                          {group.name}
                        </Pill>
                      </Link>
                    ))}
                  </span>
                )
              }
            />
          </dl>

          <p className="mt-4 text-[12.5px] leading-snug text-muted">
            {t.contacts.detail.numberNotEditable}
          </p>
        </Card>

        {ctx.can("contacts.manage") ? (
          <ContactForm
            contactId={contact.id}
            firstName={contact.firstName}
            lastName={contact.lastName}
            consentSource={contact.consentSource}
            tags={contact.tags ?? []}
          />
        ) : null}
      </div>
    </>
  );
}
