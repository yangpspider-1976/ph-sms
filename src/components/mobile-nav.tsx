"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Wordmark } from "./brand";
import { IconMenu, IconX } from "./icons";
import { SidebarNav, type NavItem } from "./sidebar";
import { cx } from "./ui";
import { useT } from "@/i18n/client";

/**
 * The sidebar's navigation below the `lg` breakpoint, where the sidebar itself
 * is hidden: a menu button in the header that opens it as a drawer.
 *
 * A native modal `<dialog>` rather than a hand-built overlay. `showModal()`
 * traps focus, makes the page behind it inert, closes on Escape and hands focus
 * back to the menu button — each of which a custom drawer has to re-implement
 * and usually gets slightly wrong.
 */
export function MobileNav({
  items,
  tone,
  homeHref,
  subtitle,
  footer,
}: {
  items: NavItem[];
  tone: "light" | "dark";
  homeHref: string;
  subtitle?: string;
  /** Extra controls pinned to the bottom of the drawer. */
  footer?: ReactNode;
}) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const dark = tone === "dark";

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
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink hover:bg-navy-50 lg:hidden"
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
        className={cx(
          "m-0 h-dvh max-h-none w-[280px] max-w-[85vw] flex-col p-0 open:flex lg:hidden",
          "backdrop:bg-[rgb(10_24_48/0.5)] motion-safe:transition-transform motion-safe:duration-200 starting:open:-translate-x-full",
          dark ? "bg-navy-900" : "border-r border-line bg-white",
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4">
          {/* Closes too when the link points at the page already open. */}
          <div onClick={close}>
            <Wordmark href={homeHref} subtitle={subtitle} onDark={dark} />
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={close}
            aria-label={t.nav.closeMenu}
            className={cx(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              dark ? "text-navy-200 hover:bg-white/10 hover:text-white" : "text-muted hover:bg-navy-50",
            )}
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <SidebarNav items={items} tone={tone} onNavigate={close} />
        </div>

        {footer ? (
          <div className={cx("shrink-0 border-t px-5 py-4", dark ? "border-white/8" : "border-line")}>
            {footer}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
