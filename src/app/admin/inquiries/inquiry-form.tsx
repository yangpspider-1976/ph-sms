"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateInquiryAction, type AdminResult } from "@/server/actions/admin";
import { Button, Input, Notice, Select } from "@/components/ui";
import { useT } from "@/i18n/client";

const STATUSES = [
  "NEW",
  "CONTACTED",
  "REVIEWING",
  "QUOTATION_SENT",
  "CONTRACTED",
  "COMPLETED",
  "REJECTED",
] as const;

export function InquiryForm({
  inquiryId,
  status,
  note,
}: {
  inquiryId: string;
  status: string;
  note: string | null;
}) {
  const t = useT();

  const [result, setResult] = useState<AdminResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(formData: FormData) {
    startTransition(async () => {
      const outcome = await updateInquiryAction(formData);
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="inquiryId" value={inquiryId} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-[210px]">
          <label className="field-label" htmlFor={`status-${inquiryId}`}>
            Pipeline status
          </label>
          <Select id={`status-${inquiryId}`} name="status" defaultValue={status}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t.status.inquiry[s]}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-[220px] flex-1">
          <label className="field-label" htmlFor={`note-${inquiryId}`}>
            Internal note
          </label>
          <Input
            id={`note-${inquiryId}`}
            name="note"
            defaultValue={note ?? ""}
            placeholder={t.admin.inquiries.internalNotePlaceholder}
          />
        </div>

        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Update"}
        </Button>
      </div>

      {result ? (
        <Notice tone={result.ok ? "success" : "danger"} title={result.ok ? "Updated" : "Not updated"}>
          {result.message}
        </Notice>
      ) : null}
    </form>
  );
}
