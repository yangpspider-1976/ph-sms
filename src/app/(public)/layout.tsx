import Link from "next/link";
import { DemoFooterMark, Wordmark } from "@/components/brand";
import { ButtonLink } from "@/components/ui";
import { getDictionary } from "@/i18n/server";
import { LocaleSwitcher } from "@/components/locale-switcher";

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/bulk", label: "Bulk SMS" },
];

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const t = await getDictionary();
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-8 px-5">
          <Wordmark />
          <nav className="hidden flex-1 items-center justify-center gap-8 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[14px] font-semibold text-body transition-colors hover:text-brand-700"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 md:ml-0">
            <Link
              href="/login"
              className="text-[14px] font-semibold text-ink hover:text-brand-700"
            >
              Log in
            </Link>
            <ButtonLink href="/signup" size="sm" className="px-4 py-2.5">
              Get started
            </ButtonLink>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto max-w-[1240px] px-5 py-10">
          <div className="flex flex-wrap justify-between gap-8">
            <div className="max-w-xs">
              <Wordmark />
              <p className="mt-3 text-[13px] text-muted">
                {t.publicSite.footerBlurb}
              </p>
            </div>
            <FooterColumn
              title={t.publicSite.footerProduct}
              links={[
                { href: "/features", label: t.publicSite.linkFeatures },
                { href: "/how-it-works", label: t.publicSite.linkHowItWorks },
                { href: "/pricing", label: t.publicSite.linkPricing },
                { href: "/bulk", label: t.publicSite.linkBulk },
              ]}
            />
            <FooterColumn
              title={t.publicSite.footerSupport}
              links={[
                { href: "/help", label: t.publicSite.linkHelp },
                { href: "/help#contact", label: t.publicSite.linkContact },
                { href: "/login", label: t.publicSite.linkSignIn },
              ]}
            />
            <FooterColumn
              title={t.publicSite.footerLegal}
              links={[
                { href: "/legal/privacy", label: t.publicSite.linkPrivacy },
                { href: "/legal/terms", label: t.publicSite.linkTerms },
                { href: "/legal/acceptable-use", label: t.publicSite.linkAcceptableUse },
              ]}
            />
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <span className="flex flex-wrap items-center gap-3">
              <DemoFooterMark />
              <LocaleSwitcher />
            </span>
            <p className="text-[12px] text-muted">
              {t.publicSite.footerNote}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <p className="text-[13px] font-bold text-ink">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link href={l.href} className="text-[13px] text-muted hover:text-brand-700">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
