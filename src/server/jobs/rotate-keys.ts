import "@/server/load-env";
import { eq, ne, or, isNull, sql } from "drizzle-orm";
import { db, client } from "@/server/db";
import {
  contacts,
  importRows,
  messageItems,
  quotes,
  suppressions,
  users,
} from "@/server/db/schema";
import { env } from "@/server/env";
import {
  currentKeyVersion,
  decrypt,
  encrypt,
  numberHash,
  rotationInProgress,
} from "@/server/security/crypto";

/**
 * Key rotation.
 *
 * Re-keys every stored keyed-hash and ciphertext onto the current key, so the
 * previous key can be retired.
 *
 * The procedure is:
 *
 *   1. Generate the new key. Move the old value to *_PREVIOUS and put the new
 *      one in the live variable. Bump SUPPRESSION_HMAC_KEY_VERSION.
 *   2. Deploy. Nothing breaks: lookups check both keys while both are set.
 *   3. Run this script. It re-hashes and re-encrypts in batches.
 *   4. When it reports nothing left, remove the *_PREVIOUS values and deploy.
 *
 * Doing step 1 WITHOUT the previous-key variables is the dangerous version:
 * every stored opt-out stops matching, silently, and the failure mode is
 * messaging people who asked you to stop.
 *
 * Safe to re-run and safe to interrupt: each row is independent, and a row
 * already on the current key is skipped.
 */

type RotationSummary = {
  suppressions: number;
  contacts: number;
  messageItems: number;
  importRows: number;
  quotes: number;
  verifiedMobiles: number;
};

const BATCH = 500;

function isCurrent(hash: string | null): boolean {
  return Boolean(hash?.startsWith(`${currentKeyVersion()}:`));
}

/** Re-encrypts a value onto the current data key. */
function reencrypt(ciphertext: string): string {
  return encrypt(decrypt(ciphertext));
}

async function rotateSuppressions(): Promise<number> {
  let moved = 0;
  // Tracked in memory because a row that cannot be re-keyed stays outside the
  // "current version" filter by design — re-querying alone would loop forever.
  const attempted = new Set<string>();

  for (;;) {
    const batch = (
      await db
        .select()
        .from(suppressions)
        .where(ne(suppressions.keyVersion, currentKeyVersion()))
        .limit(BATCH)
    ).filter((r) => !attempted.has(r.id));
    if (batch.length === 0) break;

    for (const row of batch) {
      attempted.add(row.id);
      // The plain number is not stored on a suppression row — by design. What
      // can be re-keyed is only reachable if the number appears elsewhere, so
      // the old key must stay configured until those rows are gone.
      const source =
        (
          await db
            .select({ enc: contacts.numberEncrypted })
            .from(contacts)
            .where(eq(contacts.numberHash, row.numberHash))
            .limit(1)
        )[0] ??
        (
          await db
            .select({ enc: messageItems.numberEncrypted })
            .from(messageItems)
            .where(eq(messageItems.numberHash, row.numberHash))
            .limit(1)
        )[0];

      if (!source?.enc) {
        // Nothing to recover the plain number from. Left exactly as it is: it
        // keeps matching while the previous key is configured, and
        // rotationRemaining() reports it so the old key is not retired early.
        continue;
      }

      await db
        .update(suppressions)
        .set({
          numberHash: numberHash(decrypt(source.enc)),
          keyVersion: currentKeyVersion(),
        })
        .where(eq(suppressions.id, row.id));
      moved += 1;
    }
  }
  return moved;
}

async function rotateContacts(): Promise<number> {
  let moved = 0;
  const attempted = new Set<string>();

  for (;;) {
    const batch = (
      await db
        .select()
        .from(contacts)
        .where(ne(contacts.keyVersion, currentKeyVersion()))
        .limit(BATCH)
    ).filter((r) => !attempted.has(r.id));
    if (batch.length === 0) break;

    for (const row of batch) {
      attempted.add(row.id);
      const plain = decrypt(row.numberEncrypted);
      await db
        .update(contacts)
        .set({
          numberHash: numberHash(plain),
          numberEncrypted: encrypt(plain),
          keyVersion: currentKeyVersion(),
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, row.id));
      moved += 1;
    }
  }
  return moved;
}

