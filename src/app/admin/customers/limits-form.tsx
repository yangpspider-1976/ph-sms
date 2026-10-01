"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLimitsAction, type AdminResult } from "@/server/actions/admin";
import { Button, Input, Notice } from "@/components/ui";
import { useT } from "@/i18n/client";
import { keepValuesOnSubmit } from "@/components/form-submit";

export function LimitsForm({
  organizationId,
  daily,
  monthly,
  usingDefaults,
}: {
  organizationId: string;
  daily: number;
  monthly: number;
  usingDefaults: boolean;
}) {
  const t = useT();

  const [result, setResult] = useState<AdminResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(formData: FormData) {
    startTransition(async () => {
      const outcome = await updateLimitsAction(formData);
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  return (
    <form action={submit} onSubmit={keepValuesOnSubmit(submit)} className="space-y-2">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-[130px]">
          <label className="field-label" htmlFor={`daily-${organizationId}`}>
            Daily limit
          </label>
          <Input
            id={`daily-${organizationId}`}
            name="daily"
            type="number"
            min={1}
            defaultValue={daily}
          />
        </div>
        <div className="w-[140px]">
          <label className="field-label" htmlFor={`monthly-${organizationId}`}>
            Monthly limit
          </label>
          <Input
            id={`monthly-${organizationId}`}
            name="monthly"
            type="number"
            min={1}
            defaultValue={monthly}
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" className="py-2.5" disabled={pending}>
          {pending ? "Saving…" : "Update limits"}
        </Button>
        {usingDefaults ? (
          <span className="pb-2 text-[12px] text-muted">{t.admin.customers.usingDefaults}</span>
        ) : null}
      </div>

      {result ? (
        <Notice tone={result.ok ? "success" : "danger"} title={result.ok ? "Updated" : "Not updated"}>
          {result.message}
        </Notice>
      ) : null}
    </form>
  );
}
