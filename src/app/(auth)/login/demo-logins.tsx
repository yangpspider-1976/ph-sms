import { demoLoginAction } from "@/server/actions/auth";
import { Button } from "@/components/ui";
import { getDictionary } from "@/i18n/server";
import type { Dictionary } from "@/i18n/dictionaries";

function accountsFor(t: Dictionary) {
  return [
    { email: "owner@demo.test", label: t.auth.demoLogins.owner, hint: t.auth.demoLogins.ownerHint },
    { email: "sender@demo.test", label: t.auth.demoLogins.sender, hint: t.auth.demoLogins.senderHint },
    { email: "viewer@demo.test", label: t.auth.demoLogins.viewer, hint: t.auth.demoLogins.viewerHint },
    { email: "admin@phsms.test", label: t.auth.demoLogins.admin, hint: t.auth.demoLogins.adminHint },
  ];
}

/**
 * Seeded logins, shown only outside LIVE. Production builds exclude this panel
 * and the action behind it refuses to run.
 */
export async function DemoLogins() {
  const t = await getDictionary();

  return (
    <div className="mt-8 rounded-[10px] border border-dashed border-brand-200 bg-brand-50/50 p-4">
      <p className="text-[13px] font-bold text-ink">{t.auth.demoLogins.title}</p>
      <p className="mt-0.5 text-[12.5px] text-muted">
        {t.auth.demoLogins.passwordNote}{" "}
        <code className="rounded bg-white px-1 py-0.5 text-[11.5px]">DemoPass123!</code>
      </p>
      <div className="mt-3 grid gap-2">
        {accountsFor(t).map((account) => (
          <form
            key={account.email}
            action={demoLoginAction.bind(null, account.email)}
            className="flex items-center gap-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink">{account.label}</span>
              <span className="block truncate text-[12px] text-muted">{account.hint}</span>
            </span>
            <Button type="submit" variant="secondary" size="sm">
              {t.auth.demoLogins.signIn}
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}
