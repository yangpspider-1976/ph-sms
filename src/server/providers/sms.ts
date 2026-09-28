import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/server/env";

/**
 * SMS provider boundary.
 *
 * Business logic talks to this interface, never to a partner payload, so the
 * partner can be swapped without touching the send path.
 *
 * The three submission outcomes are deliberately distinct:
 *   ACCEPTED  — the provider took responsibility for the message.
 *   REJECTED  — the provider refused it. Nothing was sent.
 *   UNKNOWN   — we do not know. A timeout or crash after the request left us
 *               may well mean the SMS went out. This is never treated as a
 *               failure, and never blindly retried.
 */

export type SubmissionOutcome =
  | { outcome: "ACCEPTED"; reference: string; latencyMs: number }
  | {
      outcome: "REJECTED";
      category: ErrorCategory;
      code: string;
      message: string;
      latencyMs: number;
    }
  | { outcome: "UNKNOWN"; code: string; message: string; latencyMs: number };

/** Mapped from provider codes; drives retry and refund decisions. */
export type ErrorCategory =
  | "TRANSIENT"
  | "PERMANENT"
  | "RECIPIENT"
  | "BALANCE"
  | "SENDER"
  | "POLICY"
  | "AUTH";

export type ProviderCapabilities = {
  name: string;
  supportsUnicode: boolean;
  /** Strict UCS-2 providers cannot carry emoji outside the BMP. */
  supportsNonBmp: boolean;
  /** Whether a submission can be looked up again by our stable key. */
  supportsQuery: boolean;
  supportsDeliveryWebhook: boolean;
  /**
   * Whether re-sending the SAME stable key is contractually guaranteed not to
   * produce a second SMS. Without this guarantee an UNKNOWN is NOT retried.
   */
  guaranteesIdempotency: boolean;
  idempotencyWindowMs: number;
  maxSegments: number;
  gsm7Single: number;
  gsm7Concatenated: number;
  ucs2Single: number;
  ucs2Concatenated: number;
};

export type DeliveryEvent = {
  externalEventId: string;
  reference: string;
  status: "DELIVERED" | "UNDELIVERED" | "EXPIRED" | "PENDING" | "ACCEPTED";
  code?: string;
  occurredAt: Date;
};

export interface SmsProvider {
  readonly capabilities: ProviderCapabilities;

  submitMessage(input: {
    stableKey: string;
    normalizedNumber: string;
    sender: string;
    content: string;
  }): Promise<SubmissionOutcome>;

  /** Only present when the provider supports lookup by reference or stable key. */
  querySubmission?(referenceOrStableKey: string): Promise<SubmissionOutcome | null>;

  /**
   * Authenticates a raw delivery callback and maps it. Returns null when the
   * payload fails verification — an unverified event is never processed.
   */
  verifyAndMapDeliveryEvent(
    rawBody: string,
    headers: Record<string, string>,
  ): DeliveryEvent | null;
}

/* -------------------------------------------------------------------------- */
/* Mock provider                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Deterministic mock. The outcome is chosen from the recipient number so that
 * tests and demos reproduce exactly, with no randomness.
 *
 * Reserved endings in the synthetic +63917 block:
 *   ...9001  rejected, unknown subscriber
 *   ...9002  UNKNOWN — the transport dies after the request is sent
 *   ...9003  transient failure (safe to retry: nothing was submitted)
 *   ...9004  accepted, then reported UNDELIVERED
 *   ...9005  accepted, but no delivery receipt ever arrives
 *   anything else: accepted and delivered
 */
export class MockSmsProvider implements SmsProvider {
  readonly capabilities: ProviderCapabilities = {
    name: "mock",
    supportsUnicode: true,
    supportsNonBmp: true,
    supportsQuery: true,
    supportsDeliveryWebhook: true,
    // The mock guarantees it, so UNKNOWN can be resolved by query in demos.
    guaranteesIdempotency: true,
    idempotencyWindowMs: 24 * 60 * 60 * 1000,
    maxSegments: 6,
    gsm7Single: 160,
    gsm7Concatenated: 153,
    ucs2Single: 70,
    ucs2Concatenated: 67,
  };

  /** Submissions already accepted, keyed by stable key — models provider-side idempotency. */
  private readonly accepted = new Map<string, string>();

  private static suffix(normalized: string): string {
    return normalized.slice(-4);
  }

  private reference(stableKey: string): string {
    return `mock-${createHash("sha256").update(stableKey).digest("hex").slice(0, 16)}`;
  }

