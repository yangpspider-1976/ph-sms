"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveSenderForDemoAction, type SenderResult } from "@/server/actions/senders";
import { Button, Notice } from "@/components/ui";
import { useT } from "@/i18n/client";

/**
 * Demo shortcut.
 *
 * Stands in for the platform admin decision so a single person can walk the
 * whole flow in mock mode. It is excluded from LIVE, the action refuses to run
 * there, and it writes the same status field the real admin decision writes —
 * it is a shortcut through the queue, not around the rule.
 */
export function DemoApproveButton({ senderId, value }: { senderId: string; value: string }) {
  const t = useT();

  const [result, setResult] = useState<SenderResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function approve() {
    startTransition(async () => {
      const outcome = await approveSenderForDemoAction(senderId);
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  if (result && !result.ok) {
    return (
      <Notice tone="danger" title={t.settings.senders.notApproved}>
        {result.message}
      </Notice>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[9px] border border-dashed border-brand-200 bg-brand-50/50 px-3 py-2.5">
      <span className="text-[12.5px] text-body">{t.settings.senders.demoApproveNote(value)}</span>
      <Button
        variant="secondary"
        size="sm"
        onClick={approve}
        disabled={pending}
        data-testid="demo-approve-sender"
      >
        {pending ? t.settings.senders.demoApproving : t.settings.senders.demoApprove}
      </Button>
    </div>
  );
}
