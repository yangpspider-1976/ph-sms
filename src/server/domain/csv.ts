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
import { CONTACT_FIELDS, type AppConfig, type ContactField } from "@/server/config";
import { maskNormalized, normalizePhone, REJECTION_TEXT, type PhoneRejection } from "./phone";
import { enServerText } from "@/i18n/locales/en-server-text";

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

/**
 * One column of an uploaded file and what it will be imported as (REC-02):
 * a field, or null when it is left out. `samples` are the first few values,
 * with anything that reads as a mobile number masked, so the customer can see
 * which column is which without the page showing full numbers.
 */
export type ColumnChoice = {
  index: number;
  header: string;
  field: ContactField | null;
  samples: string[];
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
    | "NEEDS_MAPPING"
    | "COLUMN_CHOSEN_TWICE";
  message: string;
  detail?: string[];
  /** The file's columns, when the customer is asked to match them. */
  columns?: ColumnChoice[];
};

export type CsvParseSuccess = {
  ok: true;
  rows: ParsedRow[];
  headers: string[];
  /** Columns left out of the import. */
  unknownColumns: string[];
  /** What every column was imported as. */
  columns: ColumnChoice[];
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

/**
 * A header in the form names are compared in: lower case, with spaces,
 * underscores, dashes and dots all one space. "Phone_Number", "phone number"
 * and "Phone-number" are the same column.
 */
export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_\-.]+/g, " ").trim();
}

/** What a field holds, in the words the upload preview uses for it. */
export function columnMeaning(field: ContactField): string {
  switch (field) {
    case "phone_number":
      return enServerText.columnPhone;
    case "first_name":
      return enServerText.columnFirstName;
    case "last_name":
      return enServerText.columnLastName;
    case "consent_source":
      return enServerText.columnConsentSource;
    case "consent_date":
      return enServerText.columnConsentDate;
    default:
      return enServerText.columnCustom(field.slice("custom_".length));
  }
}

/**
 * Names a column often goes by in a business's own spreadsheet, in their
 * normalizeHeader() form. "name" is not here: it may be a whole name, and
 * guessing would put it in the wrong field. Other languages' names come from
 * the dictionaries, passed in by the caller.
 */
const COMMON_NAMES: ReadonlyMap<string, ContactField> = new Map<string, ContactField>([
  ...["phone", "phone no", "mobile", "mobile no", "mobile number", "mobile phone", "cellphone",
    "cellphone no", "cellphone number", "cell", "cell no", "cell number", "cp", "cp no",
    "cp number", "contact no", "contact number", "msisdn", "number"].map(
    (name) => [name, "phone_number"] as const,
  ),
  ...["firstname", "given name"].map((name) => [name, "first_name"] as const),
  ...["lastname", "surname", "family name"].map((name) => [name, "last_name"] as const),
  ...["consent", "opt in source"].map((name) => [name, "consent_source"] as const),
  ...["opt in date", "date of consent"].map((name) => [name, "consent_date"] as const),
]);

/** The field a header names, by its own name or one of its other names. */
function detectField(
  header: string,
  aliases: ReadonlyMap<string, ContactField>,
): ContactField | null {
  const key = normalizeHeader(header);
  return (
    CONTACT_FIELDS.find((field) => normalizeHeader(field) === key) ??
    aliases.get(key) ??
    COMMON_NAMES.get(key) ??
    null
  );
}

/** Up to three values from a column, masked where they read as mobile numbers. */
function samplesOf(data: string[][], index: number): string[] {
  const samples: string[] = [];
  for (const row of data) {
    const value = String(row[index] ?? "").trim();
    if (value === "") continue;
    const phone = normalizePhone(value);
    samples.push(phone.ok ? maskNormalized(phone.normalized) : value.slice(0, 40));
    if (samples.length === 3) break;
  }
  return samples;
}

