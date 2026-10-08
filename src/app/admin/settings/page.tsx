import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/server/auth/context";
import { env, liveReadinessGaps } from "@/server/env";
import { formatCentavos, liveConfigGaps } from "@/server/config";
import { getEffectiveConfig, listConfig } from "@/server/domain/app-config";
import { ConfigEditor } from "./config-editor";
import { getSmsProvider } from "@/server/providers/sms";
import { getPaymentProvider } from "@/server/providers/payments";
import { Card, CardHeader, DetailRow, Notice, PageHeader, Pill } from "@/components/ui";
import { getDictionary, getI18n } from "@/i18n/server";
import { formatDateTime } from "@/i18n/format";
import { localizeServerText } from "@/i18n/server-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.admin.settings.title };
}
export const dynamic = "force-dynamic";

/**
 * Configuration and live readiness.
 *
 * The values below are provisional test settings, and the page says so. What is
 * still missing before live activation is listed explicitly rather than left
 * for someone to discover after switching modes.
 */
export default async function AdminSettingsPage() {
  const { t, locale } = await getI18n();

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
            {t.adminExtra.noGapsBody}
          </Notice>
        ) : (
          <Notice tone="warning" title={t.adminExtra.gapsTitle(gaps.length)}>
            {t.adminExtra.gapsBody}
            <ul className="mt-2 list-disc space-y-0.5 pl-4">
              {gaps.map((gap) => (
                <li key={gap}>{localizeServerText(gap, t)}</li>
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
            updatedAt: row.updatedAt ? formatDateTime(row.updatedAt, locale) : null,
          }))}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="card-title">{t.admin.settings.runtimeTitle}</h2>
          <p className="mt-1 text-[12.5px] text-muted">{t.adminExtra.runtimeNote}</p>
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
              value={
                sms.capabilities.guaranteesIdempotency ? t.common.yes : t.adminExtra.idempotencyNo
              }
            />
            <DetailRow
              label={t.admin.settings.rowReceipts}
              value={
                sms.capabilities.supportsDeliveryWebhook
                  ? t.adminExtra.receiptsWebhook
                  : t.adminExtra.notAvailable
              }
            />
            <DetailRow label={t.admin.settings.rowPaymentAdapter} value={payments.name} />
            <DetailRow label={t.admin.settings.rowMailTransport} value={env.MAIL_TRANSPORT} />
            <DetailRow label={t.admin.settings.rowTimeZone} value={t.adminExtra.timeZoneValue} />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="card-title">{t.admin.settings.limitsTitle}</h2>
          <p className="mt-1 text-[12.5px] text-muted">{t.adminExtra.limitsNote}</p>
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
              {t.adminExtra.illustrativeBody}
            </Notice>
          </div>
          <dl className="mt-3">
            <DetailRow
              label={t.admin.settings.rowUnitPrice}
              value={t.adminExtra.perSegment(formatCentavos(config.unitPriceCentavos))}
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
          <p className="mt-1 text-[12.5px] text-muted">{t.adminExtra.retentionNote}</p>
          <dl className="mt-3">
            <DetailRow label={t.admin.settings.rowUploads} value={t.adminExtra.hours(config.uploadRetentionHours)} />
            <DetailRow label={t.admin.settings.rowMessageDetail} value={t.adminExtra.days(config.messageDetailRetentionDays)} />
            <DetailRow label={t.admin.settings.rowAuditEvents} value={t.adminExtra.days(config.auditRetentionDays)} />
            <DetailRow label={t.admin.settings.rowContacts} value={t.adminExtra.days(config.contactRetentionDays)} />
            <DetailRow label={t.admin.settings.rowSuppression} value={t.adminExtra.days(config.suppressionRetentionDays)} />
          </dl>
          <p className="mt-3 text-[12px] text-muted">
            {t.adminExtra.retentionRun("npm run retention")}
          </p>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          title={t.admin.settings.beforeLiveTitle}
          description={t.admin.settings.beforeLiveDescription}
        />
        <ul className="space-y-2 px-5 pb-5 text-[13px] text-body">
          {Object.values(t.admin.settings.beforeLiveItems).map((item) => (
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
