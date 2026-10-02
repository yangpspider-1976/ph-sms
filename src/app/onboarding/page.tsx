import type { Metadata } from "next";
import { ButtonLink, Card, Notice } from "@/components/ui";
import { Wordmark } from "@/components/brand";
import { DemoFooterMark } from "@/components/demo-mark";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.onboarding.metaTitle };
}

export default async function OnboardingPage() {
  const t = await getDictionary();
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center px-5">
          <Wordmark />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 py-12">
        <Card className="w-full max-w-[460px] p-6">
          <Notice tone="info" title={t.onboarding.noOrgTitle}>
            {t.onboarding.noOrgBody}
          </Notice>
          <ButtonLink href="/signup" className="mt-5 w-full">
            {t.onboarding.registerBusiness}
          </ButtonLink>
        </Card>
      </main>
      <footer className="px-5 py-5 text-center">
        <DemoFooterMark />
      </footer>
    </div>
  );
}
