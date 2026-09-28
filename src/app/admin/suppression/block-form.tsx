"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPlatformSuppressionAction, type AdminResult } from "@/server/actions/admin";
import { Button, Card, Field, Input, Notice, Textarea } from "@/components/ui";
import { useT } from "@/i18n/client";

export function PlatformBlockForm() {
  const t = useT();

  const [result, setResult] = useState<AdminResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(formData: FormData) {
    startTransition(async () => {
      const outcome = await addPlatformSuppressionAction(formData);
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  return (
    <Card className="max-w-2xl p-5">
      <h2 className="card-title">{t.admin.suppression.addTitle}</h2>
      <p className="mt-1 text-[13px] text-muted">
        Applies to every organization. Use sparingly.
      </p>

      <form action={submit} className="mt-4 space-y-4">
        <Field label={t.admin.suppression.numbersLabel} htmlFor="numbers" required>
          <Textarea id="numbers" name="numbers" rows={3} required placeholder="09171234567" />
        </Field>

        <Field label={t.admin.suppression.reasonLabel} htmlFor="reason" required hint={t.admin.suppression.reasonHint}>
          <Input id="reason" name="reason" required placeholder={t.admin.suppression.reasonPlaceholder} />
        </Field>

        {result ? (
          <Notice tone={result.ok ? "success" : "danger"} title={result.ok ? "Blocked" : "Not blocked"}>
            {result.message}
          </Notice>
        ) : null}

        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Blocking…" : "Block platform-wide"}
        </Button>
      </form>
    </Card>
  );
}
