import "server-only";
import { and, eq, inArray, or, isNull } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import { suppressions } from "@/server/db/schema";
import {
  currentKeyVersion,
  numberHash,
  numberHashCandidates,
} from "@/server/security/crypto";
import { maskNormalized } from "./phone";

/**
 * Opt-out and safety blocks.
 *
 * Two separate things share this table:
 *   - ORGANIZATION: the recipient told *that business* to stop. Visible only to
 *     that tenant.
 *   - PLATFORM: a separately authorized platform-wide safety/abuse block.
 *
 * A business can never create a platform block, and can never see another
 * business's list. Matching is on the keyed hash, so a retained opt-out does
 * not have to keep the plain number.
 */

export type SuppressionHit = {
  numberHash: string;
  scope: "ORGANIZATION" | "PLATFORM";
};

/**
 * Which of these numbers must not be sent to for this organization.
 * Returns the org's own opt-outs plus platform blocks — nothing from any other
 * tenant.
 */
export async function findSuppressed(
  tx: DbOrTx,
  organizationId: string,
  numberHashes: string[],
): Promise<Map<string, "ORGANIZATION" | "PLATFORM">> {
  const hits = new Map<string, "ORGANIZATION" | "PLATFORM">();
  if (numberHashes.length === 0) return hits;

  const rows = await tx
    .select({ numberHash: suppressions.numberHash, scope: suppressions.scope })
    .from(suppressions)
    .where(
      and(
        inArray(suppressions.numberHash, numberHashes),
        or(
          eq(suppressions.scope, "PLATFORM"),
          and(
            eq(suppressions.scope, "ORGANIZATION"),
            eq(suppressions.organizationId, organizationId),
          ),
        ),
      ),
    );

  for (const row of rows) {
    // A platform block outranks an organization opt-out in the reason shown.
    if (row.scope === "PLATFORM" || !hits.has(row.numberHash)) {
      hits.set(row.numberHash, row.scope);
    }
  }
  return hits;
}

/** Single-number check used immediately before each outbound submission. */
export async function isSuppressed(
  tx: DbOrTx,
  organizationId: string,
  hash: string,
): Promise<boolean> {
  const hits = await findSuppressed(tx, organizationId, [hash]);
  return hits.has(hash);
}

/**
 * Checks a plain number against every key version it could be stored under.
 *
 * Use this wherever the normalized number is in hand. During a key rotation the
 * hash computed with the current key will not match rows written under the old
 * one, and the consequence of a miss is messaging someone who opted out.
 */
export async function isSuppressedNumber(
  tx: DbOrTx,
  organizationId: string,
  normalized: string,
): Promise<boolean> {
  const candidates = numberHashCandidates(normalized);
  const hits = await findSuppressed(tx, organizationId, candidates);
  return candidates.some((c) => hits.has(c));
}

/**
 * Which of these plain numbers are suppressed, checked across every key version.
 *
 * Preferred over `findSuppressed` wherever the normalized numbers are in hand:
 * it does the key-version bookkeeping once, here, rather than at each call site
 * where it is easy to forget.
 */
export async function findSuppressedNumbers(
  tx: DbOrTx,
  organizationId: string,
  normalized: string[],
): Promise<Set<string>> {
  if (normalized.length === 0) return new Set();

  const byCandidate = new Map<string, string>();
  for (const number of normalized) {
    for (const candidate of numberHashCandidates(number)) {
      byCandidate.set(candidate, number);
    }
  }

  const hits = await findSuppressed(tx, organizationId, [...byCandidate.keys()]);
  const suppressed = new Set<string>();
  for (const candidate of hits.keys()) {
    const number = byCandidate.get(candidate);
    if (number) suppressed.add(number);
  }
  return suppressed;
}

/**
 * Records an opt-out. Deleting or re-importing a contact never touches these
 * rows, so a customer cannot clear their suppression list by round-tripping a
 * CSV.
 */
export async function addSuppression(
  tx: DbOrTx,
  input: {
    normalized: string;
    scope: "ORGANIZATION" | "PLATFORM";
    organizationId: string | null;
    reason: string;
    source: "OPERATOR_INTAKE" | "INBOUND_REPLY" | "WEB_OPT_OUT" | "ADMIN";
    evidenceRef?: string | null;
    createdBy?: string | null;
  },
): Promise<{ created: boolean }> {
  if (input.scope === "PLATFORM" && input.organizationId !== null) {
    throw new Error("A platform suppression row must not belong to an organization.");
  }
  if (input.scope === "ORGANIZATION" && !input.organizationId) {
    throw new Error("An organization suppression row needs an organization.");
  }

  const inserted = await tx
    .insert(suppressions)
    .values({
      scope: input.scope,
      organizationId: input.organizationId,
      numberHash: numberHash(input.normalized),
      numberMasked: maskNormalized(input.normalized),
      keyVersion: currentKeyVersion(),
      reason: input.reason,
      source: input.source,
      evidenceRef: input.evidenceRef ?? null,
      createdBy: input.createdBy ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: suppressions.id });

  return { created: inserted.length > 0 };
}

/** An organization's own opt-out list. Never returns another tenant's rows. */
export async function listOrganizationSuppressions(
  organizationId: string,
  limit = 100,
) {
  return db
    .select()
    .from(suppressions)
    .where(
      and(
        eq(suppressions.scope, "ORGANIZATION"),
        eq(suppressions.organizationId, organizationId),
      ),
    )
    .limit(limit);
}

/** Platform-wide blocks. Admin surface only. */
export async function listPlatformSuppressions(limit = 100) {
  return db
    .select()
    .from(suppressions)
    .where(and(eq(suppressions.scope, "PLATFORM"), isNull(suppressions.organizationId)))
    .limit(limit);
}