  async submitMessage(input: {
    stableKey: string;
    normalizedNumber: string;
    sender: string;
    content: string;
  }): Promise<SubmissionOutcome> {
    const latencyMs = 5;

    // Same stable key twice returns the first result rather than sending again.
    const already = this.accepted.get(input.stableKey);
    if (already) return { outcome: "ACCEPTED", reference: already, latencyMs };

    switch (MockSmsProvider.suffix(input.normalizedNumber)) {
      case "9001":
        return {
          outcome: "REJECTED",
          category: "RECIPIENT",
          code: "MOCK_UNKNOWN_SUBSCRIBER",
          message: "Unknown subscriber",
          latencyMs,
        };
      case "9002": {
        // The provider accepted it, but the answer never reached us.
        this.accepted.set(input.stableKey, this.reference(input.stableKey));
        return {
          outcome: "UNKNOWN",
          code: "MOCK_TRANSPORT_TIMEOUT",
          message: "The connection dropped after the message was submitted.",
          latencyMs,
        };
      }
      case "9003":
        return {
          outcome: "REJECTED",
          category: "TRANSIENT",
          code: "MOCK_TEMPORARY_FAILURE",
          message: "Temporary provider failure before acceptance",
          latencyMs,
        };
      default: {
        const reference = this.reference(input.stableKey);
        this.accepted.set(input.stableKey, reference);
        return { outcome: "ACCEPTED", reference, latencyMs };
      }
    }
  }

  async querySubmission(referenceOrStableKey: string): Promise<SubmissionOutcome | null> {
    const direct = this.accepted.get(referenceOrStableKey);
    if (direct) return { outcome: "ACCEPTED", reference: direct, latencyMs: 2 };
    for (const [, reference] of this.accepted) {
      if (reference === referenceOrStableKey) {
        return { outcome: "ACCEPTED", reference, latencyMs: 2 };
      }
    }
    return null;
  }

  /** Mock callbacks are signed with the same HMAC scheme a real one would use. */
  verifyAndMapDeliveryEvent(
    rawBody: string,
    headers: Record<string, string>,
  ): DeliveryEvent | null {
    const secret = env.PARTNER_SMS_WEBHOOK_SECRET || "mock-webhook-secret";
    const signature = headers["x-mock-signature"] ?? "";
    const expected = createHash("sha256").update(`${secret}:${rawBody}`).digest("hex");
    if (signature !== expected) return null;

    try {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      if (typeof parsed.eventId !== "string" || typeof parsed.reference !== "string") return null;
      const status = String(parsed.status ?? "").toUpperCase();
      if (!["DELIVERED", "UNDELIVERED", "EXPIRED", "PENDING", "ACCEPTED"].includes(status)) {
        return null;
      }
      return {
        externalEventId: parsed.eventId,
        reference: parsed.reference,
        status: status as DeliveryEvent["status"],
        code: typeof parsed.code === "string" ? parsed.code : undefined,
        occurredAt: parsed.occurredAt ? new Date(String(parsed.occurredAt)) : new Date(),
      };
    } catch {
      return null;
    }
  }

  /** Test helper: the delivery outcome this number is scripted to report. */
  static scriptedDelivery(normalized: string): "DELIVERED" | "UNDELIVERED" | "NONE" {
    switch (MockSmsProvider.suffix(normalized)) {
      case "9004":
        return "UNDELIVERED";
      case "9005":
        return "NONE";
      default:
        return "DELIVERED";
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Partner provider (not configured)                                          */
/* -------------------------------------------------------------------------- */

export class PartnerNotConfiguredError extends Error {
  constructor(what: string) {
    super(
      `The partner SMS adapter is not configured: ${what}. ` +
        "Request/response schemas, error codes, encoding rules, idempotency semantics and " +
        "delivery authentication must come from the partner contract. Nothing is guessed here.",
    );
    this.name = "PartnerNotConfiguredError";
  }
}

/**
 * Placeholder for the real partner.
 *
 * It fails loudly instead of inventing a payload shape. Guessing an endpoint
 * would produce code that looks finished and silently does nothing — or worse,
 * sends something malformed to a live gateway.
 */
export class PartnerSmsProvider implements SmsProvider {
  readonly capabilities: ProviderCapabilities = {
    name: "partner",
    supportsUnicode: true,
    supportsNonBmp: false,
    supportsQuery: false,
    supportsDeliveryWebhook: false,
    // Unknown until the contract says so. Assuming true here would risk
    // sending a second SMS after a timeout.
    guaranteesIdempotency: false,
    idempotencyWindowMs: 0,
    maxSegments: 6,
    gsm7Single: 160,
    gsm7Concatenated: 153,
    ucs2Single: 70,
    ucs2Concatenated: 67,
  };

  async submitMessage(): Promise<SubmissionOutcome> {
    throw new PartnerNotConfiguredError("no request schema or credentials");
  }

  verifyAndMapDeliveryEvent(): DeliveryEvent | null {
    throw new PartnerNotConfiguredError("no delivery-event authentication scheme");
  }
}

let cached: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (cached) return cached;
  cached = env.APP_MODE === "MOCK" ? new MockSmsProvider() : new PartnerSmsProvider();
  return cached;
}

/** Test seam. */
export function setSmsProvider(provider: SmsProvider | null): void {
  cached = provider;
}
