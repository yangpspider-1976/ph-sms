"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocaleAction } from "@/server/actions/locale";
import { LOCALES, LOCALE_NAMES } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/client";

/**
 * Language switcher.
 *
 * A plain `<select>`: it is one control, it is reachable by keyboard without
 * any work, and on a phone it opens the platform's own picker rather than a
 * custom menu that has to re-learn what the platform already does well.
 */
export function LocaleSwitcher({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { locale } = useLocale();
  const t = useT();
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function change(next: string) {
    startTransition(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  }

  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="sr-only">{t.locale.switcherLabel}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        aria-label={t.locale.switcherLabel}
        className={
          tone === "dark"
            ? "rounded-lg border border-white/20 bg-transparent px-2 py-1 text-[12.5px] font-semibold text-white/90 hover:bg-white/10"
            : "rounded-lg border border-line bg-white px-2 py-1 text-[12.5px] font-semibold text-ink hover:bg-navy-50"
        }
      >
        {LOCALES.map((option) => (
          <option key={option} value={option} className="text-ink">
            {LOCALE_NAMES[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
