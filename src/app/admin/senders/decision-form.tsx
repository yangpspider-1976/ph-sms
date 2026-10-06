"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideSenderAction, type AdminResult } from "@/server/actions/admin";
import { Button, Input, Notice, Select } from "@/components/ui";
import { useT } from "@/i18n/client";
import { keepValuesOnSubmit } from "@/components/form-submit";

export function SenderDecision({ senderId, value }: { senderId: string; value: string }) {
  const t = useT();

  const [decision, setDecision] = useState("APPROVED");
  const [result, setResult] = useState<AdminResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(formData: FormData) {
    startTransition(async () => {
      const outcome = await decideSenderAction(formData);
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  return (
    <form action={submit} onSubmit={keepValuesOnSubmit(submit)} className="space-y-3">
      <input type="hidden" name="senderId" value={senderId} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-[190px]">
          <label className="field-label" htmlFor={`sd-${senderId}`}>
            {t.adminExtra.decision}
          </label>
          <Select
            id={`sd-${senderId}`}
            name="decision"
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            <option value="APPROVED">{t.adminExtra.approve}</option>
            <option value="REJECTED">{t.adminExtra.reject}</option>
            <option value="REVOKED">{t.adminExtra.revoke}</option>
          </Select>
        </div>

        <div className="min-w-[220px] flex-1">
          <label className="field-label" htmlFor={`sr-${senderId}`}>
            {t.common.reason}
          </label>
          <Input id={`sr-${senderId}`} name="reason" placeholder={t.adminExtra.decisionNotePlaceholder} />
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? t.common.saving : t.adminExtra.recordFor(value)}
        </Button>
      </div>

      {decision === "APPROVED" ? (
        <label className="flex items-start gap-2 text-[13px] text-body">
          <input
            type="checkbox"
            name="supportsInboundReplies"
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
          />
          <span>
            {t.adminExtra.inboundRepliesLabel}
            <span className="block text-[12px] text-muted">{t.adminExtra.inboundRepliesHint}</span>
          </span>
        </label>
      ) : null}

      {result ? (
        <Notice
          tone={result.ok ? "success" : "danger"}
          title={result.ok ? t.adminExtra.recorded : t.common.notRecorded}
        >
          {result.message}
        </Notice>
      ) : null}
    </form>
  );
}
