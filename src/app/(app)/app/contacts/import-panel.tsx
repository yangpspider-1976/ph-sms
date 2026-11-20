"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  commitImportAction,
  uploadContactsAction,
  type ImportActionResult,
} from "@/server/actions/contacts";
import type { ImportPreview } from "@/server/domain/contacts";
import type { ColumnChoice } from "@/server/domain/csv";
import type { ContactField } from "@/server/config";
import type { Dictionary } from "@/i18n/dictionaries";
import {
  Button,
  Card,
  DataTable,
  Notice,
  Pill,
  Select,
} from "@/components/ui";
import { IconDocument } from "@/components/icons";
import { FileDrop } from "@/components/file-drop";
import { ScrollRegion } from "@/components/scroll-region";
import { useLocale, useServerText, useT } from "@/i18n/client";
import { keepValuesOnSubmit } from "@/components/form-submit";

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
  const localizeServerText = useServerText();
  const { tag } = useLocale();
  const maxMiB = Math.round(maxUploadBytes / 1024 / 1024);

  const [result, setResult] = useState<ImportActionResult | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [committed, setCommitted] = useState<string | null>(null);
  // The file's columns while the customer matches them; null when not asked.
  const [columns, setColumns] = useState<ColumnChoice[] | null>(null);
  // Remounts the matching table, so each showing starts from its own choices.
  const [matchRound, setMatchRound] = useState(0);
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
      setColumns(!outcome.ok && outcome.columns ? outcome.columns : null);
      setMatchRound((round) => round + 1);
    });
  }

  function changeMatching(choices: ColumnChoice[]) {
    setColumns(choices);
    setMatchRound((round) => round + 1);
  }

  // Shown inside the matching table, beside the choices it is about.
  const matchError =
    result && !result.ok && result.columns && result.code !== "NEEDS_MAPPING"
      ? result.message
      : null;

  function commit() {
    if (!preview) return;
    startTransition(async () => {
      const outcome = await commitImportAction(preview.importId);
      if (outcome.ok) {
        setCommitted(
          t.contactsExtra.importCommitted(outcome.added, outcome.updated, outcome.skippedSuppressed),
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

      <form ref={formRef} action={upload} onSubmit={keepValuesOnSubmit(upload)} className="mt-4 space-y-3">
        <FileDrop
          id="contacts-file"
          name="file"
          accept=".csv,text/csv"
          required
          title={t.contacts.importPanel.chooseFile}
          hint={t.contactsExtra.fileLimits(maxMiB, maxDataRows.toLocaleString(tag))}
          // Choices made for one file mean nothing for the next.
          onFile={() => setColumns(null)}
        />

        {columns ? <ColumnMatcher key={matchRound} columns={columns} error={matchError} /> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending
              ? t.contacts.importPanel.reading
              : columns
                ? t.contacts.importPanel.previewWithColumns
                : t.contacts.importPanel.upload}
          </Button>
          {/* A plain link: the router would fetch the file once before downloading it. */}
          <a
            href="/app/exports?kind=template"
            className="flex items-center gap-1.5 py-1 text-[13px] font-semibold text-brand-600 hover:underline"
          >
            <IconDocument size={15} /> {t.send.downloadTemplate}
          </a>
        </div>
      </form>

      {committed ? (
        <div className="mt-4">
          <Notice tone="success" title={t.contacts.importPanel.completeTitle}>
            {committed}
          </Notice>
        </div>
      ) : null}

      {result && !result.ok && !result.columns ? (
        <div className="mt-4">
          <Notice tone="danger" title={t.contacts.importPanel.failedTitle}>
            {localizeServerText(result.message)}
            {result.detail && result.detail.length > 0 ? (
              <ul className="mt-2 list-disc pl-4">
                {result.detail.slice(0, 5).map((d) => (
                  <li key={d}>{localizeServerText(d)}</li>
                ))}
              </ul>
            ) : null}
          </Notice>
        </div>
      ) : null}

      {preview ? (
        <Preview
          preview={preview}
          onCommit={commit}
          onChangeMatching={() => changeMatching(preview.columns)}
          pending={pending}
        />
      ) : null}
    </Card>
  );
}

/** Every field a column can be imported as, in the order the choice lists them. */
const FIELDS: ContactField[] = [
  "phone_number",
  "first_name",
  "last_name",
  "custom_1",
  "custom_2",
  "custom_3",
  "custom_4",
  "custom_5",
  "consent_source",
  "consent_date",
];

/** A field in the words the preview uses for it. */
function fieldLabel(t: Dictionary, field: ContactField): string {
  switch (field) {
    case "phone_number":
      return t.serverText.columnPhone;
    case "first_name":
      return t.serverText.columnFirstName;
    case "last_name":
      return t.serverText.columnLastName;
    case "consent_source":
      return t.serverText.columnConsentSource;
    case "consent_date":
      return t.serverText.columnConsentDate;
    default:
      return t.serverText.columnCustom(field.slice("custom_".length));
  }
}

/**
 * What each column of the file holds (REC-02). The choices are fields of the
 * upload form, `column_<position>`, sent with the same file when the customer
 * previews again.
 */
function ColumnMatcher({ columns, error }: { columns: ColumnChoice[]; error: string | null }) {
  const t = useT();
  const localizeServerText = useServerText();
  const panel = t.contacts.importPanel;

  return (
    <div className="border border-line">
      <div className="px-4 py-3">
        <p className="text-[13.5px] font-bold text-ink">{panel.matchTitle}</p>
        <p className="mt-0.5 text-[12.5px] text-muted">{panel.matchIntro}</p>
        {error ? (
          <p role="alert" className="mt-2 text-[12.5px] font-semibold text-danger-fg">
            {localizeServerText(error)}
          </p>
        ) : null}
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>{panel.colColumn}</th>
            <th>{panel.colExamples}</th>
            <th>{panel.colImportAs}</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((column) => (
            <tr key={column.index}>
              <td className="cell-title font-mono text-[12.5px]" title={column.header}>
                {column.header || "—"}
              </td>
              <td className="cell-title text-muted" title={column.samples.join(", ")}>
                {column.samples.join(", ") || "—"}
              </td>
              <td>
                <Select
                  name={`column_${column.index}`}
                  defaultValue={column.field ?? ""}
                  aria-label={panel.importAsLabel(column.header)}
                  className="min-w-44"
                >
                  <option value="">{panel.dontImport}</option>
                  {FIELDS.map((field) => (
                    <option key={field} value={field}>
                      {fieldLabel(t, field)}
                    </option>
                  ))}
                </Select>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

function Preview({
  preview,
  onCommit,
  onChangeMatching,
  pending,
}: {
  preview: ImportPreview;
  onCommit: () => void;
  onChangeMatching: () => void;
  pending: boolean;
}) {
  const t = useT();
  const localizeServerText = useServerText();
  const { counts } = preview;
  const excluded = counts.blank + counts.invalid + counts.duplicate + counts.suppressed;

  return (
    <div className="mt-5 border border-line">
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12.5px] font-semibold text-ink">
            {t.contacts.importPanel.columnMappingTitle}
          </p>
          <button
            type="button"
            onClick={onChangeMatching}
            className="text-[12.5px] font-semibold text-brand-600 hover:underline"
          >
            {t.contacts.importPanel.changeMatching}
          </button>
        </div>
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
                {localizeServerText(column.field)}
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

      {/* The preview scrolls down as well as sideways, and has nothing in it
          to tab to. */}
      <ScrollRegion className="max-h-72 overflow-auto border-t border-line">
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
                <td
                  className="cell-title font-mono text-[12px]"
                  title={row.masked ? undefined : row.raw || undefined}
                >
                  {row.masked ?? (row.raw || "—")}
                </td>
                <td>
                  <Pill tone={row.status === "ELIGIBLE" ? "success" : "neutral"}>
                    {(t.status.importRow as Record<string, string>)[row.status] ??
                      t.status.unknown(row.status)}
                  </Pill>
                </td>
                <td className="text-muted">{localizeServerText(row.reason) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </ScrollRegion>

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
