/**
 * CSV import and export.
 *
 * Parsing uses a real CSV parser (papaparse) so quoted fields, embedded commas
 * and embedded newlines behave correctly — a split(",") implementation silently
 * corrupts exactly the rows a customer cares about.
 *
 * Cells are always treated as text. Nothing here evaluates a formula, and
 * everything written back out is escaped so a spreadsheet will not evaluate one
 * either.
 */
import Papa from "papaparse";
import { CSV_KNOWN_COLUMNS, CSV_REQUIRED_COLUMNS, type AppConfig } from "@/server/config";
import { normalizePhone, REJECTION_TEXT, type PhoneRejection } from "./phone";

export type ParsedRow = {
  sourceRowNumber: number;
  rawValue: string;
  normalized: string | null;
  status: "ELIGIBLE" | "BLANK" | "INVALID" | "DUPLICATE";
  reasonDetail: string | null;
  firstName: string | null;
  lastName: string | null;
  custom: Record<string, string>;
  consentSource: string | null;
  consentDate: string | null;
};

export type CsvParseFailure = {
  ok: false;
  code:
    | "EMPTY_FILE"
    | "NOT_UTF8"
    | "NUL_BYTES"
    | "BROKEN_QUOTING"
    | "MISSING_REQUIRED_COLUMN"
    | "DUPLICATE_HEADER"
    | "TOO_MANY_ROWS"
    | "TOO_LARGE"
    | "UNSUPPORTED_FORMAT"
    | "UNKNOWN_COLUMNS";
  message: string;
  detail?: string[];
};

export type CsvParseSuccess = {
  ok: true;
  rows: ParsedRow[];
  headers: string[];
  unknownColumns: string[];
  counts: {
    rawRows: number;
    eligible: number;
    blank: number;
    invalid: number;
    duplicate: number;
  };
};

export type CsvParseResult = CsvParseSuccess | CsvParseFailure;

const fail = (
  code: CsvParseFailure["code"],
  message: string,
  detail?: string[],
): CsvParseFailure => ({ ok: false, code, message, detail });

/** Office documents are not CSV; renaming one does not make it parseable. */
function looksLikeOfficeDocument(bytes: Buffer): boolean {
  // XLSX/DOCX are ZIP containers ("PK\x03\x04"); legacy XLS is an OLE2 file.
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) return true;
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return bytes.length >= 8 && ole.every((b, i) => bytes[i] === b);
}

function decodeUtf8(bytes: Buffer): string | null {
  // Strip a UTF-8 BOM if present, then decode strictly.
  let view = bytes;
  if (view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) {
    view = view.subarray(3);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(view);
  } catch {
    return null;
  }
}

