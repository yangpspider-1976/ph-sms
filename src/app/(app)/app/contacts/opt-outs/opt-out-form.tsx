"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addOptOutsAction, type OptOutResult } from "@/server/actions/contacts";
import { Button, Card, Field, Input, Notice, Textarea } from "@/components/ui";
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
    <Card className="max-w-2xl p-5">
      <h2 className="card-title">{t.contacts.optOuts.formTitle}</h2>
      <p className="mt-1 text-[13px] text-muted">
        Enter the numbers a recipient asked you to remove. One per line, or separated by commas.
      </p>

      <form action={submit} onSubmit={keepValuesOnSubmit(submit)} className="mt-4 space-y-4">
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
            title={result.ok ? "Recorded" : "Not recorded"}
          >
            {result.message}
          </Notice>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? "Recording…" : "Add to opt-out list"}
        </Button>
      </form>
    </Card>
  );
}
