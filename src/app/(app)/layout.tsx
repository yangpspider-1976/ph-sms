import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { DemoFooterMark } from "@/components/demo-mark";
import { TopMenu, type MenuSection } from "@/components/top-menu";
import { PhoneMenu, type MenuShortcut } from "@/components/phone-menu";
import { QuickMenu } from "@/components/quick-menu";
import { Pill } from "@/components/ui";
import { IconCard, IconMegaphone, IconSend } from "@/components/icons";
import { requireOrgContext } from "@/server/auth/context";
import { getEffectiveConfig } from "@/server/domain/app-config";
import { getWallet } from "@/server/domain/wallet";
import { formatCentavos } from "@/server/config";
import { env } from "@/server/env";
import { dispatchDueOnVisit } from "@/server/jobs/dispatch-after-response";
import { getI18n } from "@/i18n/server";
import type { Dictionary } from "@/i18n/dictionaries";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LogoutButton } from "@/components/logout-button";

/** The portal's sections and the pages under each (DESIGN.md, "Navigation and Page Map"). */
function sectionsFor(t: Dictionary): MenuSection[] {
  return [
    {
      href: "/app/dashboard",
      label: t.nav.dashboard,
      links: [
        { href: "/app/dashboard", label: t.nav.dashboard },
        { href: "/app/account-status", label: t.accountStatus.title },
      ],
    },
    {
      href: "/app/send",
      label: t.nav.send,
      links: [
        { href: "/app/send", label: t.nav.send },
        { href: "/app/templates", label: t.nav.templates },
      ],
    },
    {
      href: "/app/contacts",
      label: t.nav.contacts,
      links: [
        { href: "/app/contacts", label: t.nav.contacts },
        { href: "/app/contacts/groups", label: t.groups.title },
        { href: "/app/contacts/opt-outs", label: t.contacts.optOuts.title },
      ],
    },
    {
      href: "/app/campaigns",
      label: t.nav.campaigns,
      links: [
        { href: "/app/campaigns", label: t.nav.campaigns },
        { href: "/app/approvals", label: t.nav.approvals },
      ],
    },
    {
      href: "/app/credits",
      label: t.nav.credits,
      links: [{ href: "/app/credits", label: t.nav.credits }],
    },
    {
      href: "/app/support",
      label: t.nav.support,
      links: [
        { href: "/app/support", label: t.nav.support },
        { href: "/help", label: t.helpCentre.title },
        { href: "/bulk", label: t.home.requestBulkQuote },
      ],
    },
  ];
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrgContext({ allowInactive: true });
  // Signed in, so scheduled sends and retries that are due go out now rather
  // than on the next scheduled drain.
  dispatchDueOnVisit();
  const [{ t }, wallet, config] = await Promise.all([
    getI18n(),
    getWallet(ctx.org.organizationId),
    getEffectiveConfig(),
  ]);
  const verified = ctx.org.organizationStatus === "ACTIVE";
  const sections = sectionsFor(t);
  const credit = formatCentavos(wallet.availableCentavos);

  // Verified is slate navy; anything short of it is burgundy (DESIGN.md, "Badges and pills").
  const accountBadge = (
    <span
      className={
        verified
          ? "bg-navy-800 px-1.5 py-px text-[12px] whitespace-nowrap text-white"
          : "bg-review px-1.5 py-px text-[12px] whitespace-nowrap text-white"
      }
    >
      {verified ? t.common.verified : t.status.org[ctx.org.organizationStatus]}
    </span>
  );

  const shortcuts: MenuShortcut[] = [
    ...(ctx.can("campaign.send")
      ? [{ href: "/app/send", label: t.nav.send, icon: <IconSend size={22} /> }]
      : []),
    ...(ctx.can("billing.manage")
      ? [{ href: "/app/credits", label: t.credits.addCredit, icon: <IconCard size={22} /> }]
      : []),
    { href: "/app/campaigns", label: t.nav.campaigns, icon: <IconMegaphone size={22} /> },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="relative z-30 border-b border-line-strong bg-white">
        <div className="flex h-14 items-center gap-4 px-5 xl:h-[90px] xl:gap-6 xl:px-10">
          <Wordmark href="/app/dashboard" size={28} />

          <TopMenu sections={sections} label={t.publicSite.navMain} />

          {/* One language switcher for every width: the tests and screen
              readers find it by its label, and a second copy would be a
              second control of the same name. */}
          <div className="ml-auto flex items-center gap-2 xl:ml-0 xl:flex-col xl:items-end xl:gap-1">
            <div className="flex items-center gap-3">
              <ul className="hidden items-center text-[12px] text-muted xl:flex">
                {env.APP_MODE === "MOCK" ? (
                  <li className="mr-3">
                    <Pill tone="info">{t.common.demoMode}</Pill>
                  </li>
                ) : null}
                <li className="relative pr-3 after:absolute after:right-0 after:top-1/2 after:h-2.5 after:w-px after:-translate-y-1/2 after:bg-navy-300">
                  <Link href="/app/settings" className="-my-1 py-1 hover:text-ink">
                    {t.nav.settings}
                  </Link>
                </li>
                <li className="pl-3">
                  <LogoutButton label={t.nav.logOut} look="utility" />
                </li>
              </ul>
              <LocaleSwitcher />
              {/* On a phone, Log out stays in the header as a labelled icon. */}
              <span className="xl:hidden">
                <LogoutButton label={t.nav.logOut} />
              </span>
              <PhoneMenu
                homeHref="/app/dashboard"
                sections={sections}
                shortcuts={shortcuts}
                summary={
                  <div>
                    <p className="flex flex-wrap items-center gap-2 text-[20px] font-bold text-ink">
                      <span className="min-w-0 wrap-break-word">{ctx.org.organizationName}</span>
                      {accountBadge}
                    </p>
                    <p className="mt-3 text-[13px] text-muted">{t.nav.credit}</p>
                    <p className="text-[22px] font-bold text-brand-700 tabular-nums">{credit}</p>
                  </div>
                }
                footer={
                  <p className="flex gap-5 text-[13px]">
                    <Link href="/app/settings" className="text-ink hover:text-brand-700">
                      {t.nav.settings}
                    </Link>
                    <Link href="/legal/privacy" className="text-muted hover:text-ink">
                      {t.nav.privacy}
                    </Link>
                    <Link href="/legal/terms" className="text-muted hover:text-ink">
                      {t.nav.terms}
                    </Link>
                  </p>
                }
              />
            </div>

            <div className="hidden max-w-[300px] flex-col items-end xl:flex">
              <p className="flex min-w-0 items-center gap-1.5 text-[14px] text-ink">
                <span className="truncate">{ctx.org.organizationName}</span>
                {accountBadge}
              </p>
              <p className="text-[12px] text-muted">
                {t.nav.credit}{" "}
                <span className="font-bold text-brand-700 tabular-nums">{credit}</span>
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 pb-20 pt-8 md:px-10">{children}</main>

      <footer className="bg-band">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-5 py-8 md:flex-row md:items-center md:justify-between md:px-10">
          <div className="space-y-1 text-[12px] text-muted">
            <p>{t.common.timezoneNote}</p>
            <DemoFooterMark />
          </div>
          {/* The padding is tap area: the text alone is 19px tall. The
              negative margin keeps the row where it was. */}
          <div className="flex gap-5 text-[12px]">
            <Link href="/legal/privacy" className="-my-1 py-1 text-ink hover:text-brand-700">
              {t.nav.privacy}
            </Link>
            <Link href="/legal/terms" className="-my-1 py-1 text-ink hover:text-brand-700">
              {t.nav.terms}
            </Link>
            <Link href="/app/support" className="-my-1 py-1 text-ink hover:text-brand-700">
              {t.nav.help}
            </Link>
          </div>
        </div>
        <p className="flex min-h-10 items-center justify-center bg-copyright px-5 text-center text-[13px] text-white">
          {t.components.copyright(new Date().getFullYear())}
        </p>
      </footer>

      {/* Last in the page: it is fixed in the margin, so its place in the
          markup does not move it, and a search for a phrase it shares with
          the page ("Price per segment") finds the page's copy first. */}
      <QuickMenu
        label={t.nav.quickMenu}
        links={[
          { href: "/how-it-works", title: t.nav.quick.guideTitle, sub: t.nav.quick.guideSub },
          { href: "/app/settings/senders", title: t.nav.quick.sendersTitle, sub: t.nav.quick.sendersSub },
          { href: "/app/contacts", title: t.nav.quick.importTitle, sub: t.nav.quick.importSub },
          { href: "/app/support", title: t.nav.quick.supportTitle, sub: t.nav.quick.supportSub },
        ]}
        rates={{
          label: t.nav.myRates,
          rows: [{ label: t.send.rowPricePerSegment, value: formatCentavos(config.unitPriceCentavos) }],
        }}
      />
    </div>
  );
}
