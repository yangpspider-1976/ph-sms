import Link from "next/link";

export type QuickLink = { href: string; title: string; sub: string };

/**
 * The quick menu and "My rates" pill in the right margin (DESIGN.md, "Header
 * and menus"). Only from 1580px, where the margin beside the 1200px column is
 * wide enough to hold them without covering the page; below that the same
 * places are in the top menu and the phone menu.
 *
 * "My rates" is a native `<details>`, so it opens without any script and its
 * toggle is a real, labelled control.
 */
export function QuickMenu({
  label,
  links,
  rates,
}: {
  label: string;
  links: QuickLink[];
  rates?: { label: string; rows: Array<{ label: string; value: string }> };
}) {
  return (
    <aside aria-label={label} className="fixed right-[60px] top-[110px] z-20 hidden w-[90px] wide:block">
      {rates ? (
        <details className="relative mb-6">
          <summary className="ml-auto flex h-[26px] w-fit cursor-pointer list-none items-center rounded-full bg-brand-600 px-3 text-[13px] whitespace-nowrap text-white shadow-[-3px_1px_16px_rgba(0,0,0,0.15)] hover:bg-brand-700 [&::-webkit-details-marker]:hidden">
            {rates.label}
          </summary>
          <dl className="absolute right-0 top-9 z-10 w-[190px] rounded-[10px] rounded-tr-none bg-white px-4 py-3 shadow-[-3px_-1px_30px_rgba(0,0,0,0.2)]">
            {rates.rows.map((row) => (
              <div key={row.label} className="flex justify-between gap-3 text-[12px] leading-[22px]">
                <dt className="text-muted">{row.label}</dt>
                <dd className="font-bold text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}

      <ul className="rounded-md border-t-[6px] border-brand-400 bg-white px-2.5 shadow-[0_2px_35px_rgba(0,0,0,0.09)]">
        {links.map((link) => (
          <li key={link.href} className="border-b-2 border-[#efefef] last:border-b-0">
            <Link
              href={link.href}
              className="flex h-20 flex-col items-center justify-center text-center text-[13px] leading-5 tracking-[-0.5px] hover:text-brand-700"
            >
              <span className="font-bold text-ink">{link.title}</span>
              <span className="text-muted">{link.sub}</span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
