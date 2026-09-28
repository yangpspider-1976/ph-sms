"use client";

import { useActionState } from "react";
import { loginAction, type ActionState } from "@/server/actions/auth";
import { Button, Field, Input, Notice } from "@/components/ui";
import { useT } from "@/i18n/client";

export function LoginForm() {
  const t = useT();
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, null);

  return (
    <form action={action} className="space-y-4">
      {state?.error ? (
        <Notice tone="danger" title={t.auth.login.failed}>
          {state.error}
        </Notice>
      ) : null}

      <Field label={t.auth.login.email} htmlFor="email" error={state?.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder={t.auth.login.emailPlaceholder}
        />
      </Field>

      <Field label={t.auth.login.password} htmlFor="password" error={state?.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.auth.login.submitting : t.auth.login.submit}
      </Button>
    </form>
  );
}
