import "server-only";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/server/db";
import { messageItems, providerEvents } from "@/server/db/schema";
import { getSmsProvider, type DeliveryEvent, type SmsProvider } from "@/server/providers/sms";
import { isUniqueViolation } from "@/server/domain/wallet";

/**
 * Delivery receipt ingestion.
 *
 * Order of operations matters:
 *   1. authenticate the RAW body — an unverified payload is never processed;
 *   2. persist the verified event BEFORE acknowledging, so a crash between
 *      "200 OK" and the write cannot lose it;
 *   3. only then apply it.
 *
 * The organization is resolved from our own stored provider reference, never
 * from anything the payload claims, so a forged tenant id in a callback changes
 * nothing.
 */

/** Terminal states. Once one is recorded it is not overwritten by a later guess. */
const TERMINAL = new Set(["DELIVERED", "UNDELIVERED", "EXPIRED"]);

export type IngestOutcome =
  | { status: "APPLIED"; messageItemId: string; delivery: string }
  | { status: "DUPLICATE" }
  | { status: "IGNORED_STALE"; reason: string }
  | { status: "CONFLICT"; reason: string }
  | { status: "QUARANTINED"; reason: string }
  | { status: "REJECTED"; reason: string };

export async function ingestDeliveryEvent(
  rawBody: string,
  headers: Record<string, string>,
  provider: SmsProvider = getSmsProvider(),
): Promise<IngestOutcome> {
  const providerName = provider.capabilities.name;

  let mapped: DeliveryEvent | null;
  try {
    mapped = provider.verifyAndMapDeliveryEvent(rawBody, headers);
  } catch {
    mapped = null;
  }

  // Unverified or unparseable: record nothing and tell the caller plainly.
  // Storing unauthenticated payloads would let anyone fill the table.
  if (!mapped) return { status: "REJECTED", reason: "Signature or payload not valid" };

  // Persist first. The unique index on (provider, external_event_id) is what
  // makes a replayed or duplicated callback a no-op.
  try {
    await db.insert(providerEvents).values({
      provider: providerName,
      externalEventId: mapped.externalEventId,
      signatureValid: true,
      reference: mapped.reference,
      mappedStatus: mapped.status,
      payload: safeJson(rawBody),
      occurredAt: mapped.occurredAt,
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { status: "DUPLICATE" };
    throw err;
  }

  return applyEvent(providerName, mapped);
}

/** Applies a stored event to its message item. Safe to call again. */
async function applyEvent(
  providerName: string,
  mapped: DeliveryEvent,
): Promise<IngestOutcome> {
  return db.transaction(async (tx) => {
    // Resolved through our own records: the provider's reference, or the stable
    // key we generated. A callback that arrives before the submit response was
    // written still matches on the stable key.
    const item = (
      await tx
        .select()
        .from(messageItems)
        .where(
          or(
            eq(messageItems.partnerReference, mapped.reference),
            eq(messageItems.stableKey, mapped.reference),
          ),
        )
        .limit(1)
    )[0];

    if (!item) {
      await tx
        .update(providerEvents)
        .set({ quarantined: true, outcome: "UNKNOWN_REFERENCE", processedAt: new Date() })
        .where(
          and(
            eq(providerEvents.provider, providerName),
            eq(providerEvents.externalEventId, mapped.externalEventId),
          ),
        );
      return { status: "QUARANTINED", reason: "No message matches that reference" };
    }

    const finish = async (outcome: string) => {
      await tx
        .update(providerEvents)
        .set({ messageItemId: item.id, outcome, processedAt: new Date() })
        .where(
          and(
            eq(providerEvents.provider, providerName),
            eq(providerEvents.externalEventId, mapped.externalEventId),
          ),
        );
    };

    // A late PENDING or ACCEPTED must never undo a recorded delivery.
    if (!TERMINAL.has(mapped.status)) {
      if (TERMINAL.has(item.deliveryStatus)) {
        await finish("IGNORED_STALE");
        return {
          status: "IGNORED_STALE",
          reason: `${item.deliveryStatus} is terminal; a ${mapped.status} event does not reopen it`,
        };
      }
      await finish("NO_CHANGE");
      return { status: "IGNORED_STALE", reason: "Non-terminal event, nothing to record" };
    }

    // Two different terminal results for one message is a provider problem, not
    // something to resolve by overwriting. The first stands; the second is
    // flagged for an operator.
    if (TERMINAL.has(item.deliveryStatus)) {
      if (item.deliveryStatus === mapped.status) {
        await finish("DUPLICATE_TERMINAL");
        return { status: "DUPLICATE" };
      }
      await tx
        .update(providerEvents)
        .set({ quarantined: true, outcome: "CONFLICTING_TERMINAL", processedAt: new Date() })
        .where(
          and(
            eq(providerEvents.provider, providerName),
            eq(providerEvents.externalEventId, mapped.externalEventId),
          ),
        );
      return {
        status: "CONFLICT",
        reason: `Already ${item.deliveryStatus}, received ${mapped.status}`,
      };
    }

    // Delivery is only ever recorded from a verified provider event. Nothing in
    // this codebase marks a message delivered on its own.
    await tx
      .update(messageItems)
      .set({
        deliveryStatus: mapped.status as typeof item.deliveryStatus,
        deliveredAt: mapped.status === "DELIVERED" ? mapped.occurredAt : null,
        errorCode: mapped.code ?? item.errorCode,
        updatedAt: new Date(),
      })
      .where(eq(messageItems.id, item.id));

    await finish("APPLIED");
    return { status: "APPLIED", messageItemId: item.id, delivery: mapped.status };
  });
}

/**
 * Re-tries quarantined events.
 *
 * A receipt can legitimately arrive before the submission response was stored,
 * so "unknown reference" is often a timing problem rather than a bad event.
 */
export async function retryQuarantined(
  provider: SmsProvider = getSmsProvider(),
  limit = 100,
): Promise<number> {
  const stuck = await db
    .select()
    .from(providerEvents)
    .where(
      and(
        eq(providerEvents.provider, provider.capabilities.name),
        eq(providerEvents.quarantined, true),
        isNull(providerEvents.messageItemId),
      ),
    )
    .limit(limit);

  let resolved = 0;
  for (const event of stuck) {
    if (!event.reference || !event.mappedStatus) continue;
    const outcome = await applyEvent(provider.capabilities.name, {
      externalEventId: event.externalEventId,
      reference: event.reference,
      status: event.mappedStatus as DeliveryEvent["status"],
      occurredAt: event.occurredAt ?? event.receivedAt,
    });
    if (outcome.status === "APPLIED") {
      await db
        .update(providerEvents)
        .set({ quarantined: false })
        .where(eq(providerEvents.id, event.id));
      resolved += 1;
    }
  }
  return resolved;
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : { value: parsed };
  } catch {
    return { raw: raw.slice(0, 2000) };
  }
}
