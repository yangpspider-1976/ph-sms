import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { requireOrgContext } from "@/server/auth/context";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { formatManila } from "@/server/config";
import { Card, DetailRow, PageHeader, Pill } from "@/components/ui";
import { MobileVerification } from "./mobile-verification";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.settings.profile.title };
}
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const t = await getDictionary();

  const ctx = await requireOrgContext({ allowInactive: true });

  const [row] = await db
    .select({
      mask: users.mobileMask,
      verifiedAt: users.mobileVerifiedAt,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, ctx.user.id))
    .limit(1);

  return (
    <>
      <PageHeader
        title={t.settings.profile.title}
        description={t.settings.profile.subheading}
      />

      <div className="grid max-w-3xl gap-5">
        <Card className="p-5">
          <h2 className="card-title">{t.settings.profile.account}</h2>
          <dl className="mt-3 divide-y divide-line">
            <DetailRow label={t.common.name} value={ctx.user.fullName} />
            <DetailRow
              label={t.settings.profile.email}
              value={
                <span className="flex flex-wrap items-center gap-2">
                  {ctx.user.email}
                  {row?.emailVerifiedAt ? (
                    <Pill tone="success" dot={false}>
                      {t.common.verified}
                    </Pill>
                  ) : (
                    <Pill tone="warning">{t.common.notVerified}</Pill>
                  )}
                </span>
              }
            />
            <DetailRow label={t.settings.organization} value={ctx.org.organizationName} />
            <DetailRow
              label={t.settings.profile.yourRole}
              value={
                <span>
                  {t.roles.labels[ctx.org.role]}
                  <span className="mt-0.5 block text-[12.5px] text-muted">
                    {t.roles.descriptions[ctx.org.role]}
                  </span>
                </span>
              }
            />
            {row?.createdAt ? (
              <DetailRow label={t.settings.profile.memberSince} value={formatManila(row.createdAt)} />
            ) : null}
          </dl>
        </Card>

        <MobileVerification
          mask={row?.mask ?? null}
          verifiedAt={row?.verifiedAt ? formatManila(row.verifiedAt) : null}
        />
      </div>
    </>
  );
}
