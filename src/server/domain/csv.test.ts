import { describe, expect, it } from "vitest";
import { MOCK_DEFAULTS } from "@/server/config";
import { escapeCsvCell, parseContactCsv, toCsv } from "./csv";

const cfg = MOCK_DEFAULTS;
const buf = (s: string) => Buffer.from(s, "utf8");
const withBom = (s: string) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buf(s)]);

const ok = (result: ReturnType<typeof parseContactCsv>) => {
  if (!result.ok) throw new Error(`expected parse to succeed, got ${result.code}`);
  return result;
};
const bad = (result: ReturnType<typeof parseContactCsv>) => {
  if (result.ok) throw new Error("expected parse to fail");
  return result;
};

describe("encoding and file shape", () => {
  it("parses UTF-8 with and without a BOM identically", () => {
    const csv = "phone_number,first_name\n09171234567,Ana\n";
    const plain = ok(parseContactCsv(buf(csv), cfg));
    const bom = ok(parseContactCsv(withBom(csv), cfg));
    expect(plain.counts.eligible).toBe(1);
    expect(bom.counts.eligible).toBe(1);
    expect(bom.headers).toEqual(["phone_number", "first_name"]);
    expect(bom.rows[0].firstName).toBe("Ana");
  });

  it("handles quoted fields with embedded commas and newlines", () => {
    const csv =
      'phone_number,first_name,custom_1\n09171234567,"Reyes, Ana","line one\nline two"\n';
    const r = ok(parseContactCsv(buf(csv), cfg));
    expect(r.counts.eligible).toBe(1);
    expect(r.rows[0].firstName).toBe("Reyes, Ana");
    expect(r.rows[0].custom.custom_1).toBe("line one\nline two");
  });

  it("rejects invalid UTF-8", () => {
    const bytes = Buffer.concat([buf("phone_number\n0917123"), Buffer.from([0xff, 0xfe]), buf("4567\n")]);
    expect(bad(parseContactCsv(bytes, cfg)).code).toBe("NOT_UTF8");
  });

  it("rejects NUL bytes", () => {
    const bytes = Buffer.concat([buf("phone_number\n0917"), Buffer.from([0x00]), buf("1234567\n")]);
    expect(bad(parseContactCsv(bytes, cfg)).code).toBe("NUL_BYTES");
  });

  it("rejects a spreadsheet file renamed to .csv", () => {
    const xlsx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), buf("junk")]);
    expect(bad(parseContactCsv(xlsx, cfg)).code).toBe("UNSUPPORTED_FORMAT");
    const xls = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
    expect(bad(parseContactCsv(xls, cfg)).code).toBe("UNSUPPORTED_FORMAT");
  });

  it("rejects broken quoting rather than guessing", () => {
    const csv = 'phone_number,first_name\n09171234567,"unterminated\n09181234567,Ana\n';
    expect(bad(parseContactCsv(buf(csv), cfg)).code).toBe("BROKEN_QUOTING");
  });

  it("rejects an empty file", () => {
    expect(bad(parseContactCsv(buf(""), cfg)).code).toBe("EMPTY_FILE");
  });

  it("rejects a file over the size limit", () => {
    const big = Buffer.alloc(cfg.maxUploadBytes + 1, 0x61);
    expect(bad(parseContactCsv(big, cfg)).code).toBe("TOO_LARGE");
  });

  it("rejects more data rows than the configured limit", () => {
    const small = { ...cfg, maxDataRows: 3 };
    const csv = "phone_number\n09171234567\n09181234567\n09191234567\n09201234567\n";
    expect(bad(parseContactCsv(buf(csv), small)).code).toBe("TOO_MANY_ROWS");
  });
});

describe("headers", () => {
  it("trims and lowercases header names", () => {
    const csv = "  Phone_Number ,  First_Name \n09171234567,Ana\n";
    const r = ok(parseContactCsv(buf(csv), cfg));
    expect(r.headers).toEqual(["phone_number", "first_name"]);
    expect(r.counts.eligible).toBe(1);
  });

  it("rejects a missing required column", () => {
    const csv = "mobile,first_name\n09171234567,Ana\n";
    expect(bad(parseContactCsv(buf(csv), cfg)).code).toBe("MISSING_REQUIRED_COLUMN");
  });

  it("rejects duplicate headers", () => {
    const csv = "phone_number,phone_number\n09171234567,09181234567\n";
    expect(bad(parseContactCsv(buf(csv), cfg)).code).toBe("DUPLICATE_HEADER");
  });

  it("requires explicit confirmation before ignoring unknown columns", () => {
    const csv = "phone_number,loyalty_tier\n09171234567,gold\n";
    const first = bad(parseContactCsv(buf(csv), cfg));
    expect(first.code).toBe("UNKNOWN_COLUMNS");
    expect(first.detail).toEqual(["loyalty_tier"]);

    const confirmed = ok(
      parseContactCsv(buf(csv), cfg, { acknowledgedUnknownColumns: true }),
    );
    expect(confirmed.unknownColumns).toEqual(["loyalty_tier"]);
    expect(confirmed.counts.eligible).toBe(1);
  });
});

