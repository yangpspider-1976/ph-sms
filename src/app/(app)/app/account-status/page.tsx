import { requireOrgContext } from "@/server/auth/context";
import { Card, Notice, PageHeader, DetailRow } from "@/components/ui";
import { getDictionary } from "@/i18n/server";

export const metadata = { title: "Account status" };

const COPY: Record<string, { tone: "warning" | "danger" | "info"; title: string; body: string }> = {
  PENDING_REVIEW: {
    tone: "info",
    title: "Your business is being reviewed",
    body: "A reviewer is checking the details you submitted. You cannot send messages until the review is complete.",
  },
  NEEDS_INFORMATION: {
    tone: "warning",
    title: "We need more information",
    body: "A reviewer has asked for more detail before your account can be activated. Check your email for what is needed.",
  },
  SUSPENDED: {
    tone: "danger",
    title: "This account is suspended",
    body: "Sending is disabled. Contact support to discuss reactivating the account.",
  },
  REJECTED: {
    tone: "danger",
    title: "This application was not approved",
    body: "Contact support if you believe this was a mistake or your circumstances have changed.",
  },
};

export default async function AccountStatusPage() {
  const t = await getDictionary();

  const ctx = await requireOrgContext({ allowInactive: true });
  const copy = COPY[ctx.org.organizationStatus] ?? COPY.PENDING_REVIEW!;

  return (
    <>
      <PageHeader
        title={t.accountStatus.title}
        description={t.accountStatus.subheading}
      />
      <Card className="max-w-2xl p-6">
        <Notice tone={copy.tone} title={copy.title}>
          {copy.body}
        </Notice>
        <dl className="mt-5">
          <DetailRow label={t.accountStatus.organization} value={ctx.org.organizationName} />
          <DetailRow label={t.common.status} value={ctx.org.organizationStatus.replace("_", " ")} />
          <DetailRow label={t.accountStatus.yourRole} value={ctx.org.role} />
        </dl>
      </Card>
    </>
  );
}
