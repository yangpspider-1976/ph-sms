import type { Metadata } from "next";
import { requireOrgContext } from "@/server/auth/context";
import { Card, Notice, PageHeader, DetailRow } from "@/components/ui";
import { getDictionary } from "@/i18n/server";
import type { Dictionary } from "@/i18n/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.accountStatus.title };
}

type Copy = { tone: "warning" | "danger" | "info"; title: string; body: string };

function copyFor(t: Dictionary, status: string): Copy {
  const s = t.accountStatus;
  switch (status) {
    case "NEEDS_INFORMATION":
      return { tone: "warning", title: s.needsInfoTitle, body: s.needsInfoBody };
    case "SUSPENDED":
      return { tone: "danger", title: s.suspendedTitle, body: s.suspendedBody };
    case "REJECTED":
      return { tone: "danger", title: s.rejectedTitle, body: s.rejectedBody };
    default:
      return { tone: "info", title: s.reviewingTitle, body: s.reviewingBody };
  }
}

export default async function AccountStatusPage() {
  const t = await getDictionary();

  const ctx = await requireOrgContext({ allowInactive: true });
  const copy = copyFor(t, ctx.org.organizationStatus);

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
          <DetailRow label={t.common.status} value={t.status.org[ctx.org.organizationStatus]} />
          <DetailRow label={t.accountStatus.yourRole} value={t.roles.labels[ctx.org.role]} />
        </dl>
      </Card>
    </>
  );
}
