"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveCampaignAction,
  rejectCampaignAction,
  type ApprovalResult,
} from "@/server/actions/approval";
import { Button, Input, Notice } from "@/components/ui";
import { useT } from "@/i18n/client";

export function ApprovalDecision({
  campaignId,
  isOwnWork,
  canSelfApprove,
}: {
  campaignId: string;
  isOwnWork: boolean;
  canSelfApprove: boolean;
}) {
  const t = useT();

  const [rejecting, setRejecting] = useState(false);
  const [result, setResult] = useState<ApprovalResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const blockedBySeparation = isOwnWork && !canSelfApprove;

  // A decided campaign leaves the queue, taking this form and any notice in it
  // along with it — so on success the page states the outcome instead.
  function settle(outcome: ApprovalResult) {
    if (outcome.ok) {
      setResult(null);
      router.replace(`/app/approvals?decided=${campaignId}`);
    } else {
      setResult(outcome);
    }
  }

  function approve() {
    startTransition(async () => settle(await approveCampaignAction(campaignId)));
  }

  function reject(formData: FormData) {
    startTransition(async () => settle(await rejectCampaignAction(formData)));
  }

  return (
    <div className="space-y-3">
      {result ? (
        <Notice tone="danger" title={t.approvals.notRecorded}>
          {result.message}
        </Notice>
      ) : null}

      {blockedBySeparation ? (
        <Notice tone="warning" title={t.approvals.youCreatedThis}>
          {t.approvals.youCreatedThisBody}
        </Notice>
      ) : null}

      {rejecting ? (
        <form action={reject} className="space-y-3">
          <input type="hidden" name="campaignId" value={campaignId} />
          <div>
            <label className="field-label" htmlFor={`reason-${campaignId}`}>
              {t.approvals.rejectReasonLabel}
            </label>
            <Input
              id={`reason-${campaignId}`}
              name="reason"
              required
              minLength={5}
              placeholder={t.approvals.rejectReasonPlaceholder}
            />
            <p className="mt-1.5 text-[12.5px] text-muted">
              {t.approvals.rejectReasonHint}
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? t.approvals.rejecting : t.approvals.rejectCampaign}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRejecting(false)}
              disabled={pending}
            >
              {t.common.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={approve} disabled={pending || blockedBySeparation}>
            {pending ? t.approvals.approving : t.approvals.approve}
          </Button>
          <Button variant="ghost" onClick={() => setRejecting(true)} disabled={pending}>
            {t.approvals.reject}
          </Button>
        </div>
      )}
    </div>
  );
}
