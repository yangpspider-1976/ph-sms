import { requirePlatformAdmin } from "@/server/auth/context";
import { env, liveReadinessGaps } from "@/server/env";
import { formatCentavos, liveConfigGaps } from "@/server/config";
import { getEffectiveConfig, listConfig } from "@/server/domain/app-config";
import { formatManila } from "@/server/config";
import { ConfigEditor } from "./config-editor";
import { getSmsProvider } from "@/server/providers/sms";
import { getPaymentProvider } from "@/server/providers/payments";
import { Card, CardHeader, DetailRow, Notice, PageHeader, Pill } from "@/components/ui";
import { getDictionary } from "@/i18n/server";

export const metadata = { title: "Platform settings" };
export const dynamic = "force-dynamic";

/**
 * Configuration and live readiness.
 *
 * The values below are provisional test settings, and the page says so. What is
 * still missing before live activation is listed explicitly rather than left
 * for someone to discover after switching modes.
 */
export default async function AdminSettingsPage() {
  const t = await getDictionary();

  await requirePlatformAdmin();

  // The effective configuration, not the code defaults: an admin who has
  // lowered a limit must see the limit that is actually in force.
  const [config, editable] = await Promise.all([getEffectiveConfig(), listConfig()]);

  const envGaps = liveReadinessGaps();
  const configGaps = liveConfigGaps(config);
  const gaps = [...envGaps, ...configGaps];

  const sms = getSmsProvider();
  const payments = getPaymentProvider();

  return (
    <>
      <PageHeader
        title={t.admin.settings.title}
        description={t.admin.settings.subheading}
      />

      <div className="mb-5 max-w-3xl">
        {gaps.length === 0 ? (
          <Notice tone="success" title={t.admin.settings.noGapsTitle}>
            Every checked input is present. Sandbox, UAT and recovery testing are still separate
            sign-offs.
          </Notice>
        ) : (
          <Notice tone="warning" title={`${gaps.length} inputs still required before live`}>
            These block live activation only. Everything in mock mode works without them.
            <ul className="mt-2 list-disc space-y-0.5 pl-4">
              {gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </Notice>
        )}
      </div>

      <div className="mb-5">
        <ConfigEditor
          mode={env.APP_MODE}
          rows={editable.map((row) => ({
            key: row.key,
            label: row.label,
            value: row.value,
            defaultValue: row.defaultValue,
            overridden: row.overridden,
            updatedAt: row.updatedAt ? formatManila(row.updatedAt) : null,
          }))}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="card-title">{t.admin.settings.runtimeTitle}</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            The mode is read from the server environment and cannot be changed by a request.
          </p>
          <dl className="mt-3">
            <DetailRow
              label={t.admin.settings.rowMode}
              value={
                <Pill tone={env.APP_MODE === "LIVE" ? "success" : "info"}>{env.APP_MODE}</Pill>
              }
            />
            <DetailRow label={t.admin.settings.rowSmsAdapter} value={sms.capabilities.name} />
            <DetailRow
              label={t.admin.settings.rowIdempotency}
              value={sms.capabilities.guaranteesIdempotency ? "Yes" : "No — timeouts are not retried"}
            />
            <DetailRow
              label={t.admin.settings.rowReceipts}
              value={sms.capabilities.supportsDeliveryWebhook ? "Webhook" : "Not available"}
            />
            <DetailRow label={t.admin.settings.rowPaymentAdapter} value={payments.name} />
            <DetailRow label={t.admin.settings.rowMailTransport} value={env.MAIL_TRANSPORT} />
            <DetailRow label={t.admin.settings.rowTimeZone} value="Asia/Manila (display) · UTC (stored)" />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="card-title">{t.admin.settings.limitsTitle}</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            Platform defaults. An organization can be given its own limits from the customers
            screen.
          </p>
          <dl className="mt-3">
            <DetailRow label={t.admin.settings.rowCeiling} value={config.selfServiceCeiling} />
            <DetailRow label={t.admin.settings.rowDailyQuota} value={config.dailyDestinationQuota} />
            <DetailRow label={t.admin.settings.rowMonthlyQuota} value={config.monthlyDestinationQuota} />
            <DetailRow label={t.admin.settings.rowMaxSegments} value={config.maxSegmentsPerMessage} />
            <DetailRow label={t.admin.settings.rowDailySegmentCap} value={config.dailySegmentQuota} />
            <DetailRow
              label={t.admin.settings.rowDailySpendCap}
              value={formatCentavos(config.dailySpendCapCentavos)}
            />
            <DetailRow label={t.admin.settings.rowScheduleHorizon} value={config.maxScheduleDays} />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="card-title">{t.admin.settings.pricingTitle}</h2>
          <div className="mt-2">
            <Notice tone="warning" title={t.admin.settings.illustrativeTitle}>
              This is a test value, not approved commercial pricing, and it is not shown on the
              public pricing page.
            </Notice>
          </div>
          <dl className="mt-3">
            <DetailRow
              label={t.admin.settings.rowUnitPrice}
              value={`${formatCentavos(config.unitPriceCentavos)} per segment`}
            />
            <DetailRow
              label={t.admin.settings.rowPricingApproved}
              value={config.pricingApproved ? t.common.yes : t.common.no}
            />
            <DetailRow label={t.admin.settings.rowPricingVersion} value={config.pricingPolicyVersion} />
            <DetailRow label={t.admin.settings.rowTaxVersion} value={config.taxPolicyVersion} />
            <DetailRow
              label={t.admin.settings.rowDemoFunding}
              value={formatCentavos(config.demoFundingCentavos)}
            />
            <DetailRow label={t.admin.settings.rowQuoteValidity} value={config.quoteValiditySeconds / 60} />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="card-title">{t.admin.settings.retentionTitle}</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            Provisional windows. Final periods are a legal and DPO decision, not a development
            one.
          </p>
          <dl className="mt-3">
            <DetailRow label={t.admin.settings.rowUploads} value={`${config.uploadRetentionHours} hours`} />
            <DetailRow label={t.admin.settings.rowMessageDetail} value={`${config.messageDetailRetentionDays} days`} />
            <DetailRow label={t.admin.settings.rowAuditEvents} value={`${config.auditRetentionDays} days`} />
            <DetailRow label={t.admin.settings.rowContacts} value={`${config.contactRetentionDays} days`} />
            <DetailRow label={t.admin.settings.rowSuppression} value={`${config.suppressionRetentionDays} days`} />
          </dl>
          <p className="mt-3 text-[12px] text-muted">
            Run with <code className="text-[11.5px]">npm run retention</code>. Suppression is
            retained far longer than contacts on purpose: an opt-out has to outlive the contact
            record it came from.
          </p>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          title={t.admin.settings.beforeLiveTitle}
          description={t.admin.settings.beforeLiveDescription}
        />
        <ul className="space-y-2 px-5 pb-5 text-[13px] text-body">
          {[
            "Partner request, response and error schemas, with sample payloads",
            "Partner sender-identity rules and approval process",
            "Partner encoding and segment charging rules, which override the mock values",
            "Partner idempotency and submission-query semantics",
            "Throughput limits, timeouts and maintenance windows",
            "Delivery-event authentication scheme",
            "Charging point and refund rules for failed messages",
            "Approved pricing, tax treatment and invoice policy",
            "A contracted payment provider and its credentials",
            "A real email transport",
            "Approved privacy, consent and retention wording from the DPO or legal adviser",
            "Production admin MFA enrolment",
            "Durable worker hosting, separate from the web process",
            "Successful sandbox, UAT and restore tests",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
