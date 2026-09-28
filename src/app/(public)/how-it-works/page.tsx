import type { Metadata } from "next";
import { Card, Notice, PageHeader } from "@/components/ui";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.howItWorks.title, description: t.howItWorks.subheading };
}

export default async function HowItWorksPage() {
  const t = await getDictionary();

  const steps = [
    { title: t.howItWorks.step1Title, body: t.howItWorks.step1Body },
    { title: t.howItWorks.step2Title, body: t.howItWorks.step2Body },
    { title: t.howItWorks.step3Title, body: t.howItWorks.step3Body },
    { title: t.howItWorks.step4Title, body: t.howItWorks.step4Body },
    { title: t.howItWorks.step5Title, body: t.howItWorks.step5Body },
    { title: t.howItWorks.step6Title, body: t.howItWorks.step6Body },
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-14">
      <PageHeader title={t.howItWorks.title} description={t.howItWorks.subheading} />

      <Card className="max-w-3xl p-7">
        <ol className="space-y-6">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[13px] font-bold text-white"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <h2 className="text-[15px] font-bold text-ink">{step.title}</h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-body">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-5 max-w-3xl">
        <Notice tone="info" title={t.howItWorks.timingTitle}>
          {t.howItWorks.timingBody}
        </Notice>
      </div>
    </div>
  );
}
