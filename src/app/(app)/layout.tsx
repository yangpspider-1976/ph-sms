import Link from "next/link";
import { DemoFooterMark, Wordmark } from "@/components/brand";
import { SidebarNav, type NavItem } from "@/components/sidebar";
import { Pill } from "@/components/ui";
import {
  IconCard,
  IconChat,
  IconDocument,
  IconHelp,
  IconHome,
  IconMegaphone,
  IconSend,
  IconUser,
  IconUsers,
  IconChevronDown,
  IconBuilding,
  IconCheckCircle,
  IconShield,
} from "@/components/icons";
import { requireOrgContext } from "@/server/auth/context";
import { env } from "@/server/env";
import { getI18n } from "@/i18n/server";
import type { Dictionary } from "@/i18n/dictionaries";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LogoutButton } from "@/components/logout-button";
import { MobileNav } from "@/components/mobile-nav";

function navFor(t: Dictionary): NavItem[] {
  return [
    { href: "/app/dashboard", label: t.nav.dashboard, icon: <IconHome size={18} /> },
    { href: "/app/send", label: t.nav.send, icon: <IconSend size={18} /> },
    { href: "/app/campaigns", label: t.nav.campaigns, icon: <IconMegaphone size={18} /> },
    { href: "/app/approvals", label: t.nav.approvals, icon: <IconShield size={18} /> },
    { href: "/app/contacts", label: t.nav.contacts, icon: <IconUsers size={18} /> },
    { href: "/app/templates", label: t.nav.templates, icon: <IconDocument size={18} /> },
    { href: "/app/credits", label: t.nav.credits, icon: <IconCard size={18} /> },
    { href: "/app/support", label: t.nav.support, icon: <IconHelp size={18} /> },
  ];
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrgContext({ allowInactive: true });
  const { t } = await getI18n();
  const verified = ctx.org.organizationStatus === "ACTIVE";

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Pinned to the viewport. The logo stays put and everything below it
          scrolls inside the sidebar: letting it overflow instead made the
          document taller than the layout, so on a short screen the "sticky"
          sidebar scrolled away and its tail spilled out under the footer. */}
      <aside className="sticky top-0 hidden h-screen w-[235px] shrink-0 flex-col border-r border-line bg-white lg:flex">
        <div className="shrink-0 px-5 py-5">
          <Wordmark href="/app/dashboard" />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:thin]">
          <SidebarNav items={navFor(t)} tone="light" />

          {/* Decorative, so it gives way on short screens before the nav has to scroll. */}
          <div className="mt-auto p-4 [@media(max-height:660px)]:hidden">
            <div className="rounded-[10px] bg-brand-50 px-4 py-5 text-center">
              <span className="mx-auto mb-2 flex w-fit items-center gap-1 text-brand-600">
                <IconChat size={20} />
                <IconChat size={15} className="opacity-70" />
              </span>
              <p className="text-[13px] font-bold text-ink">{t.nav.sidebarPromoTitle}</p>
              <p className="mt-1 text-[12px] leading-snug text-muted">
                {t.nav.sidebarPromoBody}
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-white">
          <div className="flex h-[60px] items-center gap-3 px-4 sm:px-8">
            <div className="flex items-center gap-3 lg:hidden">
              <MobileNav items={navFor(t)} tone="light" homeHref="/app/dashboard" />
              <Wordmark href="/app/dashboard" size={26} textClassName="hidden sm:block" />
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
              {env.APP_MODE === "MOCK" ? (
                <span className="hidden sm:block">
                  <Pill tone="info">{t.common.demoMode}</Pill>
                </span>
              ) : null}

              <Link
                href="/app/settings"
                className="flex min-w-0 items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-navy-50"
              >
                <IconBuilding size={15} className="shrink-0 text-muted" />
                <span className="max-w-[110px] truncate sm:max-w-[160px]">
                  {ctx.org.organizationName}
                </span>
                <IconChevronDown size={13} className="text-muted" />
              </Link>

              {verified ? (
                <span className="hidden items-center sm:flex">
                  <Pill tone="success" dot={false}>
                    <IconCheckCircle size={13} /> {t.common.verified}
                  </Pill>
                </span>
              ) : (
                <Pill tone="warning">{statusLabel(ctx.org.organizationStatus)}</Pill>
              )}

              <span className="hidden h-6 w-px bg-line sm:block" />

              <Link
                href="/app/settings/profile"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-muted hover:bg-navy-50"
                aria-label={t.nav.signedInAs(ctx.user.fullName)}
              >
                <IconUser size={16} />
              </Link>

              <LogoutButton label={t.nav.logOut} />
            </div>
          </div>
        </header>

        <main className="flex-1 px-5 py-7 sm:px-8">{children}</main>

        <footer className="border-t border-line bg-white px-5 py-4 sm:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-0.5 text-[12px] text-muted">
              <p>{t.common.timezoneNote}</p>
              <DemoFooterMark />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex gap-5 text-[12.5px] text-muted">
                <Link href="/legal/privacy" className="hover:text-brand-700">
                  {t.nav.privacy}
                </Link>
                <Link href="/legal/terms" className="hover:text-brand-700">
                  {t.nav.terms}
                </Link>
                <Link href="/app/support" className="hover:text-brand-700">
                  {t.nav.help}
                </Link>
              </div>
              <LocaleSwitcher />
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function statusLabel(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}
