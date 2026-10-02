"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeDemoPaymentAction } from "@/server/actions/billing";
import { Button, Notice } from "@/components/ui";
import { useT } from "@/i18n/client";

export function DemoPayButton({ reference }: { reference: string }) {
  const t = useT();

  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function pay() {
    startTransition(async () => {
      const outcome = await completeDemoPaymentAction(reference);
      setResult(outcome);
      if (outcome.ok) {
        router.refresh();
        router.push("/app/credits");
      }
    });
  }

  return (
    <div className="space-y-3">
      {result && !result.ok ? (
        <Notice tone="danger" title={t.credits.paymentNotAccepted}>
          {result.message}
        </Notice>
      ) : null}
      <Button onClick={pay} disabled={pending}>
        {pending ? t.credits.completing : t.credits.completePayment}
      </Button>
    </div>
  );
}
