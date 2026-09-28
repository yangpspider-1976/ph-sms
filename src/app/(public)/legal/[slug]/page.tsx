import { notFound } from "next/navigation";
import { PageHeader, Card, Notice } from "@/components/ui";
import { getDictionary } from "@/i18n/server";

const DOCUMENTS: Record<string, { title: string; intent: string }> = {
  privacy: {
    title: "Privacy notice",
    intent:
      "How personal data is collected, used, retained and deleted, and how a data subject exercises their rights.",
  },
  terms: {
    title: "Terms of service",
    intent: "The agreement between the platform and the business using it.",
  },
  "acceptable-use": {
    title: "Acceptable use policy",
    intent: "What may and may not be sent, and how abuse is handled.",
  },
};

export function generateStaticParams() {
  return Object.keys(DOCUMENTS).map((slug) => ({ slug }));
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getDictionary();

  const { slug } = await params;
  const doc = DOCUMENTS[slug];
  if (!doc) notFound();

  return (
    <div className="mx-auto max-w-[820px] px-5 py-14">
      <PageHeader title={doc.title} description={doc.intent} />
      <Card className="p-7">
        {/* Legal text must be supplied and approved by the DPO/legal adviser.
            Nothing here is drafted by the implementation. */}
        <Notice tone="warning" title={t.publicSite.legalDraft}>
          This document has not been written. Approved wording must be supplied by the
          Philippine DPO or legal adviser before this account goes live, and must line up with
          the SMS partner&apos;s carrier requirements. Nothing on this page is legal advice.
        </Notice>
        <p className="mt-5 text-[13.5px] text-body">
          Required before live activation: the processing basis relied on, the notice given at
          collection, retention periods, how opt-out is handled and how a data subject makes a
          request.
        </p>
      </Card>
    </div>
  );
}
