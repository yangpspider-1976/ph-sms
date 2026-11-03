import Link from "next/link";
import { SignupForm } from "./signup-form";
import { Notice } from "@/components/ui";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getDictionary();
  return { title: t.auth.signup.metaTitle };
}

export default async function SignupPage() {
  const t = await getDictionary();

  return (
    <div className="w-full max-w-[560px]">
      <h1 className="border-b-[7px] border-subtle pb-6 text-center text-[24px] font-medium text-ink">
        {t.auth.signup.heading}
      </h1>
      <p className="mt-6 text-center text-[14px] text-muted">{t.auth.signup.subheading}</p>

      <div className="mt-6">
        <Notice tone="info" title={t.auth.signup.reviewTitle}>
          {t.auth.signup.reviewBody}
        </Notice>
      </div>
      <div className="mt-6">
        <SignupForm />
      </div>

      <p className="mt-6 text-center text-[13px] text-muted">
        {t.auth.signup.alreadyRegistered}{" "}
        <Link href="/login" className="py-1 font-semibold text-brand-700 hover:underline">
          {t.auth.signup.logIn}
        </Link>
      </p>
    </div>
  );
}
