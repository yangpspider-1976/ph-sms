import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/context";
import { env } from "@/server/env";
import { Wordmark } from "@/components/brand";
import { DemoFooterMark } from "@/components/demo-mark";
import { Card, Notice } from "@/components/ui";
import { MfaPanel } from "./mfa-panel";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminExtra.mfaTitle };
}
export const dynamic = "force-dynamic";

/**
 * MFA enrolment and verification for platform admins.
 *
 * Deliberately OUTSIDE the admin layout. That layout calls
 * `requirePlatformAdmin()`, which redirects here when MFA is missing — rendering
 * this page inside it would loop, and the first admin on a live deployment could
 * never enrol.
 */
export default async function AdminMfaPage() {
  const t = await getDictionary();

  const user = await requireUser();
  if (!user.isPlatformAdmin) redirect("/app/dashboard");

  const row = (
    await db
      .select({
        mfaEnrolledAt: users.mfaEnrolledAt,
        hasSecret: users.totpSecretEncrypted,
        recovery: users.totpRecoveryHashes,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)
  )[0];

  const enrolled = Boolean(row?.hasSecret);
  const satisfied = Boolean(user.adminMfaAt);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center px-5">
          <Wordmark href="/admin" subtitle={t.adminExtra.adminSubtitle} />
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 py-12">
        <div className="w-full max-w-[460px]">
          <h1 className="text-[26px] font-extrabold tracking-tight text-ink">
            {t.adminExtra.mfaTitle}
          </h1>
          <p className="mt-1.5 text-[14px] text-body">
            {enrolled ? t.adminExtra.mfaEnterCode : t.adminExtra.mfaRequired}
          </p>

          {env.APP_MODE !== "LIVE" ? (
            <div className="mt-5">
              <Notice tone="info" title={t.adminExtra.mfaNotRequired}>
                {t.adminExtra.mfaNotRequiredBody}
              </Notice>
            </div>
          ) : null}

          {satisfied ? (
            <div className="mt-5">
              <Notice tone="success" title={t.adminExtra.mfaSessionVerified}>
                {t.adminExtra.mfaReturn}
              </Notice>
            </div>
          ) : null}

          <Card className="mt-5 p-6">
            <MfaPanel
              enrolled={enrolled}
              remainingRecoveryCodes={(row?.recovery ?? []).length}
            />
          </Card>

          <p className="mt-4 text-center text-[12.5px] text-muted">
            {t.adminExtra.mfaLostDevice}
          </p>
        </div>
      </main>

      <footer className="px-5 py-5 text-center">
        <DemoFooterMark />
      </footer>
    </div>
  );
}