describe("row classification", () => {
  it("assigns one mutually exclusive reason per row and keeps the source row number", () => {
    const csv = [
      "phone_number,first_name",
      "09171234567,Ana", // row 2 eligible
      ",Blank", // row 3 blank
      "not-a-number,Bad", // row 4 invalid
      "+639171234567,Dup", // row 5 duplicate of row 2
      "0281234567,Landline", // row 6 invalid (not mobile)
      "09181234567,Ben", // row 7 eligible
    ].join("\n");
    const r = ok(parseContactCsv(buf(csv), cfg));

    expect(r.counts).toEqual({ rawRows: 6, eligible: 2, blank: 1, invalid: 2, duplicate: 1 });
    expect(r.rows.map((x) => [x.sourceRowNumber, x.status])).toEqual([
      [2, "ELIGIBLE"],
      [3, "BLANK"],
      [4, "INVALID"],
      [5, "DUPLICATE"],
      [6, "INVALID"],
      [7, "ELIGIBLE"],
    ]);
    // Every classified row carries exactly one status and the totals reconcile.
    const { rawRows, ...rest } = r.counts;
    expect(Object.values(rest).reduce((a, b) => a + b, 0)).toBe(rawRows);
  });

  it("deduplicates after normalization and discloses the conflicting row", () => {
    const csv = "phone_number\n09171234567\n+63 917 123 4567\n639171234567\n";
    const r = ok(parseContactCsv(buf(csv), cfg));
    expect(r.counts.eligible).toBe(1);
    expect(r.counts.duplicate).toBe(2);
    expect(r.rows[1].reasonDetail).toBe("Same number as row 2");
    expect(r.rows[2].reasonDetail).toBe("Same number as row 2");
  });

  it("never coerces a phone number into a number", () => {
    const csv = "phone_number\n09171234567\n";
    const r = ok(parseContactCsv(buf(csv), cfg));
    expect(r.rows[0].rawValue).toBe("09171234567");
    expect(typeof r.rows[0].rawValue).toBe("string");
  });

  it("truncates over-long optional fields at the configured limits", () => {
    const longName = "x".repeat(400);
    const csv = `phone_number,first_name,custom_1\n09171234567,${longName},${"y".repeat(900)}\n`;
    const r = ok(parseContactCsv(buf(csv), cfg));
    expect(r.rows[0].firstName).toHaveLength(cfg.maxNameLength);
    expect(r.rows[0].custom.custom_1).toHaveLength(cfg.maxFieldLength);
  });
});

describe("formula-safe export", () => {
  it("neutralizes every dangerous prefix", () => {
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    expect(escapeCsvCell("+639171234567")).toBe("'+639171234567");
    expect(escapeCsvCell("-2+3")).toBe("'-2+3");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvCell("\tcmd")).toBe("'\tcmd");
  });

  it("leaves ordinary values untouched", () => {
    expect(escapeCsvCell("Ana Reyes")).toBe("Ana Reyes");
    expect(escapeCsvCell("+63 917 *** 4567")).toBe("'+63 917 *** 4567");
    expect(escapeCsvCell(42)).toBe("42");
    expect(escapeCsvCell(null)).toBe("");
  });

  it("quotes cells containing commas, quotes or newlines", () => {
    const csv = toCsv(["a", "b"], [["Reyes, Ana", 'He said "hi"'], ["line\nbreak", "ok"]]);
    expect(csv).toContain('"Reyes, Ana"');
    expect(csv).toContain('"He said ""hi"""');
    expect(csv).toContain('"line\nbreak"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("produces an export that a spreadsheet cannot evaluate", () => {
    const csv = toCsv(["phone_number", "note"], [["+639171234567", "=cmd|'/c calc'!A0"]]);
    for (const line of csv.trim().split("\r\n").slice(1)) {
      for (const cell of line.split(",")) {
        expect(cell.replace(/^"/, "").startsWith("=")).toBe(false);
      }
    }
  });
});
