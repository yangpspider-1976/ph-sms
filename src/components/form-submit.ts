"use client";

import { startTransition, type FormEvent } from "react";

/**
 * `onSubmit` handler that runs a form's action without React's automatic reset.
 *
 * React clears every uncontrolled field once a `<form action>` function
 * returns, whether or not it worked — so "check the highlighted field" came
 * back to an empty form and the person had to type everything again. When
 * onSubmit prevents the default, React neither dispatches the action nor
 * resets the form; this dispatches it instead, inside a transition so pending
 * states and useFormStatus still work.
 *
 * Keep `action` on the form too. Before hydration it is what stops a native
 * GET from putting the fields — passwords included — into the URL.
 *
 * A form that should clear after a successful save calls `form.reset()`.
 */
export function keepValuesOnSubmit(
  action: (formData: FormData, form: HTMLFormElement) => unknown,
) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    // The submitter carries the clicked button's name and value, as a native
    // submission would.
    const formData = new FormData(form, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => {
      action(formData, form);
    });
  };
}

/**
 * Moves focus to the first field `Field` has marked invalid. On a long form the
 * problem is often far above the submit button; focusing it scrolls it into
 * view and has a screen reader read its error.
 */
export function focusFirstInvalid(form: HTMLFormElement | null) {
  form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}
