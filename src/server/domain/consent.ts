import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { contacts } from "@/server/db/schema";
import { numberHashCandidates } from "@/server/security/crypto";

/** Promotional sending requires a recorded source; suppression always takes precedence. */
export async function hasRecordedConsent(tx: DbOrTx, organizationId: string, numbers: string[]): Promise<boolean> {
  if (!numbers.length) return false;
  const rows = await tx.select({ hash: contacts.numberHash, source: contacts.consentSource })
    .from(contacts).where(and(eq(contacts.organizationId, organizationId),
      inArray(contacts.numberHash, numbers.flatMap(numberHashCandidates))));
  const consented = new Set(rows.filter((row) => row.source?.trim()).map((row) => row.hash));
  return numbers.every((number) => numberHashCandidates(number).some((hash) => consented.has(hash)));
}
