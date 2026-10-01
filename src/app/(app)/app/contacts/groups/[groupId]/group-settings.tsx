"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteGroupAction,
  renameGroupAction,
  type GroupResult,
} from "@/server/actions/groups";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { useT } from "@/i18n/client";
import { keepValuesOnSubmit } from "@/components/form-submit";

export function GroupSettings({
  groupId,
  name,
  description,
}: {
  groupId: string;
  name: string;
  description: string | null;
}) {
  const t = useT();

  const [result, setResult] = useState<GroupResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save(formData: FormData) {
    startTransition(async () => {
      const outcome = await renameGroupAction(formData);
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const outcome = await deleteGroupAction(groupId);
      setResult(outcome);
      if (outcome.ok) router.push("/app/contacts/groups");
    });
  }

  return (
    <Card className="p-5">
      <h2 className="card-title">{t.groups.settingsTitle}</h2>

      <form action={save} onSubmit={keepValuesOnSubmit(save)} className="mt-3 space-y-3">
        <input type="hidden" name="groupId" value={groupId} />
        <Field label={t.common.name} htmlFor="settings-name">
          <Input id="settings-name" name="name" defaultValue={name} required maxLength={80} />
        </Field>
        <Field label={t.common.description} htmlFor="settings-description" hint={t.common.optional}>
          <Input
            id="settings-description"
            name="description"
            defaultValue={description ?? ""}
            maxLength={300}
          />
        </Field>
        <Button type="submit" variant="ghost" disabled={pending}>
          {pending ? t.common.saving : t.common.save}
        </Button>
      </form>

      <div className="mt-5 border-t border-line pt-4">
        {confirming ? (
          <div className="space-y-2.5">
            <p className="text-[13px] text-ink">
              {t.groups.deleteConfirm}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={remove} disabled={pending}>
                {pending ? t.groups.deleting : t.groups.deleteGroup}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
                {t.groups.keepIt}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirming(true)} disabled={pending}>
            {t.groups.deleteGroup}
          </Button>
        )}
      </div>

      {result ? (
        <div className="mt-4">
          <Notice tone={result.ok ? "success" : "danger"} title={result.ok ? t.groups.done : t.groups.notDone}>
            {result.message}
          </Notice>
        </div>
      ) : null}
    </Card>
  );
}
