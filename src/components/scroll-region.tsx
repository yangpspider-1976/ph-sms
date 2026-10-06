"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useT } from "@/i18n/client";

/**
 * A box whose content scrolls, reachable from the keyboard.
 *
 * Someone who cannot use a pointer scrolls with the arrow keys, and those only
 * act on what has focus. A table that runs off the side of its card with
 * nothing focusable in it left that person no way to see the hidden columns.
 *
 * It is a tab stop only while it actually overflows. Most tables fit most of
 * the time, and a stop on each of them would be a dozen extra key presses on
 * every page for nothing.
 */
export function ScrollRegion({ children, ...props }: ComponentProps<"div">) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // A pixel of slack: fractional widths round differently on each side.
    const measure = () =>
      setScrolls(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // The content changing size matters as much as the box doing so.
    for (const child of el.children) observer.observe(child);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={box}
      {...props}
      {...(scrolls
        ? { tabIndex: 0, role: "group", "aria-label": props["aria-label"] ?? t.common.scrollableTable }
        : null)}
    >
      {children}
    </div>
  );
}