export function parseContactCsv(
  bytes: Buffer,
  config: AppConfig,
  options: { acknowledgedUnknownColumns?: boolean } = {},
): CsvParseResult {
  if (bytes.length === 0) return fail("EMPTY_FILE", "The file is empty.");
  if (bytes.length > config.maxUploadBytes) {
    return fail(
      "TOO_LARGE",
      `The file is larger than the ${Math.round(config.maxUploadBytes / (1024 * 1024))} MiB limit.`,
    );
  }
  if (looksLikeOfficeDocument(bytes)) {
    return fail(
      "UNSUPPORTED_FORMAT",
      "This is a spreadsheet file, not a CSV. Export it as CSV (UTF-8) and upload again.",
    );
  }
  if (bytes.includes(0x00)) {
    return fail("NUL_BYTES", "The file contains NUL bytes and is not valid text.");
  }

  const text = decodeUtf8(bytes);
  if (text === null) {
    return fail(
      "NOT_UTF8",
      "The file is not valid UTF-8. Re-export it as CSV UTF-8 and upload again.",
    );
  }

  // Duplicate headers must be caught from the raw header row: with header:true
  // the parser silently renames a repeat to "name_1", which would quietly drop
  // one of the two columns instead of reporting the problem.
  const headerScan = Papa.parse<string[]>(text, { header: false, preview: 1 });
  const rawHeaders = (headerScan.data[0] ?? []).map((h) => String(h).trim().toLowerCase());
  const headerSeen = new Set<string>();
  const repeated = rawHeaders.filter((h) =>
    headerSeen.has(h) ? true : (headerSeen.add(h), false),
  );
  if (repeated.length > 0) {
    return fail(
      "DUPLICATE_HEADER",
      `The header row repeats a column: ${[...new Set(repeated)].join(", ")}.`,
    );
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
    // Never coerce: a phone number must not become a float, and "007" keeps its zeros.
    dynamicTyping: false,
  });

  const quoteErrors = parsed.errors.filter(
    (e) => e.type === "Quotes" || e.code === "MissingQuotes" || e.code === "InvalidQuotes",
  );
  if (quoteErrors.length > 0) {
    return fail(
      "BROKEN_QUOTING",
      "The file has an unclosed quoted field, so the rows cannot be read reliably.",
      quoteErrors.slice(0, 5).map((e) => `row ${(e.row ?? 0) + 2}: ${e.message}`),
    );
  }

  const headers = (parsed.meta.fields ?? []).map((h) => h.trim());
  if (headers.length === 0) {
    return fail("EMPTY_FILE", "The file has no header row.");
  }

  const missing = CSV_REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    return fail(
      "MISSING_REQUIRED_COLUMN",
      `The file needs a ${missing.join(", ")} column.`,
      headers,
    );
  }

  const unknownColumns = headers.filter((h) => !CSV_KNOWN_COLUMNS.includes(h));
  if (unknownColumns.length > 0 && !options.acknowledgedUnknownColumns) {
    return fail(
      "UNKNOWN_COLUMNS",
      `This file has columns we do not use: ${unknownColumns.join(", ")}. Confirm that they should be ignored.`,
      unknownColumns,
    );
  }

  const data = parsed.data;
  if (data.length > config.maxDataRows) {
    return fail(
      "TOO_MANY_ROWS",
      `The file has ${data.length.toLocaleString()} data rows; the limit is ${config.maxDataRows.toLocaleString()}.`,
    );
  }

  const rows: ParsedRow[] = [];
  const firstSeenAt = new Map<string, number>();
  const counts = { rawRows: data.length, eligible: 0, blank: 0, invalid: 0, duplicate: 0 };

  const clamp = (value: string | undefined, max: number): string | null => {
    if (value == null) return null;
    const trimmed = value.trim();
    if (trimmed === "") return null;
    return trimmed.slice(0, max);
  };

  data.forEach((record, index) => {
    // +2: one for the header row, one because humans count from 1.
    const sourceRowNumber = index + 2;
    const rawValue = (record.phone_number ?? "").trim();

    const custom: Record<string, string> = {};
    for (let i = 1; i <= 5; i += 1) {
      const v = clamp(record[`custom_${i}`], config.maxFieldLength);
      if (v) custom[`custom_${i}`] = v;
    }

    const base = {
      sourceRowNumber,
      rawValue,
      firstName: clamp(record.first_name, config.maxNameLength),
      lastName: clamp(record.last_name, config.maxNameLength),
      custom,
      consentSource: clamp(record.consent_source, config.maxFieldLength),
      consentDate: clamp(record.consent_date, 64),
    };

    if (rawValue === "") {
      counts.blank += 1;
      rows.push({
        ...base,
        normalized: null,
        status: "BLANK",
        reasonDetail: "No phone number in this row",
      });
      return;
    }

    const result = normalizePhone(rawValue);
    if (!result.ok) {
      counts.invalid += 1;
      rows.push({
        ...base,
        normalized: null,
        status: "INVALID",
        reasonDetail: REJECTION_TEXT[result.reason as PhoneRejection],
      });
      return;
    }

    // First valid row wins; later rows with the same normalized number are
    // duplicates and are disclosed with the row they collide with.
    const firstRow = firstSeenAt.get(result.normalized);
    if (firstRow !== undefined) {
      counts.duplicate += 1;
      rows.push({
        ...base,
        normalized: result.normalized,
        status: "DUPLICATE",
        reasonDetail: `Same number as row ${firstRow}`,
      });
      return;
    }

    firstSeenAt.set(result.normalized, sourceRowNumber);
    counts.eligible += 1;
    rows.push({ ...base, normalized: result.normalized, status: "ELIGIBLE", reasonDetail: null });
  });

  return { ok: true, rows, headers, unknownColumns, counts };
}

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

/** Characters a spreadsheet may treat as the start of a formula. */
const FORMULA_PREFIXES = ["=", "+", "-", "@"];
/** Control characters Excel also honours as formula starters. */
const DANGEROUS_CONTROL = ["\t", "\r", "\n"];

/**
 * Neutralize a cell for export.
 *
 * A leading ' prevents evaluation in Excel, LibreOffice and Sheets. Note this
 * changes the exported text, which is the point — the stored +63… number is
 * untouched internally and is still exported as a readable +63 number because
 * the apostrophe keeps it text rather than a subtraction.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  if (raw === "") return "";
  const first = raw[0] ?? "";
  if (FORMULA_PREFIXES.includes(first) || DANGEROUS_CONTROL.includes(first)) {
    return `'${raw}`;
  }
  return raw;
}

/** Serialize rows to CSV with every cell neutralized and properly quoted. */
export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const quote = (cell: string) => {
    if (/[",\r\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
    return cell;
  };
  const lines = [headers.map((h) => quote(escapeCsvCell(h))).join(",")];
  for (const row of rows) {
    lines.push(row.map((cell) => quote(escapeCsvCell(cell))).join(","));
  }
  // CRLF: what spreadsheet software expects from a CSV export.
  return lines.join("\r\n") + "\r\n";
}
