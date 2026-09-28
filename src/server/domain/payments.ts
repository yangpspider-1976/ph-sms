import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { paymentEvents, payments } from "@/server/db/schema";
import { env } from "@/server/env";
import { debitWallet, ensureWallet, isUniqueViolation, postPurchase } from "./wallet";
import {
  findPackage,
  getPaymentProvider,
  newPaymentReference,
  type PaymentProvider,
  type VerifiedPaymentEvent,
} from "@/server/providers/payments";
import { recordAudit } from "@/server/audit";

/**
 * Payment handling.
 *
 * Credit is posted only when an authenticated event (or a server-side
 * reconciliation) matches a payment WE created, for the amount, currency,
 * merchant, environment and package we recorded at checkout. A replayed,
 * forged or mismatched event cannot increase a balance.
 *
 * Two independent dedupe keys are in play, because either alone is not enough:
 *   - (provider, external_event_id) stops the same event being processed twice;
 *   - the payment's own status stops two *different* events both crediting one
 *     payment.
 */

export type StartCheckoutResult = {
  paymentId: string;
  reference: string;
  redirectUrl: string;
};

export async function startCheckout(input: {
  organizationId: string;
  userId: string;
  packageCode: string;
  provider?: PaymentProvider;
}): Promise<StartCheckoutResult> {
  const provider = input.provider ?? getPaymentProvider();
  const pkg = findPackage(input.packageCode);
  if (!pkg) throw new Error(`Unknown package ${input.packageCode}`);

  const reference = newPaymentReference();
  const session = await provider.createCheckout({
    organizationId: input.organizationId,
    reference,
    pkg,
  });

  await ensureWallet(input.organizationId);

  // The package is snapshotted now, so a later price change cannot alter what
  // this payment is worth.
  const [payment] = await db
    .insert(payments)
    .values({
      organizationId: input.organizationId,
      reference,
      provider: provider.name,
      environment: provider.environment,
      merchantId: env.PAYMENT_MERCHANT_ID,
      checkoutId: session.checkoutId,
      packageCode: pkg.code,
      packageSnapshot: { ...pkg },
      amountCentavos: pkg.amountCentavos,
      currency: pkg.currency,
      creditCentavos: pkg.creditCentavos,
      status: "PENDING",
      createdBy: input.userId,
    })
    .returning({ id: payments.id });

  await recordAudit({
    action: "payment.checkout_started",
    organizationId: input.organizationId,
    actorUserId: input.userId,
    objectType: "payment",
    objectId: payment!.id,
    metadata: { reference, packageCode: pkg.code, amountCentavos: pkg.amountCentavos },
  });

  return { paymentId: payment!.id, reference, redirectUrl: session.redirectUrl };
}

export type PaymentIngestOutcome =
  | { status: "CREDITED"; paymentId: string; creditCentavos: number }
  | { status: "DUPLICATE" }
  | { status: "ALREADY_SETTLED" }
  | { status: "RECORDED"; detail: string }
  | { status: "MISMATCH"; reason: string }
  | { status: "UNKNOWN_REFERENCE" }
  | { status: "REJECTED"; reason: string };

