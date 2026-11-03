import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { DemoLogins } from "./demo-logins";
import { demoFeaturesEnabled } from "@/server/env";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.auth.login.metaTitle };
}

export default async function LoginPage() {
  const t = await getDictionary();

  return (
    <div className="w-full max-w-[480px]">
      {/* The ink bar marks the title, as on the reference's log-in. */}
      <h1 className="flex items-center gap-2.5 text-[24px] font-medium text-ink">
        <span aria-hidden="true" className="h-[22px] w-1 shrink-0 bg-ink" />
        {t.auth.login.heading}
      </h1>
      <p className="mt-2 text-[14px] text-muted">{t.auth.login.subheading}</p>

      <div className="mt-8">
        <LoginForm />
      </div>

      <p className="mt-6 text-center text-[13px] text-muted">
        {t.auth.login.noAccount}{" "}
        <Link href="/signup" className="py-1 font-semibold text-brand-700 hover:underline">
          {t.auth.login.createOne}
        </Link>
      </p>

      {demoFeaturesEnabled() ? <DemoLogins /> : null}
    </div>
  );
}
