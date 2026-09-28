"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmMobileVerificationAction,
  removeVerifiedMobileAction,
  startMobileVerificationAction,
  type MobileResult,
} from "@/server/actions/mobile";
import { Button, Card, Field, Input, Notice, Pill } from "@/components/ui";
import { useT } from "@/i18n/client";

/**
 * Optional mobile verification (AUTH-02).
 *
 * Presented as what it is used for — enabling test sends — rather than as an
 * account chore, because it is genuinely optional.
 */
export function MobileVerification({
  mask,
  verifiedAt,
}: {
  mask: string | null;
  verifiedAt: string | null;
}) {
  const t = useT();

  const [stage, setStage] = useState<"idle" | "code">("idle");
  const [result, setResult] = useState<MobileResult | null>(null);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function start(formData: FormData) {
    startTransition(async () => {
      const outcome = await startMobileVerificationAction(formData);
      setResult(outcome);
      if (outcome.ok) {
        setStage("code");
        setDemoCode(outcome.demoCode ?? null);
      }
    });
  }

  function confirm(formData: FormData) {
    startTransition(async () => {
      const outcome = await confirmMobileVerificationAction(formData);
      setResult(outcome);
      if (outcome.ok) {
        setStage("idle");
        setDemoCode(null);
        router.refresh();
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const outcome = await removeVerifiedMobileAction();
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="card-title">{t.settings.profile.mobileTitle}</h2>
          <p className="mt-1 max-w-prose text-[13px] text-muted">
            {t.settings.profile.mobileIntro}
          </p>
        </div>
        {verifiedAt ? (
          <Pill tone="success" dot={false}>
            {t.common.verified}
          </Pill>
        ) : null}
      </div>

      {result ? (
        <div className="mt-4">
          <Notice tone={result.ok ? "success" : "danger"} title={result.ok ? t.groups.done : t.groups.notDone}>
            {result.message}
          </Notice>
        </div>
      ) : null}

      {demoCode ? (
        <div className="mt-3">
          <Notice tone="info" title={t.settings.profile.demoModeTitle}>
            {t.settings.profile.demoCodeNote(demoCode)}
          </Notice>
        </div>
      ) : null}

      {verifiedAt && stage === "idle" ? (
        <div className="mt-4">
          <dl className="divide-y divide-line border-y border-line">
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <dt className="text-[13px] text-muted">{t.settings.profile.number}</dt>
              <dd className="text-[13.5px] font-semibold text-ink">{mask}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <dt className="text-[13px] text-muted">{t.settings.profile.verifiedOn}</dt>
              <dd className="text-[13.5px] text-ink">{verifiedAt}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setStage("code")} disabled={pending}>
              {t.settings.profile.changeNumber}
            </Button>
            <Button variant="ghost" onClick={remove} disabled={pending}>
              {t.common.remove}
            </Button>
          </div>
        </div>
      ) : null}

      {stage === "idle" && !verifiedAt ? (
        <form action={start} className="mt-4 max-w-sm space-y-3">
          <Field
            label={t.settings.profile.mobileLabel}
            htmlFor="mobile-number"
            hint={t.settings.profile.mobileHint}
          >
            <Input
              id="mobile-number"
              name="number"
              type="tel"
              autoComplete="tel"
              placeholder="0917 123 4567"
              required
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? t.settings.profile.sendingCode : t.settings.profile.sendCode}
          </Button>
        </form>
      ) : null}

      {stage === "code" ? (
        <div className="mt-4 max-w-sm space-y-4">
          <form action={confirm} className="space-y-3">
            <Field
              label={t.settings.profile.codeLabel}
              htmlFor="mobile-code"
              hint={t.settings.profile.codeHint}
            >
              <Input
                id="mobile-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="123456"
                required
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? t.settings.profile.checking : t.settings.profile.verify}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setStage("idle");
                  setDemoCode(null);
                  setResult(null);
                }}
                disabled={pending}
              >
                {t.common.cancel}
              </Button>
            </div>
          </form>

          <form action={start} className="space-y-3 border-t border-line pt-4">
            <Field
              label={t.settings.profile.wrongNumber}
              htmlFor="mobile-number-retry"
              hint={t.settings.profile.wrongNumberHint}
            >
              <Input
                id="mobile-number-retry"
                name="number"
                type="tel"
                placeholder="0917 123 4567"
                required
              />
            </Field>
            <Button type="submit" variant="ghost" disabled={pending}>
              {t.settings.profile.sendNewCode}
            </Button>
          </form>
        </div>
      ) : null}
    </Card>
  );
}
