"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPlatformSuppressionAction, type AdminResult } from "@/server/actions/admin";
import { Button, Field, FormCard, Input, Notice, Textarea } from "@/components/ui";
import { useT } from "@/i18n/client";
import { keepValuesOnSubmit } from "@/components/form-submit";

export function PlatformBlockForm() {
  const t = useT();

  const [result, setResult] = useState<AdminResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(formData: FormData, form?: HTMLFormElement) {
    startTransition(async () => {
      const outcome = await addPlatformSuppressionAction(formData);
      setResult(outcome);
      if (outcome.ok) {
        form?.reset();
        router.refresh();
      }
    });
  }

  return (
    <FormCard title={t.admin.suppression.addTitle} description={t.adminExtra.blockIntro}>
      <form action={submit} onSubmit={keepValuesOnSubmit(submit)} className="space-y-4">
        <Field label={t.admin.suppression.numbersLabel} htmlFor="numbers" required>
          <Textarea id="numbers" name="numbers" rows={3} required placeholder="09171234567" />
        </Field>

        <Field label={t.admin.suppression.reasonLabel} htmlFor="reason" required hint={t.admin.suppression.reasonHint}>
          <Input id="reason" name="reason" required placeholder={t.admin.suppression.reasonPlaceholder} />
        </Field>

        {result ? (
          <Notice
            tone={result.ok ? "success" : "danger"}
            title={result.ok ? t.adminExtra.blocked : t.adminExtra.notBlocked}
          >
            {result.message}
          </Notice>
        ) : null}

        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? t.adminExtra.blocking : t.adminExtra.block}
        </Button>
      </form>
    </FormCard>
  );
}
