import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db, resetDb } from "@/test/db";
import { createTenant, type Tenant } from "@/test/fixtures";
import { mailSink, memberships, users, verificationTokens } from "@/server/db/schema";
import { tokenLookup } from "@/server/security/crypto";
import {
  acceptInvite,
  changeRole,
  inviteMember,
  listMembers,
  peekInvite,
  removeMember,
  revokeInvite,
} from "./team";

/**
 * Invitations must expire, be single-use, bind the email and the role, prohibit
 * privilege escalation, and never let the last Owner be removed.
 */

let tenant: Tenant;

async function invite(email: string, role: "OWNER" | "SENDER" | "VIEWER" = "SENDER") {
  return inviteMember({
    organizationId: tenant.organizationId,
    invitedBy: tenant.userId,
    email,
    role,
  });
}

beforeEach(async () => {
  await resetDb();
  tenant = await createTenant();
});
afterAll(closeDb);

describe("sending invitations", () => {
  it("creates a single-use token and writes the link to the mail sink", async () => {
    const { token } = await invite("newbie@example.test");

    const stored = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.id, tokenLookup(token)));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.kind).toBe("INVITE");
    expect(stored[0]!.role).toBe("SENDER");
    expect(stored[0]!.consumedAt).toBeNull();
    // Only the hash is stored; the token itself never touches the database.
    expect(stored[0]!.id).not.toBe(token);

    const mail = await db.select().from(mailSink);
    expect(mail[0]!.toEmail).toBe("newbie@example.test");
    expect(mail[0]!.link).toContain(token);
  });

  it("expires after seven days", async () => {
    const { token } = await invite("later@example.test");
    const stored = (
      await db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.id, tokenLookup(token)))
    )[0]!;

    const days = (stored.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("refuses to invite an existing member", async () => {
    const existing = (
      await db.select().from(users).where(eq(users.id, tenant.userId))
    )[0]!;
    await expect(invite(existing.email)).rejects.toMatchObject({ code: "ALREADY_MEMBER" });
  });

  it("refuses a second open invitation for the same address", async () => {
    await invite("dup@example.test");
    await expect(invite("dup@example.test")).rejects.toMatchObject({ code: "INVITE_EXISTS" });
  });

  it("normalizes the address so casing cannot create a duplicate", async () => {
    await invite("Mixed@Example.test");
    await expect(invite("mixed@example.test")).rejects.toMatchObject({
      code: "INVITE_EXISTS",
    });
  });
});

describe("accepting invitations", () => {
  it("creates the user, verifies the address and grants the invited role", async () => {
    const { token } = await invite("joiner@example.test", "VIEWER");

    const result = await acceptInvite({
      token,
      fullName: "New Joiner",
      password: "a-long-enough-password",
    });

    const members = await listMembers(tenant.organizationId);
    const joined = members.find((m) => m.email === "joiner@example.test")!;
    expect(joined.role).toBe("VIEWER");
    expect(joined.userId).toBe(result.userId);
    // The invitation itself proves control of the address.
    expect(joined.emailVerifiedAt).not.toBeNull();
  });

  it("cannot be used twice", async () => {
    const { token } = await invite("once@example.test");
    await acceptInvite({ token, fullName: "Once", password: "a-long-enough-password" });

    await expect(
      acceptInvite({ token, fullName: "Again", password: "a-long-enough-password" }),
    ).rejects.toMatchObject({ code: "INVITE_USED" });

    expect(await listMembers(tenant.organizationId)).toHaveLength(2);
  });

  it("rejects an expired invitation", async () => {
    const { token } = await invite("stale@example.test");
    await db
      .update(verificationTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(verificationTokens.id, tokenLookup(token)));

    await expect(
      acceptInvite({ token, fullName: "Stale", password: "a-long-enough-password" }),
    ).rejects.toMatchObject({ code: "INVITE_EXPIRED" });
    expect(await listMembers(tenant.organizationId)).toHaveLength(1);
  });

  it("rejects an unknown token", async () => {
    await expect(
      acceptInvite({ token: "not-a-real-token", password: "a-long-enough-password" }),
    ).rejects.toMatchObject({ code: "INVITE_INVALID" });
  });

  it("refuses a weak password for a new account", async () => {
    const { token } = await invite("weak@example.test");
    await expect(acceptInvite({ token, fullName: "Weak", password: "short" })).rejects.toThrow();
    expect(await listMembers(tenant.organizationId)).toHaveLength(1);
  });

  // The role is taken from the invitation row, never from the accept call.
  it("cannot be used to grant a higher role than was offered", async () => {
    const { token } = await invite("sneaky@example.test", "VIEWER");

    await acceptInvite({
      token,
      fullName: "Sneaky",
      password: "a-long-enough-password",
      // There is deliberately no role parameter to pass.
    } as Parameters<typeof acceptInvite>[0]);

    const members = await listMembers(tenant.organizationId);
    expect(members.find((m) => m.email === "sneaky@example.test")!.role).toBe("VIEWER");
  });

  it("a revoked invitation cannot be accepted", async () => {
    const { token } = await invite("revoked@example.test");
    const stored = (
      await db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.id, tokenLookup(token)))
    )[0]!;

    await revokeInvite({
      organizationId: tenant.organizationId,
      inviteId: stored.id,
      actorUserId: tenant.userId,
    });

    await expect(
      acceptInvite({ token, fullName: "Nope", password: "a-long-enough-password" }),
    ).rejects.toMatchObject({ code: "INVITE_INVALID" });
  });

  it("peeking does not consume the invitation", async () => {
    const { token } = await invite("peek@example.test", "SENDER");
    const details = await peekInvite(token);
    expect(details.email).toBe("peek@example.test");
    expect(details.role).toBe("SENDER");
    expect(details.userExists).toBe(false);

    // Still usable afterwards.
    await acceptInvite({ token, fullName: "Peek", password: "a-long-enough-password" });
    expect(await listMembers(tenant.organizationId)).toHaveLength(2);
  });
});

