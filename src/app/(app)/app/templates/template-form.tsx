"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTemplateAction, type TemplateResult } from "@/server/actions/templates";
import { analyzeMessage } from "@/server/domain/segments";
import { Button, Card, Field, Input, Notice, Textarea } from "@/components/ui";
import { useT } from "@/i18n/client";

export function TemplateForm() {
  const t = useT();

  const [body, setBody] = useState("");
  const [result, setResult] = useState<TemplateResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const info = analyzeMessage(body);

  function submit(formData: FormData) {
    startTransition(async () => {
      const outcome = await saveTemplateAction(formData);
      setResult(outcome);
      if (outcome.ok) {
        setBody("");
        router.refresh();
      }
    });
  }

  return (
    <Card className="max-w-2xl p-5">
      <h2 className="card-title">{t.templates.newTemplate}</h2>

      <form action={submit} className="mt-4 space-y-4">
        <Field label={t.common.name} htmlFor="name" required>
          <Input id="name" name="name" required placeholder={t.templates.namePlaceholder} />
        </Field>

        <div>
          <div className="flex items-end justify-between">
            <label className="field-label" htmlFor="body">
              Message
            </label>
            <span className="mb-1.5 text-[12.5px] text-muted">
              {info.visibleCharacters} characters · {info.segments} segment
              {info.segments === 1 ? "" : "s"} · {info.encoding === "GSM7" ? "GSM-7" : "Unicode"}
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
            Plain text only. Personalization variables are not available yet, so write the
            message out in full.
          </p>
        </div>

        {result ? (
          <Notice tone={result.ok ? "success" : "danger"} title={result.ok ? "Saved" : "Not saved"}>
            {result.message}
          </Notice>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save template"}
        </Button>
      </form>
    </Card>
  );
}
