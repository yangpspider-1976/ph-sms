"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveTemplateAction } from "@/server/actions/templates";
import { Button, Notice } from "@/components/ui";
import { useServerText, useT } from "@/i18n/client";

/**
 * Removes a template, after a second click. On success the template simply
 * leaves the list, so only a failure is reported.
 */
export function RemoveTemplate({ templateId }: { templateId: string }) {
  const t = useT();
  const localizeServerText = useServerText();

  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function remove() {
    startTransition(async () => {
      const outcome = await archiveTemplateAction(templateId);
      if (outcome.ok) {
        router.refresh();
      } else {
        setConfirming(false);
        setFailure(outcome.message);
      }
    });
  }

  return (
    <div className="mt-3">
      {confirming ? (
        <div className="space-y-2.5">
          <p className="text-[13px] text-ink">{t.templates.removeConfirm}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
              {pending ? t.templates.removing : t.templates.removeTemplate}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
              {t.templates.keepIt}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setFailure(null);
            setConfirming(true);
          }}
        >
          {t.templates.remove}
        </Button>
      )}

      {failure ? (
        <div className="mt-3">
          <Notice tone="danger" title={t.templates.notRemoved}>
            {localizeServerText(failure)}
          </Notice>
        </div>
      ) : null}
    </div>
  );
}
