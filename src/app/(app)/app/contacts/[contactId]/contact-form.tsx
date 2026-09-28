"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateContactAction, type ContactResult } from "@/server/actions/groups";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { useT } from "@/i18n/client";

/** Corrects a contact's details. The number is not among them, by design. */
export function ContactForm({
  contactId,
  firstName,
  lastName,
  consentSource,
  tags,
}: {
  contactId: string;
  firstName: string | null;
  lastName: string | null;
  consentSource: string | null;
  tags: string[];
}) {
  const t = useT();

  const [result, setResult] = useState<ContactResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save(formData: FormData) {
    startTransition(async () => {
      const outcome = await updateContactAction(formData);
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  return (
    <Card className="p-5">
      <h2 className="card-title">{t.contacts.detail.editDetails}</h2>

      <form action={save} className="mt-3 space-y-3">
        <input type="hidden" name="contactId" value={contactId} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.contacts.detail.firstName} htmlFor="first-name">
            <Input
              id="first-name"
              name="firstName"
              defaultValue={firstName ?? ""}
              maxLength={120}
            />
          </Field>
          <Field label={t.contacts.detail.lastName} htmlFor="last-name">
            <Input id="last-name" name="lastName" defaultValue={lastName ?? ""} maxLength={120} />
          </Field>
        </div>

        <Field
          label={t.contacts.detail.consentSource}
          htmlFor="consent-source"
          hint={t.contacts.detail.consentSourceHint}
        >
          <Input
            id="consent-source"
            name="consentSource"
            defaultValue={consentSource ?? ""}
            maxLength={300}
          />
        </Field>

        <Field label={t.contacts.detail.tags} htmlFor="tags" hint={t.contacts.detail.tagsHint}>
          <Input id="tags" name="tags" defaultValue={tags.join(", ")} maxLength={600} />
        </Field>

        <Button type="submit" disabled={pending}>
          {pending ? t.common.saving : t.contacts.detail.saveChanges}
        </Button>
      </form>

      {result ? (
        <div className="mt-4">
          <Notice tone={result.ok ? "success" : "danger"} title={result.ok ? t.contacts.detail.saved : t.contacts.detail.notSaved}>
            {result.message}
          </Notice>
        </div>
      ) : null}
    </Card>
  );
}
