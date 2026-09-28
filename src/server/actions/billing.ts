"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorize } from "@/server/auth/context";
import { startCheckout, ingestPaymentEvent } from "@/server/domain/payments";
import { MockPaymentProvider, findPackage } from "@/server/providers/payments";
import { demoFeaturesEnabled } from "@/server/env";
import { db } from "@/server/db";
import { payments } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";

/** Starts a top-up. Owner-only: buying credit is a billing action. */
export async function startTopUpAction(formData: FormData): Promise<void> {
  const auth = await authorize("billing.manage");
  if (!auth.ok) redirect("/app/credits?error=forbidden");

  const parsed = z
    .object({ packageCode: z.string().min(1) })
    .safeParse({ packageCode: String(formData.get("packageCode") ?? "") });
  if (!parsed.success || !findPackage(parsed.data.packageCode)) {
    redirect("/app/credits?error=package");
  }

  const result = await startCheckout({
    organizationId: auth.ctx.org.organizationId,
    userId: auth.ctx.user.id,
    packageCode: parsed.data.packageCode,
  });

  revalidatePath("/app/credits");
  redirect(result.redirectUrl);
}

export type DemoPayResult = { ok: boolean; message: string };

/**
 * Demo-only: stands in for the customer completing payment at a real gateway.
 *
 * It does NOT credit the wallet directly. It asks the mock gateway to emit a
 * properly signed event and feeds that through the same webhook path a real
 * provider would use, so the demo exercises the real code rather than a
 * shortcut.
 */
export async function completeDemoPaymentAction(reference: string): Promise<DemoPayResult> {
  if (!demoFeaturesEnabled()) {
    return { ok: false, message: "Demo payments are not available in this mode." };
  }

  const auth = await authorize("billing.manage");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const payment = (
    await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.reference, reference),
          // Scoped: a reference from another tenant does not resolve.
          eq(payments.organizationId, auth.ctx.org.organizationId),
        ),
      )
      .limit(1)
  )[0];

  if (!payment) return { ok: false, message: "That payment could not be found." };
  if (payment.status !== "PENDING") {
    return { ok: false, message: `This payment is already ${payment.status.toLowerCase()}.` };
  }

  const { body, signature } = MockPaymentProvider.signedCallback({
    eventId: `demo-${payment.id}`,
    reference: payment.reference,
    type: "PAID",
    amountCentavos: payment.amountCentavos,
    currency: payment.currency,
    merchantId: payment.merchantId,
    environment: payment.environment,
    packageCode: payment.packageCode,
    occurredAt: new Date().toISOString(),
  });

  const outcome = await ingestPaymentEvent(body, {
    "x-mock-payment-signature": signature,
  });

  revalidatePath("/app/credits");

  if (outcome.status === "CREDITED") {
    return { ok: true, message: "Demo credit added. No real payment was taken." };
  }
  if (outcome.status === "DUPLICATE" || outcome.status === "ALREADY_SETTLED") {
    return { ok: true, message: "This payment was already settled." };
  }
  return { ok: false, message: `The gateway event was not accepted (${outcome.status}).` };
}