export function parseContactCsv(
  bytes: Buffer,
  config: AppConfig,
  options: {
    /**
     * The customer's choice for each column, by position: a field, or null to
     * leave the column out. Without it the columns are matched by name, and a
     * file with a column nobody recognises comes back as NEEDS_MAPPING.
     */
    mapping?: Array<ContactField | null>;
    /** Other names a column may have, keyed by their normalizeHeader() form. */
    aliases?: ReadonlyMap<string, ContactField>;
  } = {},
): CsvParseResult {
  if (bytes.length === 0) return fail("EMPTY_FILE", enServerText.fileEmpty);
  if (bytes.length > config.maxUploadBytes) {
    return fail(
      "TOO_LARGE",
      enServerText.fileTooLarge(String(Math.round(config.maxUploadBytes / (1024 * 1024)))),
    );
  }
  if (looksLikeOfficeDocument(bytes)) {
    return fail(
      "UNSUPPORTED_FORMAT",
      enServerText.spreadsheetNotCsv,
    );
  }
  if (bytes.includes(0x00)) {
    return fail("NUL_BYTES", enServerText.nulBytes);
  }

  const text = decodeUtf8(bytes);
  if (text === null) {
    return fail(
      "NOT_UTF8",
      enServerText.notUtf8,
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
      enServerText.repeatedColumn([...new Set(repeated)].join(", ")),
    );
  }

  // Read as plain rows, so each column is addressed by position: the customer
  // may import a column under a name other than its header.
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
    // Never coerce: a phone number must not become a float, and "007" keeps its zeros.
    dynamicTyping: false,
  });

  const quoteErrors = parsed.errors.filter(
    (e) => e.type === "Quotes" || e.code === "MissingQuotes" || e.code === "InvalidQuotes",
  );
  if (quoteErrors.length > 0) {
    return fail(
      "BROKEN_QUOTING",
      enServerText.brokenQuoting,
      // The parser's own wording is English only; each row is said our way.
      // Its row count includes the header, and people count from 1.
      quoteErrors.slice(0, 5).map((e) => {
        const row = String((e.row ?? 0) + 1);
        return e.code === "MissingQuotes"
          ? enServerText.quoteNotClosed(row)
          : enServerText.quoteMalformed(row);
      }),
    );
  }

  const [headerRow = [], ...table] = parsed.data;
  const headers = headerRow.map((h) => String(h).trim());
  if (headers.length === 0 || headers.every((h) => h === "")) {
    return fail("EMPTY_FILE", enServerText.noHeaderRow);
  }

  if (table.length > config.maxDataRows) {
    return fail(
      "TOO_MANY_ROWS",
      enServerText.tooManyRows(table.length.toLocaleString("en-US"), config.maxDataRows.toLocaleString("en-US")),
    );
  }

  const aliases = options.aliases ?? new Map<string, ContactField>();
  const describe = (fields: Array<ContactField | null>): ColumnChoice[] =>
    headers.map((header, index) => ({
      index,
      header,
      field: fields[index] ?? null,
      samples: samplesOf(table, index),
    }));

  let fields: Array<ContactField | null>;
  if (options.mapping) {
    fields = headers.map((_, index) => {
      const chosen = options.mapping![index];
      return chosen && CONTACT_FIELDS.includes(chosen) ? chosen : null;
    });
  } else {
    // Matched by name. A column nobody recognises, or no column of numbers,
    // is the customer's to resolve: they say what each column holds.
    fields = headers.map((header) => detectField(header, aliases));
    const phoneColumns = fields.filter((f) => f === "phone_number").length;
    if (fields.includes(null) || phoneColumns !== 1) {
      return { ...fail("NEEDS_MAPPING", enServerText.matchColumns), columns: describe(fields) };
    }
  }

  if (!fields.includes("phone_number")) {
    return { ...fail("MISSING_REQUIRED_COLUMN", enServerText.choosePhoneColumn), columns: describe(fields) };
  }
  const twice = CONTACT_FIELDS.find((field) => fields.filter((f) => f === field).length > 1);
  if (twice) {
    return {
      ...fail("COLUMN_CHOSEN_TWICE", enServerText.columnChosenTwice(columnMeaning(twice))),
      columns: describe(fields),
    };
  }

  const columns = describe(fields);
  const unknownColumns = columns.filter((c) => c.field === null).map((c) => c.header);
  const data = table.map((cells) => {
    const record: Partial<Record<ContactField, string>> = {};
    fields.forEach((field, index) => {
      if (field) record[field] = String(cells[index] ?? "");
    });
    return record;
  });

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
      const key = `custom_${i}` as ContactField;
      const v = clamp(record[key], config.maxFieldLength);
      if (v) custom[key] = v;
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

  return { ok: true, rows, headers, unknownColumns, columns, counts };
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
