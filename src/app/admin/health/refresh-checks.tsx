"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useT } from "@/i18n/client";

export function RefreshChecks() {
  const router = useRouter();
  const t = useT();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    }, 30_000);
    return () => clearInterval(timer);
  }, [router]);
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{t.monitoring.refresh}</Button>;
}
