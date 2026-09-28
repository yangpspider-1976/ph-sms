import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.features.title, description: t.features.subheading };
}

export default async function FeaturesPage() {
  const t = await getDictionary();

  const features = [
    { title: t.features.sendTitle, body: t.features.sendBody },
    { title: t.features.moneyTitle, body: t.features.moneyBody },
    { title: t.features.consentTitle, body: t.features.consentBody },
    { title: t.features.privacyTitle, body: t.features.privacyBody },
    { title: t.features.reviewTitle, body: t.features.reviewBody },
    { title: t.features.controlTitle, body: t.features.controlBody },
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-14">
      <PageHeader title={t.features.title} description={t.features.subheading} />

      <div className="grid gap-5 md:grid-cols-2">
        {features.map((feature) => (
          <Card key={feature.title} className="p-6">
            <h2 className="text-[16px] font-bold text-ink">{feature.title}</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-body">{feature.body}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-5 max-w-3xl border-dashed p-6">
        <h2 className="text-[15px] font-bold text-ink">{t.features.notYetTitle}</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-body">{t.features.notYetBody}</p>
      </Card>
    </div>
  );
}
