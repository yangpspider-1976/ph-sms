import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/server/auth/context";
import { EMAIL_TEMPLATES, listEmailTemplates } from "@/server/domain/email-templates";
import { Notice, PageHeader } from "@/components/ui";
import { getDictionary } from "@/i18n/server";
import { EmailEditor } from "./email-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminEmails.title };
}

export const dynamic = "force-dynamic";

export default async function AdminEmailsPage() {
  await requirePlatformAdmin();
  const [t, rows] = await Promise.all([getDictionary(), listEmailTemplates()]);
  return (
    <>
      <PageHeader title={t.adminEmails.title} description={t.adminEmails.description} />
      <div className="mb-5">
        <Notice tone="info" title={t.adminEmails.linksTitle}>{t.adminEmails.linksNote}</Notice>
      </div>
      <EmailEditor rows={rows.map((row) => ({ ...row, placeholders: [...EMAIL_TEMPLATES[row.key]] }))} />
    </>
  );
}
