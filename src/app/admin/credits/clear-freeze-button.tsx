"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearSendingFreezeAction, type AdminResult } from "@/server/actions/admin";
import { Button, Notice } from "@/components/ui";
import { useT } from "@/i18n/client";

/**
 * Lifts a sending freeze.
 *
 * Deliberately two steps, and deliberately does not touch the recorded debt:
 * settling the money is a separate, human decision from letting the account
 * send again.
 */
export function ClearFreezeButton({ organizationId }: { organizationId: string }) {
  const t = useT();

  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<AdminResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function clear() {
    startTransition(async () => {
      const outcome = await clearSendingFreezeAction(organizationId);
      setResult(outcome);
      setConfirming(false);
      if (outcome.ok) router.refresh();
    });
  }

  if (result?.ok) {
    return (
      <Notice tone="success" title={t.admin.credits.freezeLifted}>
        {result.message}
      </Notice>
    );
  }

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Lift sending freeze
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[12.5px] text-body">
        Let this account send again? The debt stays recorded.
      </span>
      <Button size="sm" onClick={clear} disabled={pending}>
        {pending ? "Lifting…" : "Confirm"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </Button>
    </div>
  );
}
