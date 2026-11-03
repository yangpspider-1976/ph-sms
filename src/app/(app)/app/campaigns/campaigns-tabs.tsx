import { SectionTabs } from "@/components/ui";
import type { Dictionary } from "@/i18n/dictionaries";

/** Campaigns and the approval queue as section tabs, under each page's title. */
export function CampaignsTabs({ t, current }: { t: Dictionary; current: string }) {
  return (
    <SectionTabs
      label={t.nav.sections(t.nav.campaigns)}
      current={current}
      tabs={[
        { href: "/app/campaigns", label: t.campaigns.title },
        { href: "/app/approvals", label: t.approvals.title },
      ]}
    />
  );
}
