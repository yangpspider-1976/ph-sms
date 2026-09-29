import Link from "next/link";
import { verifyEmailAction } from "@/server/actions/auth";
import { Card, Notice, ButtonLink } from "@/components/ui";
import { db } from "@/server/db";
import { mailSink } from "@/server/db/schema";
import { desc } from "drizzle-orm";
import { demoFeaturesEnabled } from "@/server/env";
import { getDictionary } from "@/i18n/server";
import type { Dictionary } from "@/i18n/dictionaries";

export const metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; sent?: string }>;
}) {
  const t = await getDictionary();

  const params = await searchParams;
  const result = params.token ? await verifyEmailAction(params.token) : null;

  return (
    <div className="w-full max-w-[460px]">
      <h1 className="text-[26px] font-extrabold tracking-tight text-ink">{t.verifyEmail.heading}</h1>

      <Card className="mt-6 p-6">
        {result ? (
          <Notice tone={result.ok ? "success" : "danger"} title={result.ok ? t.publicExtra.verified : t.publicExtra.linkNotValid}>
            {result.message}
          </Notice>
        ) : (
          <Notice tone="info" title={t.verifyEmail.checkInbox}>
            {t.publicExtra.checkInboxBody}
          </Notice>
        )}

        {result?.ok ? (
          <ButtonLink href="/login" className="mt-5 w-full">
            Continue to log in
          </ButtonLink>
        ) : null}

        {demoFeaturesEnabled() ? <MailSinkPanel /> : null}
      </Card>

      <p className="mt-4 text-center text-[13px] text-muted">
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}

/** Names a sink link by where it leads, so an invitation is not called a verification. */
function linkLabel(link: string, t: Dictionary): string {
  const path = new URL(link, "http://sink.invalid").pathname;
  if (path === "/verify-email") return t.verifyEmail.openVerificationLink;
  if (path === "/invite") return t.verifyEmail.openInvitationLink;
  return t.verifyEmail.openLink;
}

/** Local mail sink: in mock mode no email is actually delivered anywhere. */
async function MailSinkPanel() {
  const t = await getDictionary();
  const recent = await db.select().from(mailSink).orderBy(desc(mailSink.createdAt)).limit(3);
  if (recent.length === 0) return null;

  return (
    <div className="mt-5 rounded-[10px] border border-dashed border-brand-200 bg-brand-50/50 p-4">
      <p className="text-[13px] font-bold text-ink">{t.verifyEmail.mailSink}</p>
      <p className="mt-0.5 text-[12.5px] text-muted">
        {t.publicExtra.mailSinkBody}
      </p>
      <ul className="mt-3 space-y-2">
        {recent.map((mail) => (
          <li key={mail.id} className="text-[12.5px]">
            <span className="block font-semibold text-ink">{mail.subject}</span>
            <span className="block text-muted">to {mail.toEmail}</span>
            {mail.link ? (
              <Link href={mail.link} className="font-semibold text-brand-700 hover:underline">
                {linkLabel(mail.link, t)}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
