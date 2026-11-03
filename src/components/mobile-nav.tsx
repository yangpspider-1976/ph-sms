"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Wordmark } from "./brand";
import { IconMenu, IconX } from "./icons";
import { SidebarNav, type NavItem } from "./sidebar";
import { useT } from "@/i18n/client";

/**
 * The admin sidebar's navigation below the `lg` breakpoint, where the sidebar
 * itself is hidden: a menu button in the header that opens it as a drawer.
 *
 * A native modal `<dialog>` rather than a hand-built overlay. `showModal()`
 * traps focus, makes the page behind it inert, closes on Escape and hands focus
 * back to the menu button — each of which a custom drawer has to re-implement
 * and usually gets slightly wrong.
 */
export function MobileNav({
  items,
  homeHref,
  subtitle,
  footer,
}: {
  items: NavItem[];
  homeHref: string;
  subtitle?: string;
  /** Extra controls pinned to the bottom of the drawer. */
  footer?: ReactNode;
}) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // Close once a navigation lands, including back and forward.
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  function open() {
    dialog.current?.showModal();
    closeButton.current?.focus();
  }

  function close() {
    dialog.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={t.nav.openMenu}
        aria-haspopup="dialog"
        className="flex h-9 w-9 shrink-0 items-center justify-center border border-line-strong text-ink hover:bg-navy-50 lg:hidden"
      >
        <IconMenu size={18} />
      </button>

      <dialog
        ref={dialog}
        aria-label={t.nav.menu}
        // The drawer fills the dialog box, so a click that lands on the dialog
        // itself can only be on the backdrop.
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="m-0 h-dvh max-h-none w-[280px] max-w-[85vw] flex-col bg-navy-800 p-0 open:flex backdrop:bg-black/50 motion-safe:transition-transform motion-safe:duration-200 starting:open:-translate-x-full lg:hidden"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4">
          {/* Closes too when the link points at the page already open. */}
          <div onClick={close}>
            <Wordmark href={homeHref} subtitle={subtitle} onDark />
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={close}
            aria-label={t.nav.closeMenu}
            className="flex h-9 w-9 shrink-0 items-center justify-center text-navy-200 hover:bg-white/10 hover:text-white"
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <SidebarNav items={items} onNavigate={close} />
        </div>

        {footer ? <div className="shrink-0 border-t border-white/8 px-5 py-4">{footer}</div> : null}
      </dialog>
    </>
  );
}
