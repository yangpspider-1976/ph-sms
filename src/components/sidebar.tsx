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
 * Sidebar navigation. `light` is the customer portal (white panel, navy text);
 * `dark` is the separate platform-admin surface, which is deliberately a
 * different colour so an operator always knows which console they are in.
 */
export function SidebarNav({
  items,
  tone,
}: {
  items: NavItem[];
  tone: "light" | "dark";
}) {
  const t = useT();

  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-3" aria-label={t.publicSite.navMain}>
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/app/dashboard" &&
            item.href !== "/admin" &&
            pathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-3 rounded-[9px] px-3.5 py-2.5 text-[14px] font-semibold transition-colors",
              tone === "dark"
                ? active
                  ? "bg-brand-600 text-white"
                  : "text-navy-200 hover:bg-white/8 hover:text-white"
                : active
                  ? "bg-brand-600 text-white"
                  : "text-body hover:bg-navy-50 hover:text-ink",
            )}
          >
            <span className={cx("shrink-0", active ? "text-white" : undefined)}>
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
