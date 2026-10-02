"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  beginMfaEnrolmentAction,
  confirmMfaEnrolmentAction,
  verifyMfaAction,
  type MfaResult,
  type MfaSetup,
} from "@/server/actions/mfa";
import { Button, ButtonLink, Field, Input, Notice } from "@/components/ui";
import { useT } from "@/i18n/client";
import { keepValuesOnSubmit } from "@/components/form-submit";

export function MfaPanel({
  enrolled,
  remainingRecoveryCodes,
}: {
  enrolled: boolean;
  remainingRecoveryCodes: number;
}) {
  const t = useT();

  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [result, setResult] = useState<MfaResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function begin() {
    startTransition(async () => {
      setResult(null);
      setSetup(await beginMfaEnrolmentAction());
    });
  }

  function confirm(formData: FormData) {
    startTransition(async () => {
      const outcome = await confirmMfaEnrolmentAction(formData);
      setResult(outcome);
      if (outcome.ok) setSetup(null);
    });
  }

  function verify(formData: FormData) {
    startTransition(async () => {
      const outcome = await verifyMfaAction(formData);
      setResult(outcome);
      if (outcome.ok) {
        router.refresh();
        router.push("/admin");
      }
    });
  }

  /* --- Recovery codes, shown exactly once ------------------------------- */

  if (result?.ok && result.recoveryCodes) {
    return (
      <div>
        <Notice tone="success" title={t.adminExtra.mfaOnTitle}>
          {result.message}
        </Notice>
        <ul className="mt-4 grid grid-cols-2 gap-2">
          {result.recoveryCodes.map((code) => (
            <li
              key={code}
              className="rounded-md border border-line bg-canvas px-3 py-2 text-center font-mono text-[13px] text-ink"
            >
              {code}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] text-muted">{t.adminExtra.mfaRecoveryNote}</p>
        <ButtonLink href="/admin" className="mt-5 w-full">
          {t.adminExtra.mfaContinue}
        </ButtonLink>
      </div>
    );
  }

  /* --- Already enrolled: verify ----------------------------------------- */

  if (enrolled) {
    return (
      <form action={verify} onSubmit={keepValuesOnSubmit(verify)} className="space-y-4">
        {result && !result.ok ? (
          <Notice tone="danger" title={t.adminExtra.mfaNotVerified}>
            {result.message}
          </Notice>
        ) : null}
        {result?.ok ? (
          <Notice tone="success" title={t.adminExtra.mfaVerified}>
            {result.message}
          </Notice>
        ) : null}

        <Field
          label={t.adminExtra.mfaCodeLabel}
          htmlFor="code"
          hint={
            remainingRecoveryCodes > 0
              ? `A recovery code also works. You have ${remainingRecoveryCodes} left.`
              : "You have no recovery codes left."
          }
        >
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            placeholder="123456"
          />
        </Field>

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t.adminExtra.mfaChecking : t.adminExtra.mfaVerify}
        </Button>
      </form>
    );
  }

  /* --- Not enrolled: start ---------------------------------------------- */

  if (!setup) {
    return (
      <div>
        <p className="text-[13.5px] text-body">{t.adminExtra.mfaNeedApp}</p>
        {result && !result.ok ? (
          <div className="mt-4">
            <Notice tone="danger" title={t.adminExtra.mfaNotEnrolled}>
              {result.message}
            </Notice>
          </div>
        ) : null}
        <Button onClick={begin} className="mt-5 w-full" disabled={pending}>
          {pending ? t.adminExtra.mfaPreparing : t.adminExtra.mfaSetUp}
        </Button>
      </div>
    );
  }

  return (
    <form action={confirm} onSubmit={keepValuesOnSubmit(confirm)} className="space-y-4">
      <input type="hidden" name="secret" value={setup.secret} />

      <div>
        <p className="text-[13.5px] font-semibold text-ink">1. Add this key to your app</p>
        <p className="mt-1 break-all rounded-md border border-line bg-canvas px-3 py-2 font-mono text-[13px] text-ink">
          {setup.secret}
        </p>
        <p className="mt-1.5 text-[12.5px] text-muted">{t.adminExtra.mfaSetupUri}</p>
        <p className="mt-1 break-all text-[11.5px] text-muted">{setup.uri}</p>
      </div>

      {result && !result.ok ? (
        <Notice tone="danger" title={t.adminExtra.mfaNotEnrolled}>
          {result.message}
        </Notice>
      ) : null}

      <Field
        label={t.adminExtra.mfaStep2}
        htmlFor="code"
        hint={t.adminExtra.mfaStep2Hint}
      >
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          placeholder="123456"
        />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.adminExtra.mfaConfirming : t.adminExtra.mfaTurnOn}
      </Button>
    </form>
  );
}
