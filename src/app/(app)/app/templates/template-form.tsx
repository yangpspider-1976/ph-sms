"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTemplateAction, type TemplateResult } from "@/server/actions/templates";
import { analyzeMessage } from "@/server/domain/segments";
import { Button, Field, FormCard, Input, Notice, Textarea } from "@/components/ui";
import { useT } from "@/i18n/client";
import { keepValuesOnSubmit } from "@/components/form-submit";

export function TemplateForm() {
  const t = useT();

  const [body, setBody] = useState("");
  const [result, setResult] = useState<TemplateResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const info = analyzeMessage(body);

  function submit(formData: FormData, form?: HTMLFormElement) {
    startTransition(async () => {
      const outcome = await saveTemplateAction(formData);
      setResult(outcome);
      if (outcome.ok) {
        setBody("");
        form?.reset();
        router.refresh();
      }
    });
  }

  return (
    <FormCard title={t.templates.newTemplate}>
      <form action={submit} onSubmit={keepValuesOnSubmit(submit)} className="space-y-4">
        <Field label={t.common.name} htmlFor="name" required>
          <Input id="name" name="name" required placeholder={t.templates.namePlaceholder} />
        </Field>

        <div>
          <div className="flex items-end justify-between">
            <label className="field-label" htmlFor="body">
              {t.templates.messageLabel}
            </label>
            <span className="mb-1.5 text-[12.5px] text-muted">
              {t.templates.counter(
                info.visibleCharacters,
                info.segments,
                info.encoding === "GSM7" ? "GSM-7" : t.common.unicode,
              )}
            </span>
          </div>
          <Textarea
            id="body"
            name="body"
            rows={3}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t.templates.bodyPlaceholder}
          />
          <p className="mt-1.5 text-[12.5px] text-muted">
            {t.templates.plainTextNote}
          </p>
        </div>

        {result ? (
          <Notice tone={result.ok ? "success" : "danger"} title={result.ok ? t.templates.saved : t.templates.notSaved}>
            {result.message}
          </Notice>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? t.templates.saving : t.templates.save}
        </Button>
      </form>
    </FormCard>
  );
}
