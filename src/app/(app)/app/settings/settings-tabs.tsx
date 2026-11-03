import { SectionTabs } from "@/components/ui";
import type { Dictionary } from "@/i18n/dictionaries";

/** The Settings pages as section tabs, under each page's title. */
export function SettingsTabs({ t, current }: { t: Dictionary; current: string }) {
  return (
    <SectionTabs
      label={t.nav.sections(t.nav.settings)}
      current={current}
      tabs={[
        { href: "/app/settings", label: t.settings.businessProfile },
        { href: "/app/settings/profile", label: t.settings.tileProfile },
        { href: "/app/settings/team", label: t.settings.tileTeam },
        { href: "/app/settings/senders", label: t.settings.tileSenders },
      ]}
    />
  );
}
