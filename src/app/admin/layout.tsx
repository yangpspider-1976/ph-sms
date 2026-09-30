import Link from "next/link";
import { PRODUCT_TAGLINE, Wordmark } from "@/components/brand";
import { SidebarNav, type NavItem } from "@/components/sidebar";
import { Pill } from "@/components/ui";
import { formatManilaDate } from "@/server/config";
import {
  IconBlock,
  IconCard,
  IconChat,
  IconChevronDown,
  IconDatabase,
  IconDocument,
  IconHome,
  IconList,
  IconSettings,
  IconShield,
  IconSliders,
  IconTag,
  IconUser,
  IconUsers,
} from "@/components/icons";
import { requirePlatformAdmin } from "@/server/auth/context";
import { env } from "@/server/env";
import { getDictionary } from "@/i18n/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LogoutButton } from "@/components/logout-button";
import { MobileNav } from "@/components/mobile-nav";

const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: <IconHome size={18} /> },
  { href: "/admin/customers", label: "Customers", icon: <IconUsers size={18} /> },
  { href: "/admin/verification", label: "Verification", icon: <IconShield size={18} /> },
  { href: "/admin/activity", label: "SMS Activity", icon: <IconChat size={18} /> },
  { href: "/admin/inquiries", label: "Bulk Inquiries", icon: <IconDocument size={18} /> },
  { href: "/admin/senders", label: "Sender IDs", icon: <IconTag size={18} /> },
  { href: "/admin/credits", label: "Credits", icon: <IconDatabase size={18} /> },
  { href: "/admin/suppression", label: "Suppression", icon: <IconBlock size={18} /> },
  { href: "/admin/abuse", label: "Abuse", icon: <IconShield size={18} /> },
  { href: "/admin/health", label: "System health", icon: <IconSliders size={18} /> },
  { href: "/admin/audit", label: "Audit logs", icon: <IconList size={18} /> },
  { href: "/admin/settings", label: "Settings", icon: <IconSettings size={18} /> },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getDictionary();

  const admin = await requirePlatformAdmin();

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* The admin console is visually distinct from the customer portal on purpose.
          Logo pinned, nav scrolls inside the sidebar — see the customer layout. */}
      <aside className="sticky top-0 hidden h-screen w-[235px] shrink-0 flex-col bg-navy-900 lg:flex">
        <div className="shrink-0 px-5 py-5">
          <Wordmark href="/admin" subtitle={t.adminExtra.adminSubtitle} onDark />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-color:var(--color-navy-700)_transparent] [scrollbar-width:thin]">
          <SidebarNav items={NAV} tone="dark" />

          <div className="mt-auto border-t border-white/8 px-6 py-5">
            {/* navy-300 (7.45:1 on navy-900). navy-400 measured 4.20:1 and failed AA. */}
            <p className="text-[12.5px] leading-snug text-navy-300">{PRODUCT_TAGLINE}</p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-white">
          <div className="flex h-[60px] items-center gap-3 px-4 sm:px-8">
            <div className="flex items-center gap-3 lg:hidden">
              <MobileNav
                items={NAV}
                tone="dark"
                homeHref="/admin"
                subtitle={t.adminExtra.adminSubtitle}
                // A phone header has no room for the switcher next to the mode pill.
                footer={
                  <div className="sm:hidden">
                    <LocaleSwitcher tone="dark" />
                  </div>
                }
              />
              <Wordmark href="/admin" size={26} textClassName="hidden sm:block" />
            </div>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <span className="hidden text-[13px] font-medium text-body sm:block">
                {formatManilaDate(new Date())}
              </span>

              {env.APP_MODE === "MOCK" ? <Pill tone="info">{t.adminExtra.modeMock}</Pill> : null}
              {env.APP_MODE === "PARTNER_SANDBOX" ? (
                <Pill tone="warning">{t.adminExtra.modeSandbox}</Pill>
              ) : null}
              {env.APP_MODE === "LIVE" ? <Pill tone="success">{t.adminExtra.modeLive}</Pill> : null}

              <span className="hidden sm:block">
                <LocaleSwitcher />
              </span>

              <span className="hidden h-6 w-px bg-line sm:block" />

              <Link
                href="/admin/settings"
                className="flex items-center gap-2 text-[13px] font-semibold text-ink hover:text-brand-700"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted">
                  <IconUser size={16} />
                </span>
                <span className="hidden sm:inline">{admin.fullName.split(" ")[0] ?? "Admin"}</span>
                <IconChevronDown size={13} className="text-muted" />
              </Link>

              <LogoutButton label={t.nav.logOut} />
            </div>
          </div>
        </header>

        <main className="flex-1 px-5 py-7 sm:px-8">{children}</main>

        <footer className="border-t border-line bg-white px-5 py-4 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12.5px] text-muted">
              All operational actions are recorded in the audit log.
            </p>
            <p className="text-[12.5px] text-muted">
              <span className="font-semibold text-body">PH SMS</span> • Building stronger business
              connections in the Philippines.
            </p>
          </div>
          <p className="mt-2 text-right text-[11.5px] text-muted">
            Design preview • Sample content
          </p>
        </footer>
      </div>
    </div>
  );
}
