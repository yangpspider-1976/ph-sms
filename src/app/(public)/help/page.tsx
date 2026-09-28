import type { Metadata } from "next";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.helpCentre.title, description: t.helpCentre.subheading };
}

export default async function HelpPage() {
  const t = await getDictionary();

  const topics = [
    { title: t.helpCentre.numbersTitle, body: t.helpCentre.numbersBody },
    { title: t.helpCentre.csvTitle, body: t.helpCentre.csvBody },
    { title: t.helpCentre.statesTitle, body: t.helpCentre.statesBody },
    { title: t.helpCentre.optOutTitle, body: t.helpCentre.optOutBody },
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-14">
      <PageHeader title={t.helpCentre.title} description={t.helpCentre.subheading} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="p-7">
          <dl className="divide-y divide-line">
            {topics.map((topic) => (
              <div key={topic.title} className="py-5 first:pt-0 last:pb-0">
                <dt className="text-[15px] font-bold text-ink">{topic.title}</dt>
                <dd className="mt-1.5 text-[13.5px] leading-relaxed text-body">{topic.body}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* The anchor the footer links to, so "Contact us" lands here. */}
        <Card id="contact" className="h-fit p-6">
          <h2 className="text-[15px] font-bold text-ink">{t.helpCentre.contactTitle}</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-body">
            {t.helpCentre.contactBody}
          </p>
          <div className="mt-5 flex flex-col gap-2.5">
            <ButtonLink href="/bulk">{t.helpCentre.contactCta}</ButtonLink>
            <ButtonLink href="/login" variant="ghost">
              {t.helpCentre.signInCta}
            </ButtonLink>
          </div>
        </Card>
      </div>
    </div>
  );
}
