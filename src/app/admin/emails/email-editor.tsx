"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Notice, Pill } from "@/components/ui";
import { keepValuesOnSubmit } from "@/components/form-submit";
import { useLocale, useServerText, useT } from "@/i18n/client";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/config";
import {
  resetEmailTemplateAction,
  saveEmailTemplateAction,
  type EmailTemplateResult,
} from "@/server/actions/email-templates";
import type { EmailTemplateKey } from "@/server/domain/email-templates";

type Row = {
  key: EmailTemplateKey;
  locale: Locale;
  template: { subject: string; body: string; custom: boolean };
  placeholders: string[];
};

export function EmailEditor({ rows }: { rows: Row[] }) {
  const t = useT();
  const { locale } = useLocale();
  const [templateKey, setTemplateKey] = useState<EmailTemplateKey>("verify");
  const [language, setLanguage] = useState<Locale>(locale);
  const row = rows.find((entry) => entry.key === templateKey && entry.locale === language)!;

  return (
    <div className="space-y-5">
      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="email-template-kind">{t.adminEmails.kind}</label>
          <select id="email-template-kind" className="field" value={templateKey} onChange={(event) => setTemplateKey(event.target.value as EmailTemplateKey)}>
            {rows.filter((entry) => entry.locale === language).map((entry) => (
              <option key={entry.key} value={entry.key}>{t.adminEmails.kinds[entry.key]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="email-template-language">{t.adminEmails.language}</label>
          <select id="email-template-language" className="field" value={language} onChange={(event) => setLanguage(event.target.value as Locale)}>
            {LOCALES.map((code) => <option key={code} value={code}>{LOCALE_NAMES[code]}</option>)}
          </select>
        </div>
      </Card>
      <TemplateForm key={`${templateKey}:${language}`} row={row} />
    </div>
  );
}

function TemplateForm({ row }: { row: Row }) {
  const t = useT();
  const localize = useServerText();
  const router = useRouter();
  const [subject, setSubject] = useState(row.template.subject);
  const [body, setBody] = useState(row.template.body);
  const [custom, setCustom] = useState(row.template.custom);
  const [result, setResult] = useState<EmailTemplateResult | null>(null);
  const [pending, startTransition] = useTransition();
  const preview = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    (t.adminEmails.examples as Record<string, string>)[name] ?? match,
  );

  function save(formData: FormData) {
    startTransition(async () => {
      const outcome = await saveEmailTemplateAction(formData);
      setResult(outcome);
      if (outcome.ok) {
        setCustom(true);
        router.refresh();
      }
    });
  }

  function reset() {
    startTransition(async () => {
      const outcome = await resetEmailTemplateAction(row.key, row.locale);
      setResult(outcome);
      if (outcome.ok) {
        // The server sends the default in the email's language, which may not
        // be the language this page is shown in.
        if (outcome.template) {
          setSubject(outcome.template.subject);
          setBody(outcome.template.body);
        }
        setCustom(false);
        router.refresh();
      }
    });
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="card-title">{t.adminEmails.kinds[row.key]}</h2>
        <Pill tone={custom ? "info" : "neutral"}>{custom ? t.adminEmails.custom : t.adminEmails.builtIn}</Pill>
      </div>
      {result ? <div className="mb-4"><Notice tone={result.ok ? "success" : "danger"} title={result.ok ? t.contacts.detail.saved : t.contacts.detail.notSaved}>{localize(result.message)}</Notice></div> : null}
      <form action={save} onSubmit={keepValuesOnSubmit(save)} className="space-y-4">
        <input type="hidden" name="key" value={row.key} />
        <input type="hidden" name="locale" value={row.locale} />
        <div>
          <label className="field-label" htmlFor="email-subject">{t.adminEmails.subject}</label>
          <input id="email-subject" className="field" name="subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} required disabled={pending} />
        </div>
        <div>
          <label className="field-label" htmlFor="email-body">{t.adminEmails.body}</label>
          <textarea id="email-body" className="field min-h-56" name="body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} required disabled={pending} aria-describedby="email-placeholders" />
          <p id="email-placeholders" className="mt-2 break-words text-[12px] text-muted">
            {row.placeholders.length ? t.adminEmails.placeholders(row.placeholders.map((name) => `{{${name}}}`).join(", ")) : t.adminEmails.noPlaceholders}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>{pending ? t.common.saving : t.common.save}</Button>
          <Button type="button" variant="ghost" disabled={pending || !custom} onClick={reset}>{t.admin.settings.restoreDefault}</Button>
        </div>
      </form>
      <section className="mt-6 border-t border-line pt-5">
        <h3 className="card-title">{t.adminEmails.preview}</h3>
        <p className="mt-1 text-[12px] text-muted">{t.adminEmails.previewNote}</p>
        <p className="mt-4 break-words font-semibold text-ink">{preview(subject)}</p>
        <p className="mt-3 whitespace-pre-wrap break-words text-[13px] text-body">{preview(body)}</p>
      </section>
    </Card>
  );
}
