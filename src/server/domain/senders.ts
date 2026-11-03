import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { senderIdentities } from "@/server/db/schema";

/**
 * An organization's sender identities, newest first, whatever their status.
 *
 * Kept out of the actions file: every export there can be called from a
 * browser, and this trusts the organization id it is given.
 */
export async function listSenders(organizationId: string) {
  return db
    .select()
    .from(senderIdentities)
    .where(eq(senderIdentities.organizationId, organizationId))
    .orderBy(desc(senderIdentities.createdAt));
}