describe("the last owner", () => {
  async function addMember(email: string, role: "OWNER" | "SENDER" | "VIEWER") {
    const { token } = await invite(email, role);
    await acceptInvite({ token, fullName: email, password: "a-long-enough-password" });
    const members = await listMembers(tenant.organizationId);
    return members.find((m) => m.email === email)!;
  }

  it("cannot be removed", async () => {
    const members = await listMembers(tenant.organizationId);
    const owner = members.find((m) => m.role === "OWNER")!;

    await expect(
      removeMember({
        organizationId: tenant.organizationId,
        membershipId: owner.membershipId,
        actorUserId: tenant.userId,
      }),
    ).rejects.toMatchObject({ code: "LAST_OWNER" });

    expect(await listMembers(tenant.organizationId)).toHaveLength(1);
  });

  it("cannot be demoted", async () => {
    const members = await listMembers(tenant.organizationId);
    const owner = members.find((m) => m.role === "OWNER")!;

    await expect(
      changeRole({
        organizationId: tenant.organizationId,
        membershipId: owner.membershipId,
        role: "VIEWER",
        actorUserId: tenant.userId,
      }),
    ).rejects.toMatchObject({ code: "LAST_OWNER" });
  });

  it("can be removed once a second owner exists", async () => {
    await addMember("second-owner@example.test", "OWNER");

    const members = await listMembers(tenant.organizationId);
    const first = members.find((m) => m.userId === tenant.userId)!;

    await removeMember({
      organizationId: tenant.organizationId,
      membershipId: first.membershipId,
      actorUserId: tenant.userId,
    });

    const remaining = await listMembers(tenant.organizationId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.role).toBe("OWNER");
  });

  it("a non-owner can always be removed", async () => {
    const sender = await addMember("sender@example.test", "SENDER");
    await removeMember({
      organizationId: tenant.organizationId,
      membershipId: sender.membershipId,
      actorUserId: tenant.userId,
    });
    expect(await listMembers(tenant.organizationId)).toHaveLength(1);
  });
});

describe("tenant isolation", () => {
  it("cannot remove a member of another organization", async () => {
    const other = await createTenant();
    const otherMembers = await listMembers(other.organizationId);

    await expect(
      removeMember({
        organizationId: tenant.organizationId,
        membershipId: otherMembers[0]!.membershipId,
        actorUserId: tenant.userId,
      }),
    ).rejects.toMatchObject({ code: "NOT_A_MEMBER" });

    expect(await listMembers(other.organizationId)).toHaveLength(1);
  });

  it("cannot change a role in another organization", async () => {
    const other = await createTenant();
    const otherMembers = await listMembers(other.organizationId);

    await expect(
      changeRole({
        organizationId: tenant.organizationId,
        membershipId: otherMembers[0]!.membershipId,
        role: "VIEWER",
        actorUserId: tenant.userId,
      }),
    ).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
  });

  it("cannot revoke another organization's invitation", async () => {
    const other = await createTenant();
    const { token } = await inviteMember({
      organizationId: other.organizationId,
      invitedBy: other.userId,
      email: "theirs@example.test",
      role: "SENDER",
    });

    await revokeInvite({
      organizationId: tenant.organizationId,
      inviteId: tokenLookup(token),
      actorUserId: tenant.userId,
    });

    // Still there, and still usable.
    const stillThere = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.id, tokenLookup(token)),
          eq(verificationTokens.organizationId, other.organizationId),
        ),
      );
    expect(stillThere).toHaveLength(1);
  });

  it("accepting an invitation joins only the inviting organization", async () => {
    const other = await createTenant();
    const { token } = await invite("single@example.test", "SENDER");
    await acceptInvite({ token, fullName: "Single", password: "a-long-enough-password" });

    const joined = (
      await db.select().from(users).where(eq(users.email, "single@example.test"))
    )[0]!;
    const rows = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, joined.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.organizationId).toBe(tenant.organizationId);
    expect(rows[0]!.organizationId).not.toBe(other.organizationId);
  });
});
