import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/server/auth/context";
import { healthReport } from "@/server/domain/health";
import { getSmsProvider } from "@/server/providers/sms";
import { getPaymentProvider } from "@/server/providers/payments";
import { env } from "@/server/env";
import { formatManila } from "@/server/config";
import { getDictionary } from "@/i18n/server";
import type { Dictionary } from "@/i18n/dictionaries";
import {
  Card,
  CardHeader,
  DataTable,
  DetailRow,
  Notice,
  PageHeader,
  Pill,
  type Tone,
} from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.admin.health.title };
}
export const dynamic = "force-dynamic";

/**
 * System health.
 *
 * The same checks `/api/health?full=1` returns, rendered for a person. A
 * monitoring system scrapes the endpoint; an operator who has been paged wants
 * to see which check failed without reading JSON.
 */
export default async function HealthPage() {
  const t = await getDictionary();

  await requirePlatformAdmin();

  const report = await healthReport();
  const sms = getSmsProvider();
  const payments = getPaymentProvider();

  return (
    <>
      <PageHeader
        title={t.admin.health.title}
        description={t.admin.health.subheading}
        action={<Pill tone={toneFor(report.status)}>{statusLabel(report.status, t)}</Pill>}
      />

      <div className="mb-5 max-w-3xl">
        {report.status === "ok" ? (
          <Notice tone="success" title={t.admin.health.healthyTitle}>
            {t.admin.health.healthyBody(formatManila(new Date()))}
          </Notice>
        ) : report.status === "failing" ? (
          <Notice tone="danger" title={t.admin.health.failingTitle}>
            {t.admin.health.failingBody}
          </Notice>
        ) : (
          <Notice tone="warning" title={t.admin.health.degradedTitle}>
            {t.admin.health.degradedBody}
          </Notice>
        )}
      </div>

      <Card>
        <CardHeader
          title={t.admin.health.checksTitle}
          description={t.admin.health.checksDescription}
        />
        <DataTable>
          <thead>
            <tr>
              <th>{t.admin.health.colCheck}</th>
              <th>{t.admin.health.colState}</th>
              <th>{t.admin.health.colValue}</th>
              <th>{t.admin.health.colMeaning}</th>
            </tr>
          </thead>
          <tbody>
            {report.checks.map((check) => (
              <tr key={check.name}>
                <td className="font-mono text-[12.5px] text-ink">{check.name}</td>
                <td>
                  <Pill tone={toneFor(check.status)}>{statusLabel(check.status, t)}</Pill>
                </td>
                <td className="font-mono text-[12.5px]">{check.value}</td>
                <td className="max-w-md text-muted">{check.detail}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>

      <Card className="mt-5 p-5">
        <h2 className="card-title">{t.admin.health.partnerTitle}</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          {t.admin.health.partnerNote}
        </p>
        <dl className="mt-3">
          <DetailRow label={t.admin.health.rowMode} value={env.APP_MODE} />
          <DetailRow label={t.admin.health.rowSmsAdapter} value={sms.capabilities.name} />
          <DetailRow
            label={t.admin.health.rowIdempotent}
            value={
              sms.capabilities.guaranteesIdempotency
                ? t.admin.health.idempotentYes
                : t.admin.health.idempotentNo
            }
          />
          <DetailRow
            label={t.admin.health.rowReceipts}
            value={
              sms.capabilities.supportsDeliveryWebhook
                ? t.admin.health.receiptsWebhook
                : t.admin.health.receiptsNone
            }
          />
          <DetailRow
            label={t.admin.health.rowLookup}
            value={
              sms.querySubmission
                ? t.admin.health.lookupYes
                : t.admin.health.lookupNo
            }
          />
          <DetailRow label={t.admin.health.rowPaymentAdapter} value={payments.name} />
          <DetailRow label={t.admin.health.rowMailTransport} value={env.MAIL_TRANSPORT} />
        </dl>
      </Card>
    </>
  );
}

function toneFor(status: string): Tone {
  if (status === "ok") return "success";
  if (status === "failing") return "danger";
  return "warning";
}

function statusLabel(status: string, t: Dictionary): string {
  if (status === "ok") return t.admin.health.stateHealthy;
  if (status === "failing") return t.admin.health.stateFailing;
  return t.admin.health.stateDegraded;
}
