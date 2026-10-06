import { getDictionary } from "@/i18n/server";
import { isMock } from "@/server/env";
import { cx } from "./ui";

/**
 * Persistent demo marker. In MOCK mode nothing here sends an SMS or takes a
 * payment, and the interface says so on every page rather than letting a
 * screenshot be mistaken for a live system.
 *
 * Only in MOCK mode: the line claims no real SMS or payments, which is false
 * the moment a real provider is behind the app. It used to print in every mode.
 *
 * Kept out of brand.tsx because it reads the server dictionary, and brand.tsx
 * is also imported by client components.
 */
export async function DemoFooterMark({ className }: { className?: string }) {
  if (!isMock()) return null;
  const t = await getDictionary();
  return <p className={cx("text-[12px] text-muted", className)}>{t.components.demoMark}</p>;
}
