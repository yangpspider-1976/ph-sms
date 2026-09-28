"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  isLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from "@/i18n/config";

/**
 * Records a language choice.
 *
 * Open to signed-out visitors as well as customers: the marketing pages and the
 * sign-in screen need a language too, and a preference is not personal data
 * worth gating behind a session.
 */
export async function setLocaleAction(next: string): Promise<{ ok: boolean }> {
  if (!isLocale(next)) return { ok: false };

  const store = await cookies();
  store.set(LOCALE_COOKIE, next satisfies Locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    // Readable by the client switcher; a language preference is not a secret,
    // and marking it httpOnly would only mean sending it twice.
    httpOnly: false,
  });

  // Every rendered page contains translated text, so the whole tree is stale.
  revalidatePath("/", "layout");
  return { ok: true };
}
