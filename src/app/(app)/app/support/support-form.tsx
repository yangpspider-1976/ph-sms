"use client";

import { useRef, useState, useTransition } from "react";
import {
  submitSupportRequestAction,
  type SupportResult,
} from "@/server/actions/support";
import { Button, Card, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { useT } from "@/i18n/client";
import { keepValuesOnSubmit } from "@/components/form-submit";

/**
 * Support request.
 *
 * The reference in the success notice is the same one written to the audit log,
 * so quoting it lets support find the request and everything around it rather
 * than asking the customer to describe it again.
 */
export function SupportForm() {
  const t = useT();
  const [result, setResult] = useState<SupportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function submit(formData: FormData) {
    startTransition(async () => {
      const outcome = await submitSupportRequestAction(formData);
      setResult(outcome);
      if (outcome.ok) formRef.current?.reset();
    });
  }

  return (
    <Card className="p-5">
      <h2 className="card-title">{t.supportPage.formTitle}</h2>
      <p className="mt-1 text-[12.5px] leading-snug text-muted">{t.supportPage.formIntro}</p>

      {result ? (
        <div className="mt-4">
          <Notice
            tone={result.ok ? "success" : "danger"}
            title={result.ok ? t.supportPage.sent : t.supportPage.notSent}
          >
            {result.message}
          </Notice>
        </div>
      ) : null}

      <form ref={formRef} action={submit} onSubmit={keepValuesOnSubmit(submit)} className="mt-4 space-y-3">
        <Field label={t.supportPage.subject} htmlFor="support-subject">
          <Input
            id="support-subject"
            name="subject"
            required
            minLength={3}
            maxLength={200}
            placeholder={t.supportPage.subjectPlaceholder}
          />
        </Field>

        <Field label={t.supportPage.category} htmlFor="support-category">
          <Select id="support-category" name="category" defaultValue="DELIVERY">
            <option value="DELIVERY">{t.supportPage.categoryDelivery}</option>
            <option value="BILLING">{t.supportPage.categoryBilling}</option>
            <option value="ACCOUNT">{t.supportPage.categoryAccount}</option>
            <option value="SENDER_ID">{t.supportPage.categorySenderId}</option>
            <option value="OTHER">{t.supportPage.categoryOther}</option>
          </Select>
        </Field>

        <Field
          label={t.supportPage.relatedRef}
          htmlFor="support-ref"
          hint={t.supportPage.relatedRefHint}
        >
          <Input id="support-ref" name="relatedRef" maxLength={100} />
        </Field>

        <Field label={t.supportPage.detail} htmlFor="support-detail" hint={t.supportPage.detailHint}>
          <Textarea
            id="support-detail"
            name="detail"
            rows={5}
            required
            minLength={20}
            maxLength={4000}
          />
        </Field>

        <Button type="submit" disabled={pending}>
          {pending ? t.supportPage.submitting : t.supportPage.submit}
        </Button>
      </form>
    </Card>
  );
}
