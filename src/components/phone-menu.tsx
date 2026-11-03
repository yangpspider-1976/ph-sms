"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./brand";
import { IconMenu, IconX } from "./icons";
import type { MenuSection } from "./top-menu";
import { useT } from "@/i18n/client";

export type MenuShortcut = { href: string; label: string; icon: ReactNode };

/**
 * The menu below the desktop header's width: a menu button that opens a
 * full-screen panel from the left (DESIGN.md, "Phone menu"). From the top: who
 * is signed in, three round shortcuts, every section with its pages, then a
 * grey block for the rest.
 *
 * A native modal `<dialog>`, as MobileNav is: `showModal()` traps focus, makes
 * the page behind it inert, closes on Escape and hands focus back to the menu
 * button.
 *
 * Its contents exist only while it is open. Closed, they would be a hidden
 * second copy of the header's links, the credit and the account name, earlier
 * in the page than the visible ones, which is what a "first match" search
 * (a test's, or a user's find-in-page) then lands on.
 */
export function PhoneMenu({
  homeHref,
  sections,
  shortcuts,
  summary,
  footer,
}: {
  homeHref: string;
  sections: MenuSection[];
  shortcuts: MenuShortcut[];
  /** The account at the top, or a log-in prompt for a visitor. */
  summary?: ReactNode;
  /** Under the sections: settings, legal links, log out. */
  footer?: ReactNode;
}) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Close once a navigation lands, including back and forward.
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  // Shown once its contents have rendered, so focus has somewhere to go.
  useEffect(() => {
    if (!isOpen) return;
    dialog.current?.showModal();
    closeButton.current?.focus();
  }, [isOpen]);

  function close() {
    dialog.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={t.nav.openMenu}
        aria-haspopup="dialog"
        className="flex h-10 w-10 shrink-0 items-center justify-center text-ink hover:bg-navy-50 xl:hidden"
      >
        <IconMenu size={22} />
      </button>

      <dialog
        ref={dialog}
        aria-label={t.nav.menu}
        // Escape, the close button, the backdrop and a navigation all end here.
        onClose={() => setIsOpen(false)}
        // The panel fills the dialog box, so a click on the dialog itself can
        // only be on the backdrop.
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="m-0 h-dvh max-h-none w-full max-w-md flex-col bg-white p-0 open:flex backdrop:bg-black/50 motion-safe:transition-transform motion-safe:duration-200 starting:open:-translate-x-full xl:hidden"
      >
        {isOpen ? (
          <>
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3">
              {/* Closes too when the link points at the page already open. */}
              <div onClick={close}>
                <Wordmark href={homeHref} size={26} />
              </div>
              <button
                ref={closeButton}
                type="button"
                onClick={close}
                aria-label={t.nav.closeMenu}
                className="flex h-10 w-10 shrink-0 items-center justify-center text-ink hover:bg-navy-50"
              >
                <IconX size={22} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {summary ? <div className="px-8 pb-6 pt-4">{summary}</div> : null}

              {shortcuts.length > 0 ? (
                <ul className="grid grid-cols-3 gap-2 border-y border-line px-4 py-6">
                  {shortcuts.map((shortcut) => (
                    <li key={shortcut.href}>
                      <Link
                        href={shortcut.href}
                        onClick={close}
                        className="flex flex-col items-center gap-2.5 py-1 text-center text-[15px] text-ink"
                      >
                        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-ink">
                          {shortcut.icon}
                        </span>
                        {shortcut.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}

              <ul className="px-8 py-2">
                {sections.map((section) => (
                  <li key={section.href} className="border-b border-line py-3.5 last:border-b-0">
                    <Link
                      href={section.href}
                      onClick={close}
                      aria-current={pathname === section.href ? "page" : undefined}
                      className="block py-1 text-[17px] text-ink aria-[current=page]:font-bold aria-[current=page]:text-brand-700"
                    >
                      {section.label}
                    </Link>
                    {section.links.length > 1 ? (
                      <ul className="flex flex-wrap gap-x-5">
                        {section.links.slice(1).map((link) => (
                          <li key={link.href}>
                            <Link
                              href={link.href}
                              onClick={close}
                              aria-current={pathname === link.href ? "page" : undefined}
                              className="block py-1.5 text-[14px] text-muted hover:text-ink aria-[current=page]:text-brand-700"
                            >
                              {link.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>

              {footer ? <div className="bg-band px-8 py-6">{footer}</div> : null}
            </div>
          </>
        ) : null}
      </dialog>
    </>
  );
}
