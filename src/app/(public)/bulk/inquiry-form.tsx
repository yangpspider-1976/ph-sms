"use client";

import { useState, useTransition } from "react";
import { submitInquiryAction, type InquiryResult } from "@/server/actions/inquiries";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { useT } from "@/i18n/client";

export function InquiryForm() {
  const t = useT();

  const [result, setResult] = useState<InquiryResult | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      setResult(await submitInquiryAction(formData));
    });
  }

  const err = (field: string) =>
    result && !result.ok ? result.fieldErrors?.[field] : undefined;

  if (result?.ok) {
    return (
      <Notice tone="success" title={t.bulk.received}>
        {result.message}
      </Notice>
    );
  }

  return (
    <form action={submit} className="space-y-4">
      <h2 className="card-title">{t.bulk.formTitle}</h2>

      {result && !result.ok && !result.fieldErrors ? (
        <Notice tone="danger" title={t.bulk.couldNotSubmit}>
          {result.message}
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.bulk.businessName} htmlFor="company" required error={err("company")}>
          <Input id="company" name="company" required />
        </Field>
        <Field label={t.bulk.contactName} htmlFor="contactName" required error={err("contactName")}>
          <Input id="contactName" name="contactName" required />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.bulk.email} htmlFor="contactEmail" required error={err("contactEmail")}>
          <Input id="contactEmail" name="contactEmail" type="email" required />
        </Field>
        <Field label={t.bulk.phone} htmlFor="contactPhone" error={err("contactPhone")}>
          <Input id="contactPhone" name="contactPhone" placeholder="+63 2 8000 0000" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label={t.bulk.volume}
          htmlFor="estimatedVolume"
          required
          error={err("estimatedVolume")}
        >
          <Input id="estimatedVolume" name="estimatedVolume" type="number" min={1} required />
        </Field>
        <Field label={t.bulk.frequency} htmlFor="frequency" required error={err("frequency")}>
          <Input id="frequency" name="frequency" placeholder={t.bulk.frequencyPlaceholder} required />
        </Field>
        <Field label={t.bulk.preferredStart} htmlFor="preferredDate" error={err("preferredDate")}>
          <Input id="preferredDate" name="preferredDate" placeholder={t.bulk.preferredStartPlaceholder} />
        </Field>
      </div>

      <Field label={t.bulk.purpose} htmlFor="purpose" required error={err("purpose")}>
        <Select id="purpose" name="purpose" defaultValue="INFORMATIONAL">
          <option value="INFORMATIONAL">{t.bulk.purposeInformational}</option>
          <option value="PROMOTIONAL">{t.bulk.purposePromotional}</option>
        </Select>
      </Field>

      <Field
        label={t.bulk.audience}
        htmlFor="audience"
        required
        error={err("audience")}
      >
        <Textarea id="audience" name="audience" rows={2} required />
      </Field>

      <Field
        label={t.bulk.consentSource}
        htmlFor="consentSource"
        required
        hint={t.bulk.consentSourceHint}
        error={err("consentSource")}
      >
        <Input id="consentSource" name="consentSource" required />
      </Field>

      <Field
        label={t.bulk.sampleMessage}
        htmlFor="sampleMessage"
        required
        hint={t.bulk.sampleMessageHint}
        error={err("sampleMessage")}
      >
        <Textarea id="sampleMessage" name="sampleMessage" rows={3} required />
      </Field>

      <Field
        label={t.bulk.senderNeeds}
        htmlFor="senderNeeds"
        hint={t.bulk.senderNeedsHint}
        error={err("senderNeeds")}
      >
        <Input id="senderNeeds" name="senderNeeds" placeholder="YOURBRAND" />
      </Field>

      {/* Honeypot: hidden from people, tempting to bots. */}
      <div aria-hidden="true" className="absolute left-[-9999px]">
        <label htmlFor="website">{t.bulk.honeypot}</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <p className="text-[12.5px] text-muted">
        Do not attach or paste a recipient list. We only need the details above to quote.
      </p>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Request a quote"}
      </Button>
    </form>
  );
}
