import type { Metadata } from "next";
import Link from "next/link";
import { peekInvite, TeamError } from "@/server/domain/team";
import { getSessionUser } from "@/server/auth/session";
import { Card, Notice } from "@/components/ui";
import { AcceptInviteForm } from "./accept-form";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.invite.metaTitle };
}
export const dynamic = "force-dynamic";

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getDictionary();

  const { token } = await searchParams;

  if (!token) {
    return (
      <Shell>
        <Notice tone="danger" title={t.invite.noTokenTitle}>
          {t.invite.noTokenBody}
        </Notice>
      </Shell>
    );
  }

  let invite;
  try {
    invite = await peekInvite(token);
  } catch (err) {
    return (
      <Shell>
        <Notice tone="danger" title={t.invite.cannotUseTitle}>
          {err instanceof TeamError ? err.message : "That link is not valid."}
        </Notice>
        <p className="mt-4 text-center text-[13px] text-muted">
          <Link href="/login" className="font-semibold text-brand-700 hover:underline">
            {t.invite.backToLogin}
          </Link>
        </p>
      </Shell>
    );
  }

  const signedIn = await getSessionUser();
  // The invitation binds an address; signing in as someone else must not consume it.
  const wrongAccount = signedIn && signedIn.email.toLowerCase() !== invite.email;

  return (
    <Shell>
      <h1 className="text-[24px] font-extrabold tracking-tight text-ink">
        {t.invite.joinTitle(invite.organizationName)}
      </h1>
      <p className="mt-1.5 text-[14px] text-body">
        {t.invite.invitedAs(t.roles.labels[invite.role])}
      </p>

      <Card className="mt-6 p-6">
        <p className="text-[13px] text-body">{t.roles.descriptions[invite.role]}</p>

        {wrongAccount ? (
          <div className="mt-5">
            <Notice tone="warning" title={t.invite.signedInAsOtherTitle}>
              {t.invite.wrongAccountBody(invite.email, signedIn!.email)}
            </Notice>
          </div>
        ) : (
          <div className="mt-5">
            <AcceptInviteForm
              token={token}
              email={invite.email}
              needsAccount={!invite.userExists}
            />
          </div>
        )}
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="w-full max-w-[460px]">{children}</div>;
}
