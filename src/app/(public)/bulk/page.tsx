import { Card, Notice, PageHeader } from "@/components/ui";
import { InquiryForm } from "./inquiry-form";
import { getDictionary } from "@/i18n/server";

export const metadata = { title: "Bulk SMS inquiry" };

export default async function BulkPage() {
  const t = await getDictionary();
  return (
    <div className="mx-auto max-w-[1240px] px-5 py-14">
      <PageHeader
        title={t.bulk.title}
        description={t.bulk.subheading}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card className="p-6">
          <InquiryForm />
        </Card>

        <div className="min-w-0 space-y-5">
          <Card className="p-6">
            <h2 className="card-title">{t.bulk.whyTitle}</h2>
            <ul className="mt-3 space-y-2.5 text-[13.5px] text-body">
              {[
                t.publicExtra.bulkReason1,
                t.publicExtra.bulkReason2,
                t.publicExtra.bulkReason3,
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-6">
            <Notice tone="info" title={t.bulk.doNotSendTitle}>
              {t.publicExtra.doNotSendBody}
            </Notice>
          </Card>
        </div>
      </div>
    </div>
  );
}