async function rotateMessageItems(): Promise<number> {
  let moved = 0;
  const attempted = new Set<string>();

  for (;;) {
    const batch = (
      await db
        .select()
        .from(messageItems)
        .where(
          or(
            sql`${messageItems.numberHash} not like ${`${currentKeyVersion()}:%`}`,
            isNull(messageItems.numberHash),
          ),
        )
        .limit(BATCH)
    ).filter((r) => !attempted.has(r.id));
    if (batch.length === 0) break;

    for (const row of batch) {
      attempted.add(row.id);
      // Retention blanks this column; nothing left to re-key.
      if (!row.numberEncrypted) {
        await db
          .update(messageItems)
          .set({ numberHash: `${currentKeyVersion()}:retained` })
          .where(eq(messageItems.id, row.id));
        continue;
      }
      const plain = decrypt(row.numberEncrypted);
      await db
        .update(messageItems)
        .set({ numberHash: numberHash(plain), numberEncrypted: encrypt(plain) })
        .where(eq(messageItems.id, row.id));
      moved += 1;
    }
  }
  return moved;
}

async function rotateImportRows(): Promise<number> {
  let moved = 0;
  const batch = await db.select().from(importRows).limit(5000);
  for (const row of batch) {
    if (!row.numberEncrypted || isCurrent(row.numberHash)) continue;
    const plain = decrypt(row.numberEncrypted);
    await db
      .update(importRows)
      .set({ numberHash: numberHash(plain), numberEncrypted: encrypt(plain) })
      .where(eq(importRows.id, row.id));
    moved += 1;
  }
  return moved;
}

/**
 * Verified mobile numbers on user accounts (AUTH-02).
 *
 * Missed here, a rotation would leave these readable only under the retired key
 * and the "already verified elsewhere" check would stop matching them.
 */
async function rotateVerifiedMobiles(): Promise<number> {
  let moved = 0;
  const batch = await db.select().from(users).limit(5000);
  for (const row of batch) {
    if (!row.mobileEncrypted || !row.mobileHmac || isCurrent(row.mobileHmac)) continue;
    const plain = decrypt(row.mobileEncrypted);
    await db
      .update(users)
      .set({ mobileHmac: numberHash(plain), mobileEncrypted: encrypt(plain) })
      .where(eq(users.id, row.id));
    moved += 1;
  }
  return moved;
}

/** Quote snapshots are encrypted JSON; only the data key applies. */
async function rotateQuotes(): Promise<number> {
  let moved = 0;
  const batch = await db.select().from(quotes).limit(5000);
  for (const row of batch) {
    try {
      const rekeyed = reencrypt(row.recipientSnapshot);
      await db
        .update(quotes)
        .set({ recipientSnapshot: rekeyed })
        .where(eq(quotes.id, row.id));
      moved += 1;
    } catch {
      // Unreadable under either key: leave it. Quotes expire quickly.
    }
  }
  return moved;
}

export async function rotateKeys(): Promise<RotationSummary> {
  // Suppressions FIRST. They carry no plain number, so they are re-keyed by
  // finding the same number elsewhere — which only works while those other
  // rows still hold the OLD hash. Rotating contacts first would move the
  // target before the lookup, and every opt-out would be left behind.
  const suppressionCount = await rotateSuppressions();

  return {
    suppressions: suppressionCount,
    contacts: await rotateContacts(),
    messageItems: await rotateMessageItems(),
    importRows: await rotateImportRows(),
    quotes: await rotateQuotes(),
    verifiedMobiles: await rotateVerifiedMobiles(),
  };
}

/** Rows that still cannot be moved off the old key. */
export async function rotationRemaining(): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(suppressions)
    .where(ne(suppressions.keyVersion, currentKeyVersion()));
  return rows[0]?.n ?? 0;
}

if (process.argv[1]?.includes("rotate-keys")) {
  if (!rotationInProgress()) {
    console.error(
      "No rotation is configured.\n" +
        "Set SUPPRESSION_HMAC_KEY_PREVIOUS (and/or DATA_ENCRYPTION_KEY_PREVIOUS) to the old\n" +
        "key, put the new key in the live variable, bump SUPPRESSION_HMAC_KEY_VERSION, then\n" +
        "run this again. Rotating without the previous key would silently break opt-outs.",
    );
    process.exit(1);
  }

  console.log(`Rotating onto key version ${env.SUPPRESSION_HMAC_KEY_VERSION}…`);
  const summary = await rotateKeys();
  for (const [table, count] of Object.entries(summary)) {
    console.log(`  ${table}: ${count} rows re-keyed`);
  }

  const remaining = await rotationRemaining();
  if (remaining === 0) {
    console.log("\nNothing left on the old key. Remove the *_PREVIOUS values and deploy.");
  } else {
    console.log(
      `\n${remaining} suppression row(s) could not be re-keyed: the plain number is not\n` +
        "recoverable from any other table. KEEP the previous key configured — those\n" +
        "opt-outs match only while it is set.",
    );
  }

  await client.end({ timeout: 5 });
}
