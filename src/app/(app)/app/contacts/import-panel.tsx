"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  commitImportAction,
  uploadContactsAction,
  type ImportActionResult,
} from "@/server/actions/contacts";
import type { ImportPreview } from "@/server/domain/contacts";
import {
  Button,
  Card,
  DataTable,
  Notice,
  Pill,
} from "@/components/ui";
import { IconDocument, IconFile } from "@/components/icons";
import { useLocale, useT } from "@/i18n/client";

/**
 * CSV import.
 *
 * Upload produces a preview with a per-row reason for every exclusion; nothing
 * reaches the contact list until the customer confirms what they are looking at.
 */
export function ImportPanel({
  maxUploadBytes,
  maxDataRows,
}: {
  maxUploadBytes: number;
  maxDataRows: number;
}) {
  const t = useT();
  const { tag } = useLocale();
  const maxMiB = Math.round(maxUploadBytes / 1024 / 1024);

  const [result, setResult] = useState<ImportActionResult | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [committed, setCommitted] = useState<string | null>(null);
  const [needsAcknowledge, setNeedsAcknowledge] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function upload(formData: FormData) {
    setCommitted(null);

    // Checked here as well as on the server: a body over the platform's request
    // limit is refused before the action runs, so the server check never gets
    // the chance to explain itself.
    const file = formData.get("file");
    if (file instanceof File && file.size > maxUploadBytes) {
      setResult({ ok: false, message: t.contactsExtra.fileTooLarge(maxMiB), code: "TOO_LARGE" });
      setPreview(null);
      return;
    }

    startTransition(async () => {
      let outcome: ImportActionResult;
      try {
        outcome = await uploadContactsAction(formData);
      } catch {
        // A rejected request (network, or a proxy refusing the body) would
        // otherwise replace the whole page with an error screen.
        outcome = { ok: false, message: t.contactsExtra.uploadFailed, code: "UPLOAD_FAILED" };
      }
      setResult(outcome);
      setPreview(outcome.ok ? outcome.preview : null);
      setNeedsAcknowledge(!outcome.ok && outcome.code === "UNKNOWN_COLUMNS");
    });
  }

  function commit() {
    if (!preview) return;
    startTransition(async () => {
      const outcome = await commitImportAction(preview.importId);
      if (outcome.ok) {
        setCommitted(
          `${outcome.added} added, ${outcome.updated} updated` +
            (outcome.skippedSuppressed > 0
              ? `, ${outcome.skippedSuppressed} skipped because they opted out`
              : ""),
        );
        setPreview(null);
        setResult(null);
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  return (
    <Card className="p-5">
      <h2 className="card-title">{t.contacts.importPanel.title}</h2>
      <p className="mt-1 text-[13px] text-muted">
        {t.contactsExtra.csvNote} <code className="text-[12px]">phone_number</code>{" "}
        {t.contactsExtra.csvNoteColumn}
      </p>

      <form ref={formRef} action={upload} className="mt-4 space-y-3">
        {/* flex-wrap and a width cap on the input: a file input has a wide
            intrinsic size and pushed the page sideways on a phone. */}
        <label
          htmlFor="contacts-file"
          className="flex cursor-pointer flex-wrap items-center gap-3 rounded-[10px] border border-dashed border-brand-200 bg-brand-50/40 px-4 py-5"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-muted">
            <IconFile size={20} />
          </span>
          <span>
            <span className="block text-[13.5px] font-semibold text-ink">{t.contacts.importPanel.chooseFile}</span>
            <span className="block text-[12.5px] text-muted">
              {t.contactsExtra.fileLimits(maxMiB, maxDataRows.toLocaleString(tag))}
            </span>
          </span>
          <input
            id="contacts-file"
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="ml-auto max-w-full text-[12.5px] text-muted"
          />
        </label>

        {needsAcknowledge ? (
          <label className="flex items-start gap-2 text-[13px] text-body">
            <input type="checkbox" name="acknowledgeUnknown" className="mt-0.5 h-4 w-4 accent-brand-600" />
            <span>
              Ignore the columns we do not recognise and import the rest.
            </span>
          </label>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Reading…" : "Upload and preview"}
          </Button>
          <Link
            href="/app/exports?kind=template"
            prefetch={false}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-600 hover:underline"
          >
            <IconDocument size={15} /> Download template
          </Link>
        </div>
      </form>

      {committed ? (
        <div className="mt-4">
          <Notice tone="success" title={t.contacts.importPanel.completeTitle}>
            {committed}
          </Notice>
        </div>
      ) : null}

      {result && !result.ok ? (
        <div className="mt-4">
          <Notice tone="danger" title={t.contacts.importPanel.failedTitle}>
            {result.message}
            {result.detail && result.detail.length > 0 ? (
              <ul className="mt-2 list-disc pl-4">
                {result.detail.slice(0, 5).map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
          </Notice>
        </div>
      ) : null}

      {preview ? <Preview preview={preview} onCommit={commit} pending={pending} /> : null}
    </Card>
  );
}

function Preview({
  preview,
  onCommit,
  pending,
}: {
  preview: ImportPreview;
  onCommit: () => void;
  pending: boolean;
}) {
  const t = useT();
  const { counts } = preview;
  const excluded = counts.blank + counts.invalid + counts.duplicate + counts.suppressed;

  return (
    <div className="mt-5 rounded-[10px] border border-line">
      <div className="border-b border-line px-4 py-3">
        <p className="text-[13.5px] font-bold text-ink">{t.contacts.importPanel.reviewTitle}</p>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {t.contacts.importPanel.summaryLine(counts.rawRows, counts.eligible, excluded)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-3">
        <Pill tone="success">{t.contactsExtra.countEligible(counts.eligible)}</Pill>
        {counts.duplicate > 0 ? <Pill tone="neutral">{t.contactsExtra.countDuplicate(counts.duplicate)}</Pill> : null}
        {counts.invalid > 0 ? <Pill tone="warning">{t.contactsExtra.countInvalid(counts.invalid)}</Pill> : null}
        {counts.blank > 0 ? <Pill tone="neutral">{t.contactsExtra.countBlank(counts.blank)}</Pill> : null}
        {counts.suppressed > 0 ? <Pill tone="violet">{t.contactsExtra.countOptedOut(counts.suppressed)}</Pill> : null}
      </div>

      <div className="border-t border-line px-4 py-3">
        <p className="text-[12.5px] font-semibold text-ink">
          {t.contacts.importPanel.columnMappingTitle}
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {preview.columnMapping.map((column) => (
            <li
              key={column.header}
              className="flex items-center gap-1.5 text-[12.5px]"
            >
              <span className="font-mono text-ink">{column.header}</span>
              <span aria-hidden className="text-muted">
                →
              </span>
              <span className={column.used ? "text-muted" : "text-muted italic"}>
                {column.field}
              </span>
            </li>
          ))}
        </ul>
        {preview.unknownColumns.length > 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">
            {t.contacts.importPanel.ignoredNote}
          </p>
        ) : null}
      </div>

      <div className="max-h-72 overflow-auto border-t border-line">
        <DataTable>
          <thead>
            <tr>
              <th>{t.contactsExtra.colRow}</th>
              <th>{t.contacts.importPanel.colValue}</th>
              <th>{t.contacts.importPanel.colResult}</th>
              <th>{t.contacts.importPanel.colReason}</th>
            </tr>
          </thead>
          <tbody>
            {preview.sample.map((row) => (
              <tr key={row.sourceRowNumber}>
                <td>{row.sourceRowNumber}</td>
                <td className="font-mono text-[12px]">{row.masked ?? (row.raw || "—")}</td>
                <td>
                  <Pill tone={row.status === "ELIGIBLE" ? "success" : "neutral"}>
                    {row.status.toLowerCase()}
                  </Pill>
                </td>
                <td className="text-muted">{row.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
        <Button onClick={onCommit} disabled={pending || counts.eligible === 0}>
          {pending ? t.contacts.importPanel.importing : t.contacts.importPanel.importButton(counts.eligible)}
        </Button>
        {excluded > 0 ? (
          <a
            className="text-[13px] font-semibold text-brand-600 hover:underline"
            href={`/app/exports?kind=import-errors&importId=${preview.importId}`}
          >
            {t.contacts.importPanel.downloadExcluded(excluded)}
          </a>
        ) : null}
        <p className="min-w-0 flex-1 text-[12.5px] text-muted">
          {t.contacts.importPanel.recheckNote}
        </p>
      </div>
    </div>
  );
}
