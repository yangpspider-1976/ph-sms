import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { DemoLogins } from "./demo-logins";
import { demoFeaturesEnabled } from "@/server/env";
import { Card } from "@/components/ui";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.auth.login.metaTitle };
}

export default async function LoginPage() {
  const t = await getDictionary();

  return (
    <div className="w-full max-w-[400px]">
      <h1 className="text-[26px] font-extrabold tracking-tight text-ink">{t.auth.login.heading}</h1>
      <p className="mt-1.5 text-[14px] text-body">{t.auth.login.subheading}</p>

      <Card className="mt-6 p-6">
        <LoginForm />
      </Card>

      <p className="mt-4 text-center text-[13px] text-muted">
        {t.auth.login.noAccount}{" "}
        <Link href="/signup" className="py-1 font-semibold text-brand-700 hover:underline">
          {t.auth.login.createOne}
        </Link>
      </p>

      {demoFeaturesEnabled() ? <DemoLogins /> : null}
    </div>
  );
}
