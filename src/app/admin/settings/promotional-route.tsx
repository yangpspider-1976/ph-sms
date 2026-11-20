"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPromotionalRouteAction, type ConfigActionResult } from "@/server/actions/app-config";
import { Button, Card, CardHeader, Notice } from "@/components/ui";
import { useServerText, useT } from "@/i18n/client";
import { keepValuesOnSubmit } from "@/components/form-submit";

/**
 * Which route a promotional campaign takes: the bulk quote (the default, as
 * the client's request has it), or normal sending to contacts with recorded
 * consent. The original request makes this an admin setting.
 */
export function PromotionalRoute({ selfService }: { selfService: boolean }) {
  const t = useT();
  const localizeServerText = useServerText();
  const copy = t.adminPromotional;

  const [result, setResult] = useState<ConfigActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save(formData: FormData) {
    startTransition(async () => {
      const outcome = await setPromotionalRouteAction(formData);
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  const options = [
    { value: "INQUIRY", label: copy.inquiry, hint: copy.inquiryHint, checked: !selfService },
    { value: "SELF_SERVICE", label: copy.selfService, hint: copy.selfServiceHint, checked: selfService },
  ];

  return (
    <Card>
      <CardHeader title={copy.title} description={copy.description} />
      <form action={save} onSubmit={keepValuesOnSubmit(save)} className="space-y-3 px-5 pb-5">
        <fieldset className="space-y-2">
          <legend className="sr-only">{copy.title}</legend>
          {options.map((option) => (
            <label key={option.value} className="flex items-start gap-2.5 text-[13px] text-body">
              <input
                type="radio"
                name="route"
                value={option.value}
                defaultChecked={option.checked}
                className="mt-0.5 shrink-0"
              />
              <span>
                <span className="font-semibold text-ink">{option.label}</span>
                <span className="mt-0.5 block text-[12.5px] text-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? t.common.saving : copy.save}
        </Button>

        {result ? (
          <Notice
            tone={result.ok ? "success" : "danger"}
            title={result.ok ? t.adminExtra.updated : t.adminExtra.notUpdated}
          >
            {localizeServerText(result.message)}
          </Notice>
        ) : null}
      </form>
    </Card>
  );
}
