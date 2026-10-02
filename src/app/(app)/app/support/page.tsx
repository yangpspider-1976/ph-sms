import type { Metadata } from "next";
import { requireOrgContext } from "@/server/auth/context";
import { getDictionary } from "@/i18n/server";
import { Card, PageHeader } from "@/components/ui";
import { SupportForm } from "./support-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.support.title };
}
export const dynamic = "force-dynamic";

export default async function SupportPage() {
  await requireOrgContext({ allowInactive: true });
  const t = await getDictionary();

  const faqs = [
    { q: t.supportPage.q1, a: t.supportPage.a1 },
    { q: t.supportPage.q2, a: t.supportPage.a2 },
    { q: t.supportPage.q3, a: t.supportPage.a3 },
    { q: t.supportPage.q4, a: t.supportPage.a4 },
    { q: t.supportPage.q5, a: t.supportPage.a5 },
  ];

  return (
    <>
      <PageHeader title={t.support.title} description={t.support.subheading} />

      <div className="grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <h2 className="card-title">{t.supportPage.helpTitle}</h2>
          <dl className="mt-3 divide-y divide-line">
            {faqs.map((faq) => (
              <div key={faq.q} className="py-3.5 first:pt-0 last:pb-0">
                <dt className="text-[13.5px] font-bold text-ink">{faq.q}</dt>
                <dd className="mt-1 text-[13px] leading-relaxed text-body">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <SupportForm />
      </div>
    </>
  );
}
