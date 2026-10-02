import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { ledgerEntries, payments } from "@/server/db/schema";
import { requireOrgContext } from "@/server/auth/context";
import { getWallet } from "@/server/domain/wallet";
import { DEMO_PACKAGES } from "@/server/providers/payments";
import { startTopUpAction } from "@/server/actions/billing";
import { formatCentavos, formatManila } from "@/server/config";
import { demoFeaturesEnabled } from "@/server/env";
import {
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  Notice,
  PageHeader,
  Pill,
  Stat,
  type Tone,
} from "@/components/ui";
import { IconCard } from "@/components/icons";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.credits.title };
}
export const dynamic = "force-dynamic";

/** What each ledger movement means, in the customer's terms. */
const LEDGER_TONE: Record<string, Tone> = {
  PURCHASE: "success",
  ADJUSTMENT: "warning",
  CHARGE: "info",
  REFUND: "success",
  RESERVE: "neutral",
  RELEASE: "neutral",
};

const PAYMENT_TONE: Record<string, Tone> = {
  PENDING: "warning",
  PAID: "success",
  FAILED: "danger",
  EXPIRED: "neutral",
  REFUNDED: "neutral",
  DISPUTED: "danger",
};

export default async function CreditsPage() {
  const t = await getDictionary();

  const ctx = await requireOrgContext();
  const orgId = ctx.org.organizationId;

  const [wallet, entries, recentPayments] = await Promise.all([
    getWallet(orgId),
    db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.organizationId, orgId))
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(50),
    db
      .select()
      .from(payments)
      .where(eq(payments.organizationId, orgId))
      .orderBy(desc(payments.createdAt))
      .limit(10),
  ]);

  return (
    <>
      <PageHeader
        title={t.credits.title}
        description={t.credits.subheading}
      />

      {wallet.sendingFrozen ? (
        <div className="mb-5">
          <Notice tone="danger" title={t.credits.frozenTitle}>
            {formatCentavos(wallet.debtCentavos)} is owed after a reversed payment. Sending stays
            disabled until the balance is settled. Contact support to resolve it.
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t.credits.available}
          value={formatCentavos(wallet.availableCentavos)}
          hint={t.credits.availableHint}
        />
        <Stat label={t.credits.postedBalance} value={formatCentavos(wallet.postedBalanceCentavos)} />
        <Stat
          label={t.credits.heldForSends}
          value={formatCentavos(wallet.heldCentavos)}
          hint={t.credits.heldHint}
        />
        <Stat
          label={t.credits.owed}
          value={formatCentavos(wallet.debtCentavos)}
          tone={wallet.debtCentavos > 0 ? "danger" : "neutral"}
        />
      </div>

      {ctx.can("billing.manage") ? (
        <Card className="mt-5 p-5">
          <h2 className="card-title">{t.credits.addCredit}</h2>
          <p className="mt-1 text-[13px] text-muted">
            {demoFeaturesEnabled()
              ? t.creditsExtra.demoPackages
              : t.creditsExtra.choosePackage}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {DEMO_PACKAGES.map((pkg) => (
              <form key={pkg.code} action={startTopUpAction}>
                <input type="hidden" name="packageCode" value={pkg.code} />
                <Button type="submit" variant="secondary" className="flex-col items-start gap-0.5 py-3">
                  <span className="text-[14px] font-bold">{formatCentavos(pkg.creditCentavos)}</span>
                  <span className="text-[12px] font-medium opacity-80">{pkg.label}</span>
                </Button>
              </form>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-muted">
            {t.creditsExtra.prepaidNote}
          </p>
        </Card>
      ) : (
        <Card className="mt-5 p-5">
          <Notice tone="info" title={t.credits.deniedTitle}>
            {t.creditsExtra.deniedBody}
          </Notice>
        </Card>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title={t.credits.ledgerTitle}
            description={t.credits.ledgerDescription}
          />
          {entries.length === 0 ? (
            <EmptyState
              title={t.credits.ledgerEmptyTitle}
              description={t.credits.ledgerEmptyBody}
              icon={<IconCard size={20} />}
            />
          ) : (
                          <DataTable>
                <thead>
                  <tr>
                    <th>{t.credits.colMovement}</th>
                    <th>{t.credits.colAmount}</th>
                    <th>{t.credits.colBalanceAfter}</th>
                    <th>{t.credits.colHeldAfter}</th>
                    <th>{t.credits.colWhen}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <Pill tone={LEDGER_TONE[entry.type] ?? "neutral"}>
                          {t.status.ledger[entry.type]}
                        </Pill>
                        {entry.reason ? (
                          <span className="ml-2 text-[12px] font-normal text-muted">
                            {entry.reason}
                          </span>
                        ) : null}
                      </td>
                      <td className={entry.amountCentavos < 0 ? "text-danger-fg" : undefined}>
                        {formatCentavos(entry.amountCentavos)}
                      </td>
                      <td>{formatCentavos(entry.postedBalanceAfter)}</td>
                      <td className="text-muted">{formatCentavos(entry.heldAfter)}</td>
                      <td className="whitespace-nowrap text-muted">
                        {formatManila(entry.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
          )}
        </Card>

        <Card>
          <CardHeader title={t.credits.paymentsTitle} />
          {recentPayments.length === 0 ? (
            <EmptyState
              title={t.credits.paymentsEmptyTitle}
              description={t.credits.paymentsEmptyBody}
              icon={<IconCard size={20} />}
            />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th>{t.credits.colReference}</th>
                  <th>{t.credits.colAmount}</th>
                  <th>{t.common.status}</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="font-mono text-[12px]">{payment.reference.slice(0, 14)}…</td>
                    <td>{formatCentavos(payment.amountCentavos)}</td>
                    <td>
                      <Pill tone={PAYMENT_TONE[payment.status] ?? "neutral"}>
                        {payment.status.charAt(0) + payment.status.slice(1).toLowerCase()}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
          <p className="px-5 pb-4 text-[12px] text-muted">{t.credits.confirmedOnlyNote}</p>
        </Card>
      </div>
    </>
  );
}
