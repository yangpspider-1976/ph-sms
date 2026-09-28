import { db } from "@/server/db";
import {
  memberships,
  organizations,
  senderIdentities,
  users,
} from "@/server/db/schema";
import { ensureWallet, postPurchase } from "@/server/domain/wallet";

/** Synthetic destinations only. The mock provider scripts outcomes from the last four digits. */
export const NUMBERS = {
  ok: (i: number) => `+639170${String(i).padStart(6, "0")}`,
  rejected: "+639170009001",
  unknown: "+639170009002",
  transient: "+639170009003",
  undelivered: "+639170009004",
  noReceipt: "+639170009005",
};

export type Tenant = {
  organizationId: string;
  userId: string;
  senderIdentityId: string;
};

let counter = 0;

export async function createTenant(
  options: { fundingCentavos?: number; name?: string; status?: "ACTIVE" | "SUSPENDED" } = {},
): Promise<Tenant> {
  counter += 1;
  const suffix = `${Date.now()}-${counter}`;

  const [org] = await db
    .insert(organizations)
    .values({
      name: options.name ?? `Test Org ${suffix}`,
      status: options.status ?? "ACTIVE",
    })
    .returning({ id: organizations.id });

  const [user] = await db
    .insert(users)
    .values({
      email: `user-${suffix}@test.invalid`,
      passwordHash: "x",
      fullName: "Test User",
      emailVerifiedAt: new Date(),
    })
    .returning({ id: users.id });

  await db
    .insert(memberships)
    .values({ organizationId: org!.id, userId: user!.id, role: "OWNER" });

  const [sender] = await db
    .insert(senderIdentities)
    .values({ organizationId: org!.id, value: `TEST${counter}`, status: "APPROVED" })
    .returning({ id: senderIdentities.id });

  await ensureWallet(org!.id);
  const funding = options.fundingCentavos ?? 100_000;
  if (funding > 0) {
    await db.transaction((tx) =>
      postPurchase(tx, {
        organizationId: org!.id,
        amountCentavos: funding,
        operationRef: `fixture:funding:${org!.id}`,
      }),
    );
  }

  return { organizationId: org!.id, userId: user!.id, senderIdentityId: sender!.id };
}
