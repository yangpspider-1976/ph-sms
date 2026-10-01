"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideVerificationAction, type AdminResult } from "@/server/actions/admin";
import { Button, Input, Notice, Select } from "@/components/ui";
import { useT } from "@/i18n/client";
import { keepValuesOnSubmit } from "@/components/form-submit";

const OPTIONS = [
  { value: "ACTIVE", label: "Approve" },
  { value: "NEEDS_INFORMATION", label: "Request more information" },
  { value: "REJECTED", label: "Reject" },
  { value: "SUSPENDED", label: "Suspend" },
] as const;

/**
 * Records a verification decision.
 *
 * Anything other than an approval requires a reason, because a suspension or
 * rejection with no stated cause cannot be reviewed or appealed later.
 */
export function VerificationDecision({
  organizationId,
  name,
}: {
  organizationId: string;
  name: string;
}) {
  const t = useT();

  const [decision, setDecision] = useState<string>("ACTIVE");
  const [result, setResult] = useState<AdminResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const reasonRequired = decision !== "ACTIVE";

  function submit(formData: FormData) {
    startTransition(async () => {
      const outcome = await decideVerificationAction(formData);
      if (outcome.ok) {
        // A decided business usually leaves the queue, taking this form and any
        // notice in it along with it — so the page states the outcome instead.
        setResult(null);
        router.replace(`/admin/verification?decided=${organizationId}`);
      } else {
        setResult(outcome);
      }
    });
  }

  return (
    <form action={submit} onSubmit={keepValuesOnSubmit(submit)} className="space-y-3">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-[230px]">
          <label className="field-label" htmlFor={`decision-${organizationId}`}>
            Decision
          </label>
          <Select
            id={`decision-${organizationId}`}
            name="decision"
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            {OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-[220px] flex-1">
          <label className="field-label" htmlFor={`reason-${organizationId}`}>
            Reason {reasonRequired ? <span className="text-danger-fg">*</span> : "(optional)"}
          </label>
          <Input
            id={`reason-${organizationId}`}
            name="reason"
            required={reasonRequired}
            placeholder={
              reasonRequired
                ? "Why this decision was made"
                : "Optional note kept with the record"
            }
          />
        </div>

        {/* The whole name: testers sharing the demo register look-alike
            businesses, and a first word alone left several identical buttons. */}
        <Button type="submit" disabled={pending}>
          <span className="whitespace-normal">{pending ? "Saving…" : `Record for ${name}`}</span>
        </Button>
      </div>

      {result ? (
        <Notice tone="danger" title={t.common.notRecorded}>
          {result.message}
        </Notice>
      ) : null}
    </form>
  );
}
