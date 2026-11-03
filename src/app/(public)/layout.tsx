import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { DemoFooterMark } from "@/components/demo-mark";
import { PhoneMenu } from "@/components/phone-menu";
import { QuickMenu } from "@/components/quick-menu";
import { ButtonLink } from "@/components/ui";
import { IconCard, IconChat, IconSend } from "@/components/icons";
import { getDictionary } from "@/i18n/server";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const t = await getDictionary();
  const nav = [
    { href: "/features", label: t.publicSite.linkFeatures },
    { href: "/how-it-works", label: t.publicSite.linkHowItWorks },
    { href: "/pricing", label: t.publicSite.linkPricing },
    { href: "/bulk", label: t.publicSite.linkBulk },
  ];
  const legal = [
    { href: "/legal/privacy", label: t.publicSite.linkPrivacy },
    { href: "/legal/terms", label: t.publicSite.linkTerms },
    { href: "/legal/acceptable-use", label: t.publicSite.linkAcceptableUse },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="relative z-30 border-b border-line-strong bg-white">
        <div className="flex h-14 items-center gap-4 px-5 xl:h-[90px] xl:gap-6 xl:px-10">
          <Wordmark size={28} />

          <nav aria-label={t.publicSite.navMain} className="hidden h-full flex-1 justify-center xl:flex">
            <ul className="flex h-full">
              {nav.map((item) => (
                <li
                  key={item.href}
                  className="relative flex h-full items-center after:absolute after:right-0 after:top-1/2 after:h-[15px] after:w-px after:-translate-y-1/2 after:bg-line-strong last:after:hidden"
                >
                  <Link
                    href={item.href}
                    className="flex h-full items-center px-8 text-[16px] whitespace-nowrap text-ink transition-colors hover:text-brand-700"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* One language switcher for every width; see the portal layout. */}
          <div className="ml-auto flex items-center gap-2 xl:ml-0 xl:flex-col xl:items-end xl:gap-2">
            <div className="flex items-center gap-3">
              <ul className="hidden items-center text-[12px] text-muted xl:flex">
                <li className="relative pr-3 after:absolute after:right-0 after:top-1/2 after:h-2.5 after:w-px after:-translate-y-1/2 after:bg-navy-300">
                  <Link href="/signup" className="-my-1 py-1 hover:text-ink">
                    {t.publicSite.getStarted}
                  </Link>
                </li>
                <li className="pl-3">
                  <Link href="/help" className="-my-1 py-1 hover:text-ink">
                    {t.publicSite.linkHelp}
                  </Link>
                </li>
              </ul>
              <LocaleSwitcher />
              <PhoneMenu
                homeHref="/"
                sections={[
                  ...nav.map((item) => ({ ...item, links: [item] })),
                  { href: "/help", label: t.publicSite.linkHelp, links: [] },
                ]}
                shortcuts={[
                  { href: "/app/send", label: t.nav.send, icon: <IconSend size={22} /> },
                  { href: "/pricing", label: t.publicSite.linkPricing, icon: <IconCard size={22} /> },
                  { href: "/bulk", label: t.publicSite.linkBulk, icon: <IconChat size={22} /> },
                ]}
                summary={
                  <div>
                    <Link href="/login" className="inline-flex items-center gap-1.5 text-[20px] font-bold text-ink">
                      {t.nav.logInToContinue} <span aria-hidden="true">›</span>
                    </Link>
                    <p className="mt-4 flex gap-5 text-[14px]">
                      <Link href="/signup" className="text-brand-700">
                        {t.publicSite.getStarted}
                      </Link>
                      <Link href="/help" className="text-muted hover:text-ink">
                        {t.publicSite.linkHelp}
                      </Link>
                    </p>
                  </div>
                }
                footer={
                  <p className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
                    {legal.map((link) => (
                      <Link key={link.href} href={link.href} className="text-muted hover:text-ink">
                        {link.label}
                      </Link>
                    ))}
                  </p>
                }
              />
            </div>
            {/* Hidden by its wrapper: on the button itself, `hidden` would
                compete with the button's own display class. */}
            <span className="hidden xl:block">
              <ButtonLink href="/login" size="sm" className="min-h-7! px-5">
                {t.publicSite.logIn}
              </ButtonLink>
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-band">
        <div className="mx-auto flex max-w-[1280px] flex-wrap justify-between gap-10 px-5 pb-10 pt-12 md:px-10">
          <div className="max-w-xl">
            <Wordmark size={26} />
            <p className="mt-4 text-[12px] leading-[22px] text-muted">
              {t.publicSite.footerBlurb}
              <br />
              {t.publicSite.footerNote}
            </p>
            {/* The gap between links is their own padding, so each is a
                tap target rather than a word with dead space around it. */}
            <ul className="mt-4 flex flex-wrap text-[12px]">
              {[...nav, ...legal].map((link) => (
                <li
                  key={link.href}
                  className="relative pr-4 after:absolute after:right-2 after:top-1/2 after:h-2.5 after:w-px after:-translate-y-1/2 after:bg-navy-300 last:after:hidden"
                >
                  <Link href={link.href} className="block py-1 text-ink hover:text-brand-700">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <DemoFooterMark className="mt-3" />
          </div>

          <div className="w-full max-w-[260px]">
            <p className="text-[15px] font-bold text-brand-700">{t.helpCentre.title}</p>
            <p className="mt-2 text-[12px] leading-5 text-muted">{t.helpCentre.subheading}</p>
            <div className="mt-5 grid grid-cols-2 gap-1.5">
              <Link
                href="/help#contact"
                className="flex min-h-10 items-center justify-center rounded-[5px] bg-brand-600 px-2 text-center text-[13px] text-white hover:bg-brand-700"
              >
                {t.publicSite.linkContact}
              </Link>
              <Link
                href="/help"
                className="flex min-h-10 items-center justify-center rounded-[5px] bg-black px-2 text-center text-[13px] text-white hover:bg-navy-900"
              >
                {t.publicSite.linkHelp}
              </Link>
            </div>
          </div>
        </div>
        <p className="flex min-h-10 items-center justify-center bg-copyright px-5 text-center text-[13px] text-white">
          {t.components.copyright(new Date().getFullYear())}
        </p>
      </footer>

      {/* Last in the page; see the portal layout. */}
      <QuickMenu
        label={t.nav.quickMenu}
        links={[
          { href: "/how-it-works", title: t.nav.quick.guideTitle, sub: t.nav.quick.guideSub },
          { href: "/pricing", title: t.nav.quick.pricingTitle, sub: t.nav.quick.pricingSub },
          { href: "/bulk", title: t.nav.quick.bulkTitle, sub: t.nav.quick.bulkSub },
          { href: "/help", title: t.nav.quick.helpTitle, sub: t.nav.quick.helpSub },
        ]}
      />
    </div>
  );
}
