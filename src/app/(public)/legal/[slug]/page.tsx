import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, Card, Notice } from "@/components/ui";
import { getDictionary } from "@/i18n/server";
import type { Dictionary } from "@/i18n/dictionaries";

const SLUGS = ["privacy", "terms", "acceptable-use"] as const;
type Slug = (typeof SLUGS)[number];

function isSlug(value: string): value is Slug {
  return (SLUGS as readonly string[]).includes(value);
}

function documentFor(t: Dictionary, slug: Slug): { title: string; intent: string } {
  switch (slug) {
    case "privacy":
      return { title: t.legal.privacyTitle, intent: t.legal.privacyIntent };
    case "terms":
      return { title: t.legal.termsTitle, intent: t.legal.termsIntent };
    case "acceptable-use":
      return { title: t.legal.acceptableUseTitle, intent: t.legal.acceptableUseIntent };
  }
}

export function generateStaticParams() {
  return SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isSlug(slug)) return {};
  return { title: documentFor(await getDictionary(), slug).title };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getDictionary();

  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  const doc = documentFor(t, slug);

  return (
    <div className="mx-auto max-w-[820px] px-5 py-14">
      <PageHeader title={doc.title} description={doc.intent} />
      <Card className="p-7">
        {/* Legal text must be supplied and approved by the DPO/legal adviser.
            Nothing here is drafted by the implementation. */}
        <Notice tone="warning" title={t.publicSite.legalDraft}>
          {t.legal.notWritten}
        </Notice>
        <p className="mt-5 text-[13.5px] text-body">{t.legal.requiredBeforeLive}</p>
      </Card>
    </div>
  );
}
