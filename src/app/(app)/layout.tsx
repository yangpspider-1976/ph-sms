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
      <aside className="sticky top-0 hidden h-screen w-[235px] shrink-0 flex-col border-r border-line bg-white lg:flex">
        <div className="px-5 py-5">
          <Wordmark href="/app/dashboard" />
        </div>

        <SidebarNav items={navFor(t)} tone="light" />

        <div className="mt-auto p-4">
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
          <DemoFooterMark className="mt-4 px-1" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-white">
          <div className="flex h-[60px] items-center gap-3 px-5 sm:px-8">
            <div className="lg:hidden">
              <Wordmark href="/app/dashboard" size={26} />
            </div>

            <div className="ml-auto flex items-center gap-3">
              {env.APP_MODE === "MOCK" ? (
                <span className="hidden sm:block">
                  <Pill tone="info">{t.common.demoMode}</Pill>
                </span>
              ) : null}

              <Link
                href="/app/settings"
                className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-navy-50"
              >
                <IconBuilding size={15} className="text-muted" />
                <span className="max-w-[160px] truncate">{ctx.org.organizationName}</span>
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
                className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted hover:bg-navy-50"
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DemoFooterMark className="lg:hidden" />
            <p className="hidden text-[12px] text-muted lg:block">
              {t.common.timezoneNote}
            </p>
            <LocaleSwitcher />
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
