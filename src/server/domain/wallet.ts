import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import { ledgerEntries, reservations, wallets } from "@/server/db/schema";

/**
 * Prepaid wallet, in integer centavos.
 *
 * This is service credit for sending SMS, not a transferable consumer wallet
 * and not redeemable for cash.
 *
 *   available = postedBalance - held
 *
 * The ledger is append-only. Nothing here ever updates a historical row: a
 * correction is a new compensating entry. Every entry carries a unique
 * operationRef, so a retried call collides on the unique index instead of
 * double-spending.
 */

export class WalletError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INSUFFICIENT_FUNDS"
      | "NO_WALLET"
      | "DUPLICATE_OPERATION"
      | "BELOW_HELD"
      | "SENDING_FROZEN"
      | "INVALID_AMOUNT"
      | "RESERVATION_CLOSED",
  ) {
    super(message);
    this.name = "WalletError";
  }
}

export type WalletState = {
  postedBalanceCentavos: number;
  heldCentavos: number;
  availableCentavos: number;
  debtCentavos: number;
  sendingFrozen: boolean;
};

export async function ensureWallet(organizationId: string, tx: DbOrTx = db): Promise<void> {
  await tx.insert(wallets).values({ organizationId }).onConflictDoNothing();
}

export async function getWallet(
  organizationId: string,
  tx: DbOrTx = db,
): Promise<WalletState> {
  const rows = await tx.select().from(wallets).where(eq(wallets.organizationId, organizationId));
  const w = rows[0];
  if (!w) {
    return {
      postedBalanceCentavos: 0,
      heldCentavos: 0,
      availableCentavos: 0,
      debtCentavos: 0,
      sendingFrozen: false,
    };
  }
  return {
    postedBalanceCentavos: w.postedBalanceCentavos,
    heldCentavos: w.heldCentavos,
    availableCentavos: w.postedBalanceCentavos - w.heldCentavos,
    debtCentavos: w.debtCentavos,
    sendingFrozen: w.sendingFrozen,
  };
}

/** Locks the wallet row for the rest of the transaction. */
async function lockWallet(tx: DbOrTx, organizationId: string) {
  const rows = await tx
    .select()
    .from(wallets)
    .where(eq(wallets.organizationId, organizationId))
    .for("update");
  const wallet = rows[0];
  if (!wallet) throw new WalletError("No wallet for this organization.", "NO_WALLET");
  return wallet;
}

type LedgerInput = {
  organizationId: string;
  type: (typeof ledgerEntries.$inferInsert)["type"];
  amountCentavos: number;
  postedBalanceAfter: number;
  heldAfter: number;
  operationRef: string;
  campaignId?: string | null;
  reservationId?: string | null;
  paymentId?: string | null;
  actorUserId?: string | null;
  reason?: string | null;
};

async function appendLedger(tx: DbOrTx, entry: LedgerInput): Promise<void> {
  try {
    await tx.insert(ledgerEntries).values(entry);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new WalletError(
        `Operation ${entry.operationRef} has already been recorded.`,
        "DUPLICATE_OPERATION",
      );
    }
    throw err;
  }
}

/**
 * PostgreSQL unique-violation check. Drizzle wraps driver errors, so the
 * SQLSTATE lives on the cause chain rather than the thrown object.
 */
