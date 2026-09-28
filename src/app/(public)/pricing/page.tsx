import { PageHeader, Card, Notice, ButtonLink } from "@/components/ui";
import { MOCK_DEFAULTS } from "@/server/config";
import { getDictionary } from "@/i18n/server";

export const metadata = { title: "Pricing" };

export default async function PricingPage() {
  const t = await getDictionary();
  // Public pricing stays "contact us" until approved live pricing exists.
  // The demo unit price is a test setting, not a commercial term, so it is not
  // published here.
  const approved = MOCK_DEFAULTS.pricingApproved;

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-14">
      <PageHeader
        title={t.pricing.title}
        description={t.pricing.subheading}
      />
      <Card className="max-w-2xl p-7">
        {approved ? null : (
          <Notice tone="info" title={t.pricing.contactTitle}>
            {t.pricing.contactBody}
          </Notice>
        )}
        <div className="mt-6 space-y-3 text-[13.5px] text-body">
          <p>{t.pricing.point1}</p>
          <p>{t.pricing.point2}</p>
          <p>{t.pricing.point3}</p>
        </div>
        <ButtonLink href="/bulk" className="mt-6">
          {t.pricing.cta}
        </ButtonLink>
      </Card>
    </div>
  );
}
