import type { Metadata } from "next";
import { requireOrgContext } from "@/server/auth/context";
import { listMembers, listPendingInvites } from "@/server/domain/team";
import { ROLE_ORDER, ROLE_TONES } from "@/server/auth/rbac";
import { demoFeaturesEnabled } from "@/server/env";
import { Card, CardHeader, Notice, PageHeader, Pill } from "@/components/ui";
import { InviteForm } from "./invite-form";
import { MemberRow } from "./member-row";
import { InviteRow } from "./invite-row";
import { getDictionary, getI18n } from "@/i18n/server";
import { formatDateTime } from "@/i18n/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.settings.team.title };
}
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const { t, locale } = await getI18n();

  const ctx = await requireOrgContext();
  const orgId = ctx.org.organizationId;

  const [members, invites] = await Promise.all([
    listMembers(orgId),
    ctx.can("team.manage") ? listPendingInvites(orgId) : Promise.resolve([]),
  ]);

  const owners = members.filter((m) => m.role === "OWNER").length;

  return (
    <>
      <PageHeader
        title={t.settings.team.title}
        description={t.settings.team.subheading}
      />

      {!ctx.can("team.view") ? (
        <Card className="max-w-2xl p-6">
          <Notice tone="warning" title={t.settings.team.deniedTitle}>
            {t.settings.team.deniedBody}
          </Notice>
        </Card>
      ) : (
        <>
          <Card className="mb-5 p-5">
            <h2 className="card-title">{t.settings.team.rolesTitle}</h2>
            <dl className="mt-3 space-y-2.5">
              {ROLE_ORDER.map((role) => (
                <div key={role} className="flex flex-wrap items-baseline gap-2">
                  <dt className="w-[150px] shrink-0">
                    <Pill tone={ROLE_TONES[role]} dot={false}>
                      {t.roles.labels[role]}
                    </Pill>
                  </dt>
                  {/* The basis sends the description under its pill on a phone,
                      where beside it there is room for three words a line. */}
                  <dd className="flex-1 basis-56 text-[13px] text-body">
                    {t.roles.descriptions[role]}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          {ctx.can("team.manage") ? (
            <div className="mb-5">
              <InviteForm />
            </div>
          ) : null}

          <Card>
            <CardHeader
              title={t.settings.team.memberCount(members.length)}
              description={
                owners === 1 ? t.settings.team.oneOwner : t.settings.team.ownerCount(owners)
              }
            />
            <div className="divide-y divide-line">
              {members.map((member) => (
                <MemberRow
                  key={member.membershipId}
                  membershipId={member.membershipId}
                  email={member.email}
                  fullName={member.fullName}
                  role={member.role}
                  verified={Boolean(member.emailVerifiedAt)}
                  joinedAt={formatDateTime(member.joinedAt, locale)}
                  isSelf={member.userId === ctx.user.id}
                  isLastOwner={member.role === "OWNER" && owners === 1}
                  canManage={ctx.can("team.manage")}
                />
              ))}
            </div>
          </Card>

          {ctx.can("team.manage") && invites.length > 0 ? (
            <Card className="mt-5">
              <CardHeader
                title={t.settings.team.pendingInvites(invites.length)}
                description={t.settings.team.invitesNote}
              />
              <div className="divide-y divide-line">
                {invites.map((invite) => (
                  <InviteRow
                    key={invite.id}
                    inviteId={invite.id}
                    email={invite.email}
                    role={invite.role ?? "VIEWER"}
                    expiresAt={formatDateTime(invite.expiresAt, locale)}
                    expired={invite.expiresAt.getTime() <= Date.now()}
                  />
                ))}
              </div>
              {demoFeaturesEnabled() ? (
                <p className="px-5 pb-4 text-[12px] text-muted">
                  {t.settings.team.demoMailNote("/verify-email")}
                </p>
              ) : null}
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}
