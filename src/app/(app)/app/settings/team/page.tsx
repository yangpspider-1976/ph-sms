import { requireOrgContext } from "@/server/auth/context";
import { listMembers, listPendingInvites } from "@/server/domain/team";
import { ROLE_ORDER, ROLE_TONES } from "@/server/auth/rbac";
import { formatManila } from "@/server/config";
import { demoFeaturesEnabled } from "@/server/env";
import { Card, CardHeader, Notice, PageHeader, Pill } from "@/components/ui";
import { InviteForm } from "./invite-form";
import { MemberRow } from "./member-row";
import { InviteRow } from "./invite-row";
import { getDictionary } from "@/i18n/server";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const t = await getDictionary();

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
                  <dd className="flex-1 text-[13px] text-body">{t.roles.descriptions[role]}</dd>
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
              title={`${members.length} member${members.length === 1 ? "" : "s"}`}
              description={
                owners === 1
                  ? "There is one owner. The last owner cannot be removed or demoted."
                  : `${owners} owners.`
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
                  joinedAt={formatManila(member.joinedAt)}
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
                title={`${invites.length} pending invitation${invites.length === 1 ? "" : "s"}`}
                description={t.settings.team.invitesNote}
              />
              <div className="divide-y divide-line">
                {invites.map((invite) => (
                  <InviteRow
                    key={invite.id}
                    inviteId={invite.id}
                    email={invite.email}
                    role={invite.role ?? "VIEWER"}
                    expiresAt={formatManila(invite.expiresAt)}
                    expired={invite.expiresAt.getTime() <= Date.now()}
                  />
                ))}
              </div>
              {demoFeaturesEnabled() ? (
                <p className="px-5 pb-4 text-[12px] text-muted">
                  Demo mode: invitation emails are written to the local mail sink rather than
                  sent. Open <span className="font-mono">/verify-email</span> to find the link.
                </p>
              ) : null}
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}