export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if ((current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Places a hold. Moves nothing out of the posted balance — it only makes the
 * money unavailable to any other send.
 */
export async function reserveFunds(
  tx: DbOrTx,
  input: {
    organizationId: string;
    amountCentavos: number;
    campaignId?: string | null;
    operationRef: string;
    actorUserId?: string | null;
  },
): Promise<{ reservationId: string }> {
  if (input.amountCentavos < 0) throw new WalletError("Negative amount.", "INVALID_AMOUNT");

  const wallet = await lockWallet(tx, input.organizationId);
  if (wallet.sendingFrozen) {
    throw new WalletError(
      "Sending is frozen on this account. Contact support.",
      "SENDING_FROZEN",
    );
  }

  const available = wallet.postedBalanceCentavos - wallet.heldCentavos;
  if (available < input.amountCentavos) {
    throw new WalletError(
      `Insufficient balance: ${available} centavos available, ${input.amountCentavos} required.`,
      "INSUFFICIENT_FUNDS",
    );
  }

  const held = wallet.heldCentavos + input.amountCentavos;
  const inserted = await tx
    .insert(reservations)
    .values({
      organizationId: input.organizationId,
      campaignId: input.campaignId ?? null,
      amountCentavos: input.amountCentavos,
      status: "ACTIVE",
    })
    .returning({ id: reservations.id });

  const reservationId = inserted[0]!.id;

  await tx
    .update(wallets)
    .set({ heldCentavos: held, updatedAt: new Date() })
    .where(eq(wallets.organizationId, input.organizationId));

  await appendLedger(tx, {
    organizationId: input.organizationId,
    type: "RESERVE",
    amountCentavos: input.amountCentavos,
    postedBalanceAfter: wallet.postedBalanceCentavos,
    heldAfter: held,
    operationRef: input.operationRef,
    campaignId: input.campaignId ?? null,
    reservationId,
    actorUserId: input.actorUserId ?? null,
  });

  return { reservationId };
}

/**
 * Captures part of a hold: releases that much hold and posts the charge in the
 * same transaction, so the two can never be observed apart.
 */
export async function captureFromReservation(
  tx: DbOrTx,
  input: {
    reservationId: string;
    amountCentavos: number;
    operationRef: string;
    campaignId?: string | null;
    reason?: string;
  },
): Promise<void> {
  if (input.amountCentavos <= 0) return;

  const rows = await tx
    .select()
    .from(reservations)
    .where(eq(reservations.id, input.reservationId))
    .for("update");
  const reservation = rows[0];
  if (!reservation) throw new WalletError("Unknown reservation.", "RESERVATION_CLOSED");

  const outstanding =
    reservation.amountCentavos - reservation.capturedCentavos - reservation.releasedCentavos;
  if (input.amountCentavos > outstanding) {
    throw new WalletError(
      `Capture of ${input.amountCentavos} exceeds the ${outstanding} still held.`,
      "INSUFFICIENT_FUNDS",
    );
  }

  const wallet = await lockWallet(tx, reservation.organizationId);
  const held = wallet.heldCentavos - input.amountCentavos;
  const posted = wallet.postedBalanceCentavos - input.amountCentavos;

  await tx
    .update(wallets)
    .set({ heldCentavos: held, postedBalanceCentavos: posted, updatedAt: new Date() })
    .where(eq(wallets.organizationId, reservation.organizationId));

  const captured = reservation.capturedCentavos + input.amountCentavos;
  const closed = captured + reservation.releasedCentavos >= reservation.amountCentavos;
  await tx
    .update(reservations)
    .set({
      capturedCentavos: captured,
      status: closed ? "CAPTURED" : "ACTIVE",
      closedAt: closed ? new Date() : null,
    })
    .where(eq(reservations.id, reservation.id));

  await appendLedger(tx, {
    organizationId: reservation.organizationId,
    type: "CHARGE",
    amountCentavos: -input.amountCentavos,
    postedBalanceAfter: posted,
    heldAfter: held,
    operationRef: input.operationRef,
    campaignId: input.campaignId ?? reservation.campaignId,
    reservationId: reservation.id,
    reason: input.reason ?? null,
  });
}

/** Releases unused hold back to available funds. Posted balance is untouched. */
export async function releaseReservation(
  tx: DbOrTx,
  input: {
    reservationId: string;
    amountCentavos?: number;
    operationRef: string;
    reason?: string;
  },
): Promise<number> {
  const rows = await tx
    .select()
    .from(reservations)
    .where(eq(reservations.id, input.reservationId))
    .for("update");
  const reservation = rows[0];
  if (!reservation) throw new WalletError("Unknown reservation.", "RESERVATION_CLOSED");

  const outstanding =
    reservation.amountCentavos - reservation.capturedCentavos - reservation.releasedCentavos;
  const amount = Math.min(input.amountCentavos ?? outstanding, outstanding);
  if (amount <= 0) return 0;

  const wallet = await lockWallet(tx, reservation.organizationId);
  const held = wallet.heldCentavos - amount;

  await tx
    .update(wallets)
    .set({ heldCentavos: held, updatedAt: new Date() })
    .where(eq(wallets.organizationId, reservation.organizationId));

  const released = reservation.releasedCentavos + amount;
  const closed = released + reservation.capturedCentavos >= reservation.amountCentavos;
  await tx
    .update(reservations)
    .set({
      releasedCentavos: released,
      status: closed ? (reservation.capturedCentavos > 0 ? "CAPTURED" : "RELEASED") : "ACTIVE",
      closedAt: closed ? new Date() : null,
    })
    .where(eq(reservations.id, reservation.id));

  await appendLedger(tx, {
    organizationId: reservation.organizationId,
    type: "RELEASE",
    amountCentavos: amount,
    postedBalanceAfter: wallet.postedBalanceCentavos,
    heldAfter: held,
    operationRef: input.operationRef,
    campaignId: reservation.campaignId,
    reservationId: reservation.id,
    reason: input.reason ?? null,
  });

  return amount;
}

/** Credits the wallet. Only ever called from a verified payment or reconciliation. */
export async function postPurchase(
  tx: DbOrTx,
  input: {
    organizationId: string;
    amountCentavos: number;
    operationRef: string;
    paymentId?: string | null;
    actorUserId?: string | null;
    reason?: string;
    type?: "PURCHASE" | "ADJUSTMENT" | "REFUND";
  },
): Promise<void> {
  if (input.amountCentavos <= 0) throw new WalletError("Non-positive credit.", "INVALID_AMOUNT");
  await ensureWallet(input.organizationId, tx);
  const wallet = await lockWallet(tx, input.organizationId);

  // A credit first pays down any recorded debt from a chargeback.
  const debtPayment = Math.min(wallet.debtCentavos, input.amountCentavos);
  const credited = input.amountCentavos - debtPayment;
  const posted = wallet.postedBalanceCentavos + credited;
  const debt = wallet.debtCentavos - debtPayment;

  await tx
    .update(wallets)
    .set({
      postedBalanceCentavos: posted,
      debtCentavos: debt,
      sendingFrozen: debt > 0 ? wallet.sendingFrozen : false,
      updatedAt: new Date(),
    })
    .where(eq(wallets.organizationId, input.organizationId));

  await appendLedger(tx, {
    organizationId: input.organizationId,
    type: input.type ?? "PURCHASE",
    amountCentavos: input.amountCentavos,
    postedBalanceAfter: posted,
    heldAfter: wallet.heldCentavos,
    operationRef: input.operationRef,
    paymentId: input.paymentId ?? null,
    actorUserId: input.actorUserId ?? null,
    reason: input.reason ?? null,
  });
}

/**
 * Debits the wallet outside the reservation flow (chargeback, admin correction).
 * An admin may not push the balance below funds already held for a live send.
 */
export async function debitWallet(
  tx: DbOrTx,
  input: {
    organizationId: string;
    amountCentavos: number;
    operationRef: string;
    actorUserId?: string | null;
    reason: string;
    type?: "ADJUSTMENT" | "CHARGE";
    allowDebt?: boolean;
  },
): Promise<{ debtCentavos: number; frozen: boolean }> {
  if (input.amountCentavos <= 0) throw new WalletError("Non-positive debit.", "INVALID_AMOUNT");
  const wallet = await lockWallet(tx, input.organizationId);

  const available = wallet.postedBalanceCentavos - wallet.heldCentavos;
  if (input.amountCentavos > available && !input.allowDebt) {
    throw new WalletError(
      "An adjustment cannot take the balance below funds already held for a send.",
      "BELOW_HELD",
    );
  }

  // A chargeback larger than the remaining funds is recorded as debt and
  // freezes sending, rather than being hidden by clamping the balance at zero.
  const fromBalance = Math.min(input.amountCentavos, Math.max(wallet.postedBalanceCentavos, 0));
  const shortfall = input.amountCentavos - fromBalance;
  const posted = wallet.postedBalanceCentavos - fromBalance;
  const debt = wallet.debtCentavos + shortfall;
  const frozen = wallet.sendingFrozen || shortfall > 0;

  await tx
    .update(wallets)
    .set({
      postedBalanceCentavos: posted,
      debtCentavos: debt,
      sendingFrozen: frozen,
      updatedAt: new Date(),
    })
    .where(eq(wallets.organizationId, input.organizationId));

  await appendLedger(tx, {
    organizationId: input.organizationId,
    type: input.type ?? "ADJUSTMENT",
    amountCentavos: -input.amountCentavos,
    postedBalanceAfter: posted,
    heldAfter: wallet.heldCentavos,
    operationRef: input.operationRef,
    actorUserId: input.actorUserId ?? null,
    reason: input.reason,
  });

  return { debtCentavos: debt, frozen };
}

/** Total already refunded against a charge, so a refund can never exceed it. */
export async function refundedTotal(
  tx: DbOrTx,
  operationRefPrefix: string,
): Promise<number> {
  const rows = await tx
    .select({ total: sql<number>`coalesce(sum(${ledgerEntries.amountCentavos}), 0)::int` })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.type, "REFUND"),
        sql`${ledgerEntries.operationRef} like ${`${operationRefPrefix}%`}`,
      ),
    );
  return rows[0]?.total ?? 0;
}
