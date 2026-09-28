import "server-only";
import { headers } from "next/headers";
import { db, type DbOrTx } from "@/server/db";
import { auditEvents } from "@/server/db/schema";

/**
 * Audit trail.
 *
 * Ordinary audit rows never carry a full phone number or a message body. Where
 * a record needs to point at a recipient it stores the masked form or the
 * keyed hash, which is enough to reconcile without turning the audit log into a
 * second copy of the customer's contact list.
 */

const SENSITIVE_KEYS = /^(body|message|content|phone|number|normalized|password|token|secret)$/i;
const PHONE_LIKE = /\+?63\d{10}|\b09\d{9}\b/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[deep]";
  if (value == null) return value;
  if (typeof value === "string") {
    const masked = value.replace(PHONE_LIKE, "[number]");
    return masked.length > 300 ? `${masked.slice(0, 300)}…` : masked;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export type AuditInput = {
  action: string;
  organizationId?: string | null;
  actorUserId?: string | null;
  actorKind?: "USER" | "PLATFORM_ADMIN" | "SYSTEM";
  objectType?: string;
  objectId?: string;
  metadata?: Record<string, unknown>;
};

/** Writes an audit row. Pass a transaction to make the record atomic with the change. */
export async function recordAudit(input: AuditInput, tx: DbOrTx = db): Promise<void> {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const hdrs = await headers();
    ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    userAgent = hdrs.get("user-agent")?.slice(0, 500) ?? null;
  } catch {
    // Outside a request (worker, script): no request metadata to record.
  }

  await tx.insert(auditEvents).values({
    organizationId: input.organizationId ?? null,
    actorUserId: input.actorUserId ?? null,
    actorKind: input.actorKind ?? "USER",
    action: input.action,
    objectType: input.objectType ?? null,
    objectId: input.objectId ?? null,
    metadata: (input.metadata ? redact(input.metadata) : null) as Record<string, unknown> | null,
    ip,
    userAgent,
  });
}
