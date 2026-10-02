"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { stopCampaignAction, type StopResult } from "@/server/actions/campaigns";
import { Button, Notice } from "@/components/ui";
import { useT } from "@/i18n/client";

/**
 * Stop control.
 *
 * The result is reported exactly as it happened: how many messages were
 * actually prevented, how many the provider had already accepted, and how many
 * are unresolved. A message already handed over cannot be recalled, and the UI
 * does not pretend otherwise.
 */
export function StopCampaignButton({ campaignId }: { campaignId: string }) {
  const t = useT();

  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<StopResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function stop() {
    startTransition(async () => {
      const outcome = await stopCampaignAction(campaignId);
      setResult(outcome);
      setConfirming(false);
      router.refresh();
    });
  }

  if (result?.ok) {
    return (
      <div className="max-w-md">
        <Notice tone="info" title={t.campaignDetail.stoppedTitle}>
          {t.campaignDetail.stoppedPrevented(result.prevented)}
          {result.alreadyAccepted > 0
            ? t.campaignDetail.stoppedAccepted(result.alreadyAccepted)
            : ""}
          {result.unresolved > 0 ? t.campaignDetail.stoppedUnresolved(result.unresolved) : ""}
        </Notice>
      </div>
    );
  }

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        {t.campaignDetail.stopCampaign}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-body">{t.campaignDetail.stopConfirm}</span>
      <Button variant="danger" onClick={stop} disabled={pending}>
        {pending ? t.campaignDetail.stopping : t.campaignDetail.stopYes}
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
        {t.campaignDetail.keepSending}
      </Button>
    </div>
  );
}
