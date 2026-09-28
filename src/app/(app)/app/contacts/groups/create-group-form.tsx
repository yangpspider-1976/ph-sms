"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGroupAction, type GroupResult } from "@/server/actions/groups";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { useT } from "@/i18n/client";

export function CreateGroupForm() {
  const t = useT();

  const [result, setResult] = useState<GroupResult | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function submit(formData: FormData) {
    startTransition(async () => {
      const outcome = await createGroupAction(formData);
      setResult(outcome);
      if (outcome.ok) {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  return (
    <Card className="p-5">
      <h2 className="card-title">{t.groups.newGroup}</h2>
      <form ref={formRef} action={submit} className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] sm:items-end">
        <Field label={t.common.name} htmlFor="group-name">
          <Input id="group-name" name="name" required maxLength={80} placeholder={t.groups.namePlaceholder} />
        </Field>
        <Field label={t.common.description} htmlFor="group-description" hint={t.common.optional}>
          <Input
            id="group-description"
            name="description"
            maxLength={300}
            placeholder={t.groups.descriptionPlaceholder}
          />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? t.groups.creating : t.groups.create}
        </Button>
      </form>

      {result ? (
        <div className="mt-4">
          <Notice tone={result.ok ? "success" : "danger"} title={result.ok ? t.groups.created : t.groups.notCreated}>
            {result.message}
          </Notice>
        </div>
      ) : null}
    </Card>
  );
}
