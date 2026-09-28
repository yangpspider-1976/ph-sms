import "@/server/load-env";
import { performance } from "node:perf_hooks";
import { parseContactCsv, toCsv } from "@/server/domain/csv";
import { normalizePhone } from "@/server/domain/phone";
import { analyzeMessage } from "@/server/domain/segments";
import { MOCK_DEFAULTS } from "@/server/config";
import { encrypt, numberHash } from "@/server/security/crypto";

/**
 * Measures the limits the configuration currently guesses at.
 *
 * The 10,000-row upload cap and the 5 MiB size cap were chosen as round numbers.
 * This turns them into measured ones, so the value in `MOCK_DEFAULTS` is either
 * justified or corrected.
 *
 *   npm run benchmark
 *
 * Single-process, no network. It measures the CPU-bound parts of an import,
 * which is where a large upload actually hurts: parsing, validating, hashing
 * and encrypting every row.
 */

function time<T>(label: string, fn: () => T): { label: string; ms: number; result: T } {
  const start = performance.now();
  const result = fn();
  return { label, ms: performance.now() - start, result };
}

function csvOf(rows: number): Buffer {
  const lines = ["phone_number,first_name,last_name"];
  for (let i = 0; i < rows; i += 1) {
    // Spread across the synthetic block; ~2% deliberately invalid.
    const number = i % 50 === 0 ? "not-a-number" : `+63917${String(1000000 + i).slice(-7)}`;
    lines.push(`${number},First${i},Last${i}`);
  }
  return Buffer.from(lines.join("\n"), "utf8");
}

function report(name: string, ms: number, rows: number) {
  const perRow = (ms / rows) * 1000;
  console.log(
    `  ${name.padEnd(34)} ${ms.toFixed(0).padStart(7)} ms   ${perRow.toFixed(1).padStart(6)} µs/row`,
  );
}

async function main() {
  console.log("Benchmark — single process, no network\n");

  /* --- Phone normalization ---------------------------------------------- */

  console.log("Phone normalization");
  for (const n of [10_000, 100_000]) {
    const inputs = Array.from({ length: n }, (_, i) => `+63917${String(1000000 + i).slice(-7)}`);
    const { ms } = time("normalize", () => inputs.map((x) => normalizePhone(x)));
    report(`${n.toLocaleString()} numbers`, ms, n);
  }

  /* --- Segmentation ------------------------------------------------------ */

  console.log("\nSegmentation");
  const body = "Your order is ready for pickup until 8pm today. Thank you for shopping with us.";
  for (const n of [10_000, 100_000]) {
    const { ms } = time("segments", () => {
      for (let i = 0; i < n; i += 1) analyzeMessage(body);
    });
    report(`${n.toLocaleString()} messages`, ms, n);
  }

  /* --- CSV parsing -------------------------------------------------------- */

  console.log("\nCSV parsing (the current cap is 10,000 rows / 5 MiB)");
  for (const rows of [1_000, 10_000, 50_000]) {
    const bytes = csvOf(rows);
    const config = { ...MOCK_DEFAULTS, maxDataRows: 1_000_000, maxUploadBytes: 64 * 1024 * 1024 };
    const { ms, result } = time("parse", () => parseContactCsv(bytes, config));
    const sizeMiB = (bytes.length / 1024 / 1024).toFixed(2);
    report(`${rows.toLocaleString()} rows (${sizeMiB} MiB)`, ms, rows);
    if (!result.ok) console.log(`      parse failed: ${result.code}`);
  }

  /* --- Per-row crypto, the expensive part -------------------------------- */

  console.log("\nHash + encrypt per row (what an import does to every number)");
  for (const rows of [1_000, 10_000]) {
    const numbers = Array.from(
      { length: rows },
      (_, i) => `+63917${String(1000000 + i).slice(-7)}`,
    );
    const { ms } = time("crypto", () =>
      numbers.map((n) => ({ h: numberHash(n), e: encrypt(n) })),
    );
    report(`${rows.toLocaleString()} rows`, ms, rows);
  }

  /* --- Export ------------------------------------------------------------- */

  console.log("\nFormula-safe CSV export");
  for (const rows of [10_000, 50_000]) {
    const data = Array.from({ length: rows }, (_, i) => [
      `+63 917 *** ${String(1000 + (i % 9000))}`,
      "ACCEPTED",
      "DELIVERED",
      1,
      "1.00",
    ]);
    const { ms } = time("export", () =>
      toCsv(["phone", "submission", "delivery", "segments", "cost"], data),
    );
    report(`${rows.toLocaleString()} rows`, ms, rows);
  }

  /* --- Verdict ------------------------------------------------------------ */

  const bytes = csvOf(MOCK_DEFAULTS.maxDataRows);
  const config = { ...MOCK_DEFAULTS, maxUploadBytes: 64 * 1024 * 1024 };
  const parse = time("cap", () => parseContactCsv(bytes, config));
  const numbers = Array.from(
    { length: MOCK_DEFAULTS.maxDataRows },
    (_, i) => `+63917${String(1000000 + i).slice(-7)}`,
  );
  const crypto = time("cap-crypto", () => numbers.map((n) => ({ h: numberHash(n), e: encrypt(n) })));
  const total = parse.ms + crypto.ms;

  console.log(
    `\nAt the configured cap of ${MOCK_DEFAULTS.maxDataRows.toLocaleString()} rows:` +
      `\n  parse + per-row crypto: ${total.toFixed(0)} ms` +
      `\n  upload size at that row count: ${(bytes.length / 1024 / 1024).toFixed(2)} MiB ` +
      `(cap is ${(MOCK_DEFAULTS.maxUploadBytes / 1024 / 1024).toFixed(0)} MiB)`,
  );

  if (total < 2000) {
    console.log(
      "\n  The row cap is comfortable: well under a request timeout, and the size\n" +
        "  cap binds before the row cap does for a file with optional columns.",
    );
  } else if (total < 10_000) {
    console.log(
      "\n  The row cap is workable but noticeable. Imports at the cap should move\n" +
        "  to the worker before this is offered to customers with large lists.",
    );
  } else {
    console.log(
      "\n  The row cap is too high for synchronous handling. Lower it, or move\n" +
        "  imports to the worker.",
    );
  }
}

await main();
