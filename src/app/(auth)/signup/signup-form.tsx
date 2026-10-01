"use client";

import { useActionState, useEffect, useRef } from "react";
import { signupAction, type ActionState } from "@/server/actions/auth";
import { Button, Field, Input, Notice, Textarea } from "@/components/ui";
import { useT } from "@/i18n/client";
import { focusFirstInvalid, keepValuesOnSubmit } from "@/components/form-submit";

export function SignupForm() {
  const t = useT();
  const [state, action, pending] = useActionState<ActionState, FormData>(signupAction, null);
  const err = (field: string) => state?.fieldErrors?.[field];
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.fieldErrors) focusFirstInvalid(formRef.current);
  }, [state]);

  return (
    <form ref={formRef} action={action} onSubmit={keepValuesOnSubmit(action)} className="space-y-4">
      {state?.error ? (
        <Notice tone="danger" title={t.auth.signup.failed}>
          {state.error}
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.auth.signup.yourName} htmlFor="fullName" required error={err("fullName")}>
          <Input id="fullName" name="fullName" required autoComplete="name" />
        </Field>
        <Field label={t.auth.signup.email} htmlFor="email" required error={err("email")}>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </Field>
      </div>

      <Field
        label={t.auth.signup.password}
        htmlFor="password"
        required
        hint={t.auth.signup.passwordHint}
        error={err("password")}
      >
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={12}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.auth.signup.businessName} htmlFor="company" required error={err("company")}>
          <Input id="company" name="company" required />
        </Field>
        <Field
          label={t.auth.signup.registrationNo}
          htmlFor="registrationId"
          required
          error={err("registrationId")}
        >
          <Input id="registrationId" name="registrationId" required />
        </Field>
      </div>

      <Field label={t.auth.signup.address} htmlFor="address" required error={err("address")}>
        <Input id="address" name="address" required autoComplete="street-address" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.auth.signup.industry} htmlFor="industry" required error={err("industry")}>
          <Input id="industry" name="industry" required />
        </Field>
        <Field label={t.auth.signup.website} htmlFor="websiteUrl" error={err("websiteUrl")}>
          <Input id="websiteUrl" name="websiteUrl" placeholder="https://" />
        </Field>
      </div>

      <Field
        label={t.auth.signup.intent}
        htmlFor="intendedUsage"
        required
        hint={t.auth.signup.intentHint}
        error={err("intendedUsage")}
      >
        <Textarea id="intendedUsage" name="intendedUsage" rows={3} required />
      </Field>

      <p className="text-[12.5px] text-muted">
        We do not ask for personal ID scans. Business registration details are used to verify the
        organization only.
      </p>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.auth.signup.submitting : t.auth.signup.submit}
      </Button>
    </form>
  );
}
