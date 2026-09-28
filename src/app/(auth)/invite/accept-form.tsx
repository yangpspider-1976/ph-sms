"use client";

import { useState, useTransition } from "react";
import { acceptInviteAction } from "@/server/actions/team";
import { Button, Field, Input, Notice } from "@/components/ui";
import { useT } from "@/i18n/client";

export function AcceptInviteForm({
  token,
  email,
  needsAccount,
}: {
  token: string;
  email: string;
  needsAccount: boolean;
}) {
  const t = useT();

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      // On success this redirects, so anything returned is a failure.
      const outcome = await acceptInviteAction(formData);
      if (outcome && !outcome.ok) setError(outcome.message);
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {error ? (
        <Notice tone="danger" title={t.invite.couldNotAccept}>
          {error}
        </Notice>
      ) : null}

      <Field label={t.invite.emailLabel} htmlFor="invite-email-display">
        <Input id="invite-email-display" value={email} readOnly disabled />
      </Field>

      {needsAccount ? (
        <>
          <Field label={t.invite.nameLabel} htmlFor="fullName" required>
            <Input id="fullName" name="fullName" required autoComplete="name" />
          </Field>
          <Field
            label={t.invite.passwordLabel}
            htmlFor="password"
            required
            hint={t.invite.passwordHint}
          >
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
            />
          </Field>
          <p className="text-[12.5px] text-muted">
            Accepting this invitation confirms the address, so there is no separate verification
            email.
          </p>
        </>
      ) : (
        <p className="text-[13px] text-body">
          You already have an account for this address. Accepting adds this organization to it.
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
    </form>
  );
}
