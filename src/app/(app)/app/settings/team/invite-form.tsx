"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteMemberAction, type TeamResult } from "@/server/actions/team";
import { Button, Card, Field, Input, Notice, Select } from "@/components/ui";
import { ROLE_ORDER } from "@/server/auth/rbac";
import { useT } from "@/i18n/client";
import { keepValuesOnSubmit } from "@/components/form-submit";

export function InviteForm() {
  const t = useT();

  const [result, setResult] = useState<TeamResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(formData: FormData, form?: HTMLFormElement) {
    startTransition(async () => {
      const outcome = await inviteMemberAction(formData);
      setResult(outcome);
      if (outcome.ok) {
        form?.reset();
        router.refresh();
      }
    });
  }

  return (
    <Card className="max-w-2xl p-5">
      <h2 className="card-title">{t.settings.team.inviteTitle}</h2>
      <p className="mt-1 text-[13px] text-muted">
        The invitation is tied to this email address and this role. Forwarding the link does not
        let someone else use it.
      </p>

      <form action={submit} onSubmit={keepValuesOnSubmit(submit)} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,200px)]">
          <Field label={t.settings.team.emailLabel} htmlFor="invite-email" required>
            <Input id="invite-email" name="email" type="email" required placeholder={t.settings.team.emailPlaceholder} />
          </Field>
          <Field label={t.settings.team.roleLabel} htmlFor="invite-role" required>
            <Select id="invite-role" name="role" defaultValue="SENDER">
              {ROLE_ORDER.map((role) => (
                <option key={role} value={role}>
                  {t.roles.labels[role]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {result ? (
          <Notice tone={result.ok ? "success" : "danger"} title={result.ok ? "Invitation sent" : "Not sent"}>
            {result.message}
          </Notice>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send invitation"}
        </Button>
      </form>
    </Card>
  );
}
