import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { env } from "@/server/env";
import { hmacHex, safeEqual } from "@/server/security/crypto";

/**
 * Payment provider boundary.
 *
 * Credit is only ever posted from an authenticated provider event or from
 * server-side reconciliation. A browser returning to a success URL proves
 * nothing — the customer controls that redirect — so it never grants credit.
 */

export type CreditPackage = {
  code: string;
  label: string;
  amountCentavos: number;
  creditCentavos: number;
  currency: "PHP";
};

/**
 * Demo packages. These are illustrative test values, not approved commercial
 * pricing, and they are not shown on the public pricing page.
 */
export const DEMO_PACKAGES: CreditPackage[] = [
  {
    code: "demo-500",
    label: "Demo top-up — small",
    amountCentavos: 50_000,
    creditCentavos: 50_000,
    currency: "PHP",
  },
  {
    code: "demo-1000",
    label: "Demo top-up — standard",
    amountCentavos: 100_000,
    creditCentavos: 100_000,
    currency: "PHP",
  },
];

export function findPackage(code: string): CreditPackage | null {
  return DEMO_PACKAGES.find((p) => p.code === code) ?? null;
}

export type CheckoutSession = {
  checkoutId: string;
  /** Where the customer is sent to pay. */
  redirectUrl: string;
  reference: string;
};

export type VerifiedPaymentEvent = {
  externalEventId: string;
  /** Our business reference, which is deduplicated independently of the event id. */
  reference: string;
  type: "PAID" | "FAILED" | "EXPIRED" | "REFUNDED" | "CHARGEBACK";
  amountCentavos: number;
  currency: string;
  merchantId: string;
  environment: string;
  packageCode: string;
  occurredAt: Date;
};

export interface PaymentProvider {
  readonly name: string;
  readonly environment: string;

  createCheckout(input: {
    organizationId: string;
    reference: string;
    pkg: CreditPackage;
  }): Promise<CheckoutSession>;

  /** Returns null when the payload fails verification. Never throws on bad input. */
  verifyEvent(rawBody: string, headers: Record<string, string>): VerifiedPaymentEvent | null;

  /** Server-to-server lookup, the authority when an event is missed or disputed. */
  reconcilePayment(reference: string): Promise<VerifiedPaymentEvent | null>;
}

/* -------------------------------------------------------------------------- */
/* Mock provider                                                              */
/* -------------------------------------------------------------------------- */

const MOCK_SECRET = () => env.PAYMENT_WEBHOOK_SECRET || "mock-payment-secret";

/**
 * Deterministic mock gateway. No card details are collected or stored anywhere
 * in this codebase, and no real payment network is involved.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  readonly environment = "demo";

  /** What the gateway believes it has taken, by reference. */
  private readonly charges = new Map<string, VerifiedPaymentEvent>();

  async createCheckout(input: {
    organizationId: string;
    reference: string;
    pkg: CreditPackage;
  }): Promise<CheckoutSession> {
    const checkoutId = `chk_${createHash("sha256").update(input.reference).digest("hex").slice(0, 16)}`;
    return {
      checkoutId,
      reference: input.reference,
      // A local demo page, not a real gateway.
      redirectUrl: `/app/credits/demo-checkout?reference=${encodeURIComponent(input.reference)}`,
    };
  }

  verifyEvent(rawBody: string, headers: Record<string, string>): VerifiedPaymentEvent | null {
    const signature = headers["x-mock-payment-signature"] ?? "";
    const expected = hmacHex(MOCK_SECRET(), rawBody);
    if (!signature || !safeEqual(signature, expected)) return null;

    try {
      const p = JSON.parse(rawBody) as Record<string, unknown>;
      if (typeof p.eventId !== "string" || typeof p.reference !== "string") return null;
      const type = String(p.type ?? "").toUpperCase();
      if (!["PAID", "FAILED", "EXPIRED", "REFUNDED", "CHARGEBACK"].includes(type)) return null;
      if (typeof p.amountCentavos !== "number" || !Number.isInteger(p.amountCentavos)) return null;

      return {
        externalEventId: p.eventId,
        reference: p.reference,
        type: type as VerifiedPaymentEvent["type"],
        amountCentavos: p.amountCentavos,
        currency: String(p.currency ?? "PHP"),
        merchantId: String(p.merchantId ?? env.PAYMENT_MERCHANT_ID),
        environment: String(p.environment ?? this.environment),
        packageCode: String(p.packageCode ?? ""),
        occurredAt: p.occurredAt ? new Date(String(p.occurredAt)) : new Date(),
      };
    } catch {
      return null;
    }
  }

  async reconcilePayment(reference: string): Promise<VerifiedPaymentEvent | null> {
    return this.charges.get(reference) ?? null;
  }

  /** Demo helper: records that the gateway took the money. */
  recordDemoCharge(event: VerifiedPaymentEvent): void {
    this.charges.set(event.reference, event);
  }

  /** Demo helper: builds a correctly signed callback for the demo checkout page. */
  static signedCallback(payload: Record<string, unknown>): {
    body: string;
    signature: string;
  } {
    const body = JSON.stringify(payload);
    return { body, signature: hmacHex(MOCK_SECRET(), body) };
  }
}

/* -------------------------------------------------------------------------- */
/* Unconfigured real provider                                                 */
/* -------------------------------------------------------------------------- */

export class PaymentProviderNotConfiguredError extends Error {
  constructor() {
    super(
      "No payment provider is configured. The gateway, its event authentication scheme, " +
        "settlement flow, tax treatment and refund rules are commercial decisions that have " +
        "not been made, so nothing is assumed here.",
    );
    this.name = "PaymentProviderNotConfiguredError";
  }
}

export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly name = "unconfigured";
  readonly environment = "none";

  async createCheckout(): Promise<CheckoutSession> {
    throw new PaymentProviderNotConfiguredError();
  }

  verifyEvent(): VerifiedPaymentEvent | null {
    return null;
  }

  async reconcilePayment(): Promise<VerifiedPaymentEvent | null> {
    throw new PaymentProviderNotConfiguredError();
  }
}

let cached: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  cached =
    env.PAYMENT_PROVIDER === "MOCK" && env.APP_MODE !== "LIVE"
      ? new MockPaymentProvider()
      : new UnconfiguredPaymentProvider();
  return cached;
}

export function setPaymentProvider(provider: PaymentProvider | null): void {
  cached = provider;
}

/** Business payment reference. Unique per attempt, and not guessable. */
export function newPaymentReference(): string {
  return `pay_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}
