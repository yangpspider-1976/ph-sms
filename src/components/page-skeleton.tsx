"use client";

import { useT } from "@/i18n/client";

const ROW_WIDTHS = ["92%", "84%", "88%", "76%", "80%"];

/**
 * What a portal or admin page shows while its data is on the way.
 *
 * Every page here is rendered on request, so without this a click showed
 * nothing at all until the server had answered — up to a couple of seconds
 * when the server had been idle. With a loading state the navigation happens
 * at once (the address bar and the menu update, this outline appears), and the
 * page streams in over it. It is the outline of a page header, a row of stat
 * cards and a table card, in the colours the real ones use, so the content
 * replaces it without the layout jumping.
 */
export function PageSkeleton() {
  const t = useT();

  return (
    <div aria-busy="true" className="motion-safe:animate-pulse">
      <p role="status" className="sr-only">
        {t.common.loading}
      </p>

      <div className="mb-6">
        <div className="h-8 w-64 max-w-full rounded-lg bg-navy-100" />
        <div className="mt-3 h-4 w-96 max-w-full rounded bg-navy-100/70" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card px-4 py-3.5">
            <div className="h-3 w-24 rounded bg-navy-100" />
            <div className="mt-3 h-6 w-20 rounded bg-navy-100" />
          </div>
        ))}
      </div>

      <div className="card mt-5">
        <div className="px-5 py-4">
          <div className="h-4 w-44 rounded bg-navy-100" />
        </div>
        <div className="space-y-4 border-t border-line px-5 py-5">
          {ROW_WIDTHS.map((width) => (
            <div key={width} className="h-4 rounded bg-navy-50" style={{ width }} />
          ))}
        </div>
      </div>
    </div>
  );
}
