import { getDictionary } from "@/i18n/server";
import { cx } from "./ui";

/**
 * Persistent demo marker. In MOCK mode nothing here sends an SMS or takes a
 * payment, and the interface says so on every page rather than letting a
 * screenshot be mistaken for a live system.
 *
 * Kept out of brand.tsx because it reads the server dictionary, and brand.tsx
 * is also imported by client components.
 */
export async function DemoFooterMark({ className }: { className?: string }) {
  const t = await getDictionary();
  return <p className={cx("text-[12px] text-muted", className)}>{t.components.demoMark}</p>;
}
