"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addOptOutsAction, type OptOutResult } from "@/server/actions/contacts";
import { Button, Field, FormCard, Input, Notice, Textarea } from "@/components/ui";
import { useT } from "@/i18n/client";
import { keepValuesOnSubmit } from "@/components/form-submit";

/**
 * Manual opt-out intake.
 *
 * The MVP route for recording a request that arrived by phone, email or in
 * person. Automated inbound handling needs a sender that can receive replies,
 * which the current adapter does not have.
 */
export function OptOutForm() {
  const t = useT();

  const [result, setResult] = useState<OptOutResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(formData: FormData, form?: HTMLFormElement) {
    startTransition(async () => {
      const outcome = await addOptOutsAction(formData);
      setResult(outcome);
      if (outcome.ok) {
        form?.reset();
        router.refresh();
      }
    });
  }

  return (
    <FormCard title={t.contacts.optOuts.formTitle} description={t.contacts.optOuts.formIntro}>
      <form action={submit} onSubmit={keepValuesOnSubmit(submit)} className="space-y-4">
        <Field label={t.contacts.optOuts.numbersLabel} htmlFor="numbers" required>
          <Textarea
            id="numbers"
            name="numbers"
            rows={3}
            required
            placeholder={"09171234567\n09181234567"}
          />
        </Field>

        <Field
          label={t.contacts.optOuts.reasonLabel}
          htmlFor="reason"
          hint={t.contacts.optOuts.reasonHint}
        >
          <Input id="reason" name="reason" placeholder={t.contacts.optOuts.reasonPlaceholder} />
        </Field>

        {result ? (
          <Notice
            tone={result.ok ? "success" : "danger"}
            title={result.ok ? t.contacts.optOuts.recorded : t.contacts.optOuts.notRecorded}
          >
            {result.message}
          </Notice>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? t.contacts.optOuts.adding : t.contacts.optOuts.add}
        </Button>
      </form>
    </FormCard>
  );
}
