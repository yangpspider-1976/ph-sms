import Link from "next/link";
import { SignupForm } from "./signup-form";
import { Card, Notice } from "@/components/ui";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getDictionary();
  return { title: t.auth.signup.metaTitle };
}

export default async function SignupPage() {
  const t = await getDictionary();

  return (
    <div className="w-full max-w-[560px]">
      <h1 className="text-[26px] font-extrabold tracking-tight text-ink">{t.auth.signup.heading}</h1>
      <p className="mt-1.5 text-[14px] text-body">{t.auth.signup.subheading}</p>

      <Card className="mt-6 p-6">
        <Notice tone="info" title={t.auth.signup.reviewTitle}>
          {t.auth.signup.reviewBody}
        </Notice>
        <div className="mt-5">
          <SignupForm />
        </div>
      </Card>

      <p className="mt-4 text-center text-[13px] text-muted">
        {t.auth.signup.alreadyRegistered}{" "}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          {t.auth.signup.logIn}
        </Link>
      </p>
    </div>
  );
}
