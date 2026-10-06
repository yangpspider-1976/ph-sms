"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyForSenderAction, type SenderResult } from "@/server/actions/senders";
import { Button, Field, FormCard, Input, Notice, Textarea } from "@/components/ui";
import { useT } from "@/i18n/client";
import { keepValuesOnSubmit } from "@/components/form-submit";

export function SenderApplicationForm() {
  const t = useT();

  const [result, setResult] = useState<SenderResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(formData: FormData, form?: HTMLFormElement) {
    startTransition(async () => {
      const outcome = await applyForSenderAction(formData);
      setResult(outcome);
      if (outcome.ok) {
        form?.reset();
        router.refresh();
      }
    });
  }

  return (
    <FormCard title={t.settings.senders.applyTitle} description={t.settings.senders.applyIntro}>
      <form action={submit} onSubmit={keepValuesOnSubmit(submit)} className="space-y-4">
        <Field
          label={t.settings.senders.senderIdLabel}
          htmlFor="value"
          required
          hint={t.settings.senders.senderIdHint}
        >
          <Input
            id="value"
            name="value"
            required
            maxLength={11}
            placeholder="YOURBRAND"
            className="uppercase"
          />
        </Field>

        <Field
          label={t.settings.senders.relationLabel}
          htmlFor="evidenceNote"
          required
          hint={t.settings.senders.relationHint}

        >
          <Textarea
            id="evidenceNote"
            name="evidenceNote"
            rows={3}
            required
            placeholder={t.settings.senders.relationPlaceholder}
          />
        </Field>

        {result ? (
          <Notice
            tone={result.ok ? "success" : "danger"}
            title={result.ok ? t.settings.senders.submitted : t.settings.senders.notSubmitted}
          >
            {result.message}
          </Notice>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? t.settings.senders.applying : t.settings.senders.apply}
        </Button>
      </form>
    </FormCard>
  );
}
