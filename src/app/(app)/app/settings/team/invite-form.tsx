"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteMemberAction, type TeamResult } from "@/server/actions/team";
import { Button, Field, FormCard, Input, Notice, Select } from "@/components/ui";
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
    <FormCard title={t.settings.team.inviteTitle} description={t.settings.team.inviteIntro}>
      <form action={submit} onSubmit={keepValuesOnSubmit(submit)} className="space-y-4">
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
          <Notice
            tone={result.ok ? "success" : "danger"}
            title={result.ok ? t.settings.team.inviteSent : t.settings.team.inviteNotSent}
          >
            {result.message}
          </Notice>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? t.settings.team.sendingInvite : t.settings.team.sendInvite}
        </Button>
      </form>
    </FormCard>
  );
}
