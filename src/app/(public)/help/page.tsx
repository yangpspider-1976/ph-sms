import type { Metadata } from "next";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.helpCentre.title, description: t.helpCentre.subheading };
}

export default async function HelpPage() {
  const t = await getDictionary();
  const help = t.helpCentre;

  // The reference's FAQ, by category, keeping only what PH SMS does (DESIGN.md, "Screen Patterns").
  const groups = [
    {
      title: help.groupSending,
      items: [
        { question: help.bulkTitle, answer: help.bulkBody },
        { question: help.statesTitle, answer: help.statesBody },
        { question: help.heldTitle, answer: help.heldBody },
        { question: help.failedTitle, answer: help.failedBody },
        { question: help.stopTitle, answer: help.stopBody },
      ],
    },
    {
      title: help.groupContacts,
      items: [
        { question: help.numbersTitle, answer: help.numbersBody },
        { question: help.csvTitle, answer: help.csvBody },
        { question: help.exportTitle, answer: help.exportBody },
        { question: help.optOutTitle, answer: help.optOutBody },
      ],
    },
    {
      title: help.groupCredit,
      items: [
        { question: help.chargedTitle, answer: help.chargedBody },
        { question: help.historyTitle, answer: help.historyBody },
        { question: help.costTitle, answer: help.costBody },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-14">
      <PageHeader title={help.title} description={help.subheading} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-5">
        <div className="grid gap-12">
          {groups.map((group, index) => (
            <section key={group.title} aria-labelledby={`faq-group-${index}`}>
              <h2 id={`faq-group-${index}`} className="text-[17px] font-bold text-ink">
                {group.title}
              </h2>
              {/* FAQ lists open on a darker rule than tables (DESIGN.md, "Tables"). */}
              <dl className="mt-3 border-t border-body">
                {group.items.map((item) => (
                  <div key={item.question} className="border-b border-line py-5">
                    <dt className="flex gap-3 text-[15px] font-bold text-ink">
                      <span aria-hidden="true" className="w-4 shrink-0 text-brand-700">
                        Q
                      </span>
                      {item.question}
                    </dt>
                    <dd className="mt-2 pl-7 text-[13.5px] leading-relaxed text-body">{item.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        {/* The anchor the footer links to, so "Contact us" lands here. */}
        <Card id="contact" className="h-fit p-6">
          <h2 className="text-[15px] font-bold text-ink">{help.contactTitle}</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-body">{help.contactBody}</p>
          <div className="mt-5 flex flex-col gap-2.5">
            <ButtonLink href="/bulk">{help.contactCta}</ButtonLink>
            <ButtonLink href="/login" variant="ghost">
              {help.signInCta}
            </ButtonLink>
          </div>
        </Card>
      </div>
    </div>
  );
}
