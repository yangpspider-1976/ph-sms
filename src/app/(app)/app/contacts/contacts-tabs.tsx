import { SectionTabs } from "@/components/ui";
import type { Dictionary } from "@/i18n/dictionaries";

/** Contacts, groups and the opt-out list as section tabs, under each page's title. */
export function ContactsTabs({ t, current }: { t: Dictionary; current: string }) {
  return (
    <SectionTabs
      label={t.nav.sections(t.nav.contacts)}
      current={current}
      tabs={[
        { href: "/app/contacts", label: t.contacts.title },
        { href: "/app/contacts/groups", label: t.groups.title },
        { href: "/app/contacts/opt-outs", label: t.contacts.optOuts.title },
      ]}
    />
  );
}
