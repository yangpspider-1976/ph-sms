"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "./ui";
import { useT } from "@/i18n/client";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

/**
 * The admin console's sidebar navigation, on slate navy. The customer portal
 * has a top menu instead (TopMenu), so an operator always knows which console
 * they are in.
 */
export function SidebarNav({
  items,
  onNavigate,
}: {
  items: NavItem[];
  /** Called when a link is chosen, including the current page's own link. */
  onNavigate?: () => void;
}) {
  const t = useT();

  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label={t.publicSite.navMain}>
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cx(
              "flex items-center gap-3 px-3.5 py-2.5 text-[14px] transition-colors",
              active ? "bg-brand-600 font-bold text-white" : "text-navy-200 hover:bg-white/8 hover:text-white",
            )}
          >
            <span className="shrink-0">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
