"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideVerificationAction, type AdminResult } from "@/server/actions/admin";
import { Button, Input, Notice, Select } from "@/components/ui";
import { useT } from "@/i18n/client";
import { keepValuesOnSubmit } from "@/components/form-submit";

const OPTIONS = [
  { value: "ACTIVE", labelKey: "decisionApprove" },
  { value: "NEEDS_INFORMATION", labelKey: "decisionNeedsInfo" },
  { value: "REJECTED", labelKey: "decisionReject" },
  { value: "SUSPENDED", labelKey: "decisionSuspend" },
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
            {t.adminExtra.decision}
          </label>
          <Select
            id={`decision-${organizationId}`}
            name="decision"
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            {OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t.adminExtra[o.labelKey]}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-[220px] flex-1">
          <label className="field-label" htmlFor={`reason-${organizationId}`}>
            {t.common.reason}{" "}
            {reasonRequired ? (
              <span className="text-danger-fg">*</span>
            ) : (
              t.adminExtra.reasonOptional
            )}
          </label>
          <Input
            id={`reason-${organizationId}`}
            name="reason"
            required={reasonRequired}
            placeholder={
              reasonRequired ? t.adminExtra.reasonWhy : t.adminExtra.reasonOptionalPlaceholder
            }
          />
        </div>

        {/* The whole name: testers sharing the demo register look-alike
            businesses, and a first word alone left several identical buttons. */}
        <Button type="submit" disabled={pending}>
          <span className="whitespace-normal">{pending ? t.common.saving : t.adminExtra.recordFor(name)}</span>
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