/** Authenticates, stores, then applies. Never the other way round. */
export async function ingestPaymentEvent(
  rawBody: string,
  headers: Record<string, string>,
  provider: PaymentProvider = getPaymentProvider(),
): Promise<PaymentIngestOutcome> {
  const verified = provider.verifyEvent(rawBody, headers);
  if (!verified) return { status: "REJECTED", reason: "Signature or payload not valid" };

  try {
    await db.insert(paymentEvents).values({
      provider: provider.name,
      externalEventId: verified.externalEventId,
      type: verified.type,
      paymentReference: verified.reference,
      signatureValid: true,
      payload: safeJson(rawBody),
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { status: "DUPLICATE" };
    throw err;
  }

  const outcome = await applyPaymentEvent(provider, verified);

  await db
    .update(paymentEvents)
    .set({ processedAt: new Date(), outcome: outcome.status })
    .where(
      and(
        eq(paymentEvents.provider, provider.name),
        eq(paymentEvents.externalEventId, verified.externalEventId),
      ),
    );

  return outcome;
}

async function applyPaymentEvent(
  provider: PaymentProvider,
  event: VerifiedPaymentEvent,
): Promise<PaymentIngestOutcome> {
  return db.transaction(async (tx) => {
    // The reference must be one we issued. An event naming an unknown payment
    // credits nothing, whatever it claims.
    const payment = (
      await tx
        .select()
        .from(payments)
        .where(
          and(eq(payments.provider, provider.name), eq(payments.reference, event.reference)),
        )
        .for("update")
        .limit(1)
    )[0];

    if (!payment) return { status: "UNKNOWN_REFERENCE" };

    if (event.type === "FAILED" || event.type === "EXPIRED") {
      if (payment.status === "PENDING") {
        await tx
          .update(payments)
          .set({ status: event.type, updatedAt: new Date() })
          .where(eq(payments.id, payment.id));
      }
      return { status: "RECORDED", detail: event.type };
    }

    if (event.type === "REFUNDED" || event.type === "CHARGEBACK") {
      if (payment.status !== "PAID") {
        return { status: "RECORDED", detail: `${event.type} on a payment that was not paid` };
      }

      // Taking money back can exceed the remaining balance. That is recorded as
      // debt and freezes sending rather than being clamped to zero.
      const result = await debitWallet(tx, {
        organizationId: payment.organizationId,
        amountCentavos: payment.creditCentavos,
        operationRef: `payment:reverse:${payment.id}`,
        reason: event.type,
        allowDebt: true,
      });

      await tx
        .update(payments)
        .set({
          status: event.type === "REFUNDED" ? "REFUNDED" : "DISPUTED",
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));

      await recordAudit(
        {
          action: `payment.${event.type.toLowerCase()}`,
          organizationId: payment.organizationId,
          actorKind: "SYSTEM",
          objectType: "payment",
          objectId: payment.id,
          metadata: { debtCentavos: result.debtCentavos, frozen: result.frozen },
        },
        tx,
      );

      return { status: "RECORDED", detail: event.type };
    }

    /* --- PAID ----------------------------------------------------------- */

    // Already settled: a second PAID event for the same payment credits nothing.
    if (payment.status !== "PENDING") return { status: "ALREADY_SETTLED" };

    const mismatch = checkMismatch(payment, event);
    if (mismatch) {
      await recordAudit(
        {
          action: "payment.mismatch_rejected",
          organizationId: payment.organizationId,
          actorKind: "SYSTEM",
          objectType: "payment",
          objectId: payment.id,
          metadata: { reason: mismatch },
        },
        tx,
      );
      return { status: "MISMATCH", reason: mismatch };
    }

    await postPurchase(tx, {
      organizationId: payment.organizationId,
      amountCentavos: payment.creditCentavos,
      operationRef: `payment:credit:${payment.id}`,
      paymentId: payment.id,
      reason: `Top-up ${payment.reference}`,
    });

    await tx
      .update(payments)
      .set({ status: "PAID", postedAt: new Date(), updatedAt: new Date() })
      .where(eq(payments.id, payment.id));

    await recordAudit(
      {
        action: "payment.credited",
        organizationId: payment.organizationId,
        actorKind: "SYSTEM",
        objectType: "payment",
        objectId: payment.id,
        metadata: { creditCentavos: payment.creditCentavos, reference: payment.reference },
      },
      tx,
    );

    return {
      status: "CREDITED",
      paymentId: payment.id,
      creditCentavos: payment.creditCentavos,
    };
  });
}

/** Everything that must match what we recorded at checkout. */
function checkMismatch(
  payment: typeof payments.$inferSelect,
  event: VerifiedPaymentEvent,
): string | null {
  if (event.amountCentavos !== payment.amountCentavos) {
    return `Amount ${event.amountCentavos} does not match the ${payment.amountCentavos} charged at checkout`;
  }
  if (event.currency !== payment.currency) {
    return `Currency ${event.currency} does not match ${payment.currency}`;
  }
  // Compared unconditionally: treating a missing merchant id as "skip the
  // check" would turn a configuration gap into an authentication bypass.
  if ((event.merchantId ?? "") !== (payment.merchantId ?? "")) {
    return "Merchant does not match";
  }
  if (event.environment !== payment.environment) {
    return `Environment ${event.environment} does not match ${payment.environment}`;
  }
  if (event.packageCode && event.packageCode !== payment.packageCode) {
    return "Package does not match the one purchased";
  }
  return null;
}

/**
 * Server-to-server reconciliation, for a payment whose event never arrived.
 * Uses the same apply path, so it cannot double-credit one that did.
 */
export async function reconcilePayment(
  reference: string,
  provider: PaymentProvider = getPaymentProvider(),
): Promise<PaymentIngestOutcome> {
  const result = await provider.reconcilePayment(reference);
  if (!result) return { status: "UNKNOWN_REFERENCE" };
  return applyPaymentEvent(provider, result);
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
