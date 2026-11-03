"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export type MenuLink = { href: string; label: string };

/** A top-menu item and the pages listed under it in the panel. */
export type MenuSection = MenuLink & { links: MenuLink[] };

/** The panel's padding above and below its links, and the height of one link. */
const PANEL_PADDING = 60;
const PANEL_LINK = 42;

/**
 * The desktop top menu: one link per section, and a full-width panel that
 * lists every page under its section (DESIGN.md, "Header and menus").
 *
 * The panel opens while the pointer is over the menu or keyboard focus is in
 * it, and closes on Escape or when focus leaves; it is plain lists of links,
 * not an ARIA menu. Each section link goes to the section's first page, so a
 * touch screen, which has no hover, still gets everywhere.
 *
 * Closed, the lists are `invisible` rather than transparent, so their links are
 * out of the tab order and the accessibility tree until the panel shows.
 */
export function TopMenu({ sections, label }: { sections: MenuSection[]; label: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const inSection = (section: MenuSection) =>
    section.links.some((link) => pathname === link.href || pathname.startsWith(`${link.href}/`));
  const longest = Math.max(...sections.map((section) => section.links.length));

  return (
    <nav
      aria-label={label}
      className="hidden h-full xl:flex xl:flex-1 xl:justify-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={(e) => {
        // Only focus arriving from outside opens it; moving within leaves it as it is.
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        setOpen(false);
        // A focused panel link is about to be hidden: hand focus to its section.
        (e.target as HTMLElement)
          .closest("[data-section]")
          ?.querySelector<HTMLAnchorElement>("a")
          ?.focus();
      }}
    >
      <ul className="flex h-full">
        {sections.map((section) => {
          const current = inSection(section);
          return (
            <li
              key={section.href}
              data-section
              className="relative flex h-full items-center after:absolute after:right-0 after:top-1/2 after:h-[15px] after:w-px after:-translate-y-1/2 after:bg-line-strong last:after:hidden"
            >
              <Link
                href={section.href}
                aria-current={pathname === section.href ? "page" : current ? "true" : undefined}
                onClick={() => setOpen(false)}
                className={cx(
                  "flex h-full items-center px-4 text-[15px] whitespace-nowrap transition-colors hover:text-brand-700 2xl:px-7 2xl:text-[16px]",
                  current ? "font-bold text-brand-700" : "text-ink",
                )}
              >
                {section.label}
              </Link>

              <ul
                className={cx(
                  "absolute left-1/2 top-full z-50 -translate-x-1/2 pb-10 pt-5",
                  open ? "visible" : "invisible",
                )}
              >
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={pathname === link.href ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={cx(
                        "block rounded-full px-5 text-center text-[15px] leading-[42px] tracking-[-0.5px] whitespace-nowrap transition-colors hover:bg-navy-50 hover:text-ink focus-visible:bg-navy-50 focus-visible:text-ink",
                        pathname === link.href ? "text-brand-700" : "text-muted",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      {/* The panel itself: full width under the header, as tall as the longest list. */}
      <div
        aria-hidden="true"
        className={cx(
          "absolute inset-x-0 top-full z-40 border-b border-line bg-white/98 shadow-[-9px_17px_16px_rgba(77,77,77,0.09)]",
          open ? "block" : "hidden",
        )}
        style={{ height: PANEL_PADDING + longest * PANEL_LINK }}
      />
    </nav>
  );
}
