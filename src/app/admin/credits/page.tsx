import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { ledgerEntries, organizations, paymentEvents, payments, wallets } from "@/server/db/schema";
import { requirePlatformAdmin } from "@/server/auth/context";
import { formatCentavos, formatManila } from "@/server/config";
import {
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
import { IconDatabase } from "@/components/icons";
import { ClearFreezeButton } from "./clear-freeze-button";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.admin.credits.title };
}
export const dynamic = "force-dynamic";

const PAYMENT_TONE: Record<string, Tone> = {
  PENDING: "warning",
  PAID: "success",
  FAILED: "danger",
  EXPIRED: "neutral",
  REFUNDED: "neutral",
  DISPUTED: "danger",
};

export default async function AdminCreditsPage() {
  const t = await getDictionary();

  await requirePlatformAdmin();

  const [walletRows, recentPayments, recentLedger, eventStats] = await Promise.all([
    db
      .select({
        organizationId: wallets.organizationId,
        name: organizations.name,
        posted: wallets.postedBalanceCentavos,
        held: wallets.heldCentavos,
        debt: wallets.debtCentavos,
        frozen: wallets.sendingFrozen,
      })
      .from(wallets)
      .innerJoin(organizations, eq(organizations.id, wallets.organizationId))
      .orderBy(desc(wallets.debtCentavos)),
    db
      .select({
        id: payments.id,
        reference: payments.reference,
        amount: payments.amountCentavos,
        status: payments.status,
        createdAt: payments.createdAt,
        name: organizations.name,
      })
      .from(payments)
      .innerJoin(organizations, eq(organizations.id, payments.organizationId))
      .orderBy(desc(payments.createdAt))
      .limit(20),
    db
      .select({
        id: ledgerEntries.id,
        type: ledgerEntries.type,
        amount: ledgerEntries.amountCentavos,
        createdAt: ledgerEntries.createdAt,
        reason: ledgerEntries.reason,
        name: organizations.name,
      })
      .from(ledgerEntries)
      .innerJoin(organizations, eq(organizations.id, ledgerEntries.organizationId))
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(25),
    db
      .select({
        total: sql<number>`count(*)::int`,
        rejected: sql<number>`count(*) filter (where ${paymentEvents.outcome} in ('MISMATCH','UNKNOWN_REFERENCE'))::int`,
      })
      .from(paymentEvents),
  ]);

  const events = eventStats[0] ?? { total: 0, rejected: 0 };
  const frozen = walletRows.filter((w) => w.frozen);
  const totalHeld = walletRows.reduce((sum, w) => sum + w.held, 0);
  const totalDebt = walletRows.reduce((sum, w) => sum + w.debt, 0);

  return (
    <>
      <PageHeader
        title={t.admin.credits.title}
        description={t.admin.credits.subheading}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t.admin.credits.statHeld} value={formatCentavos(totalHeld)} />
        <Stat
          label={t.admin.credits.statDebt}
          value={formatCentavos(totalDebt)}
          tone={totalDebt > 0 ? "danger" : "neutral"}
        />
        <Stat label={t.admin.credits.statEvents} value={events.total} />
        <Stat
          label={t.admin.credits.statRejected}
          value={events.rejected}
          hint={t.admin.credits.statRejectedHint}
        />
      </div>

      {frozen.length > 0 ? (
        <Card className="mt-5">
          <CardHeader
            title={`${frozen.length} account(s) frozen`}
            description={t.admin.credits.frozenDescription}
          />
          <div className="divide-y divide-line">
            {frozen.map((wallet) => (
              <div
                key={wallet.organizationId}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div>
                  <p className="text-[14px] font-bold text-ink">{wallet.name}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {formatCentavos(wallet.debt)} owed · {formatCentavos(wallet.posted)} balance
                  </p>
                </div>
                <ClearFreezeButton organizationId={wallet.organizationId} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title={t.admin.credits.recentPayments} />
          {recentPayments.length === 0 ? (
            <EmptyState
              title={t.admin.credits.noPayments}
              description={t.admin.credits.noPaymentsBody}
              icon={<IconDatabase size={20} />}
            />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th>{t.admin.colOrganization}</th>
                  <th>{t.admin.colAmount}</th>
                  <th>{t.admin.colStatus}</th>
                  <th>{t.admin.colWhen}</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.name}</td>
                    <td>{formatCentavos(payment.amount)}</td>
                    <td>
                      <Pill tone={PAYMENT_TONE[payment.status] ?? "neutral"}>
                        {payment.status.toLowerCase()}
                      </Pill>
                    </td>
                    <td className="whitespace-nowrap text-muted">
                      {formatManila(payment.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>

        <Card>
          <CardHeader
            title={t.admin.credits.recentLedger}
            description={t.admin.credits.ledgerDescription}
          />
          {recentLedger.length === 0 ? (
            <EmptyState
              title={t.admin.credits.noEntries}
              description={t.admin.credits.noEntriesBody}
              icon={<IconDatabase size={20} />}
            />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th>{t.admin.colOrganization}</th>
                  <th>{t.admin.credits.colType}</th>
                  <th>{t.admin.colAmount}</th>
                  <th>{t.admin.colWhen}</th>
                </tr>
              </thead>
              <tbody>
                {recentLedger.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.name}</td>
                    <td className="text-muted">{entry.type.toLowerCase()}</td>
                    <td className={entry.amount < 0 ? "text-danger-fg" : undefined}>
                      {formatCentavos(entry.amount)}
                    </td>
                    <td className="whitespace-nowrap text-muted">
                      {formatManila(entry.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>
      </div>

      <div className="mt-5 max-w-3xl">
        <Notice tone="info" title={t.admin.credits.adjustmentsTitle}>
          {t.adminExtra.adjustmentsBody}
        </Notice>
      </div>
    </>
  );
}
