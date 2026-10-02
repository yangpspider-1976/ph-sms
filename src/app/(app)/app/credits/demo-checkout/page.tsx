import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { payments } from "@/server/db/schema";
import { requireOrgContext } from "@/server/auth/context";
import { demoFeaturesEnabled } from "@/server/env";
import { formatCentavos } from "@/server/config";
import { Card, DetailRow, Notice, PageHeader } from "@/components/ui";
import { DemoPayButton } from "./demo-pay-button";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.credits.checkoutTitle };
}
export const dynamic = "force-dynamic";

/**
 * Stand-in for a payment gateway's hosted page.
 *
 * It exists only outside LIVE. Completing it does not credit anything directly:
 * it makes the mock gateway emit a signed event, which goes through the same
 * webhook path a real provider would use.
 */
export default async function DemoCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const t = await getDictionary();

  if (!demoFeaturesEnabled()) redirect("/app/credits");

  const ctx = await requireOrgContext();
  const { reference } = await searchParams;
  if (!reference) notFound();

  const payment = (
    await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.reference, reference),
          eq(payments.organizationId, ctx.org.organizationId),
        ),
      )
      .limit(1)
  )[0];

  if (!payment) notFound();

  return (
    <>
      <PageHeader title={t.credits.checkoutTitle} description={t.credits.checkoutSubheading} />
      <Card className="max-w-lg p-6">
        <Notice tone="warning" title={t.credits.notRealTitle}>
          {t.creditsExtra.notRealBody}
        </Notice>

        <dl className="mt-5">
          <DetailRow label={t.credits.colReference} value={<span className="font-mono">{payment.reference}</span>} />
          <DetailRow label={t.credits.package} value={payment.packageCode} />
          <DetailRow label={t.credits.colAmount} value={formatCentavos(payment.amountCentavos)} />
          <DetailRow label={t.credits.creditLabel} value={formatCentavos(payment.creditCentavos)} />
          <DetailRow label={t.common.status} value={t.status.payment[payment.status]} />
        </dl>

        {payment.status === "PENDING" ? (
          <div className="mt-5">
            <DemoPayButton reference={payment.reference} />
          </div>
        ) : (
          <p className="mt-5 text-[13px] text-muted">
            {t.credits.paymentAlready(t.status.payment[payment.status])}
          </p>
        )}
      </Card>
    </>
  );
}
