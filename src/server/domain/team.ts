import "server-only";
import { and, count, eq, ne } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import {
  mailSink,
  memberships,
  organizations,
  users,
  verificationTokens,
} from "@/server/db/schema";
import type { OrgRole } from "@/server/db/schema";
import { newToken, tokenLookup } from "@/server/security/crypto";
import { hashPassword } from "@/server/auth/session";
import { recordAudit } from "@/server/audit";
import { sendMail } from "@/server/providers/mail";

/**
 * Team membership and invitations.
 *
 * Invitations expire, are single-use, and bind both the email address and the
 * role. Binding the email matters: without it a forwarded link would let anyone
 * join. Binding the role matters because otherwise the invitee chooses their own
 * permissions.
 *
 * The last Owner cannot be removed or demoted. An organization without an Owner
 * has nobody who can manage billing, restore access or invite a replacement.
 */

export class TeamError extends Error {
  constructor(
    message: string,
    readonly code:
      | "ALREADY_MEMBER"
      | "INVITE_EXISTS"
      | "INVITE_INVALID"
      | "INVITE_EXPIRED"
      | "INVITE_USED"
      | "EMAIL_MISMATCH"
      | "LAST_OWNER"
      | "NOT_A_MEMBER",
  ) {
    super(message);
    this.name = "TeamError";
  }
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function listMembers(organizationId: string) {
  return db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      role: memberships.role,
      emailVerifiedAt: users.emailVerifiedAt,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId))
    .orderBy(memberships.createdAt);
}

export async function listPendingInvites(organizationId: string) {
  return db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.organizationId, organizationId),
        eq(verificationTokens.kind, "INVITE"),
      ),
    )
    .orderBy(verificationTokens.createdAt);
}

async function ownerCount(tx: DbOrTx, organizationId: string): Promise<number> {
  const rows = await tx
    .select({ n: count() })
    .from(memberships)
    .where(
      and(eq(memberships.organizationId, organizationId), eq(memberships.role, "OWNER")),
    );
  return Number(rows[0]?.n ?? 0);
}

/** Creates a single-use invitation and writes the link to the mail sink. */
export async function inviteMember(input: {
  organizationId: string;
  invitedBy: string;
  email: string;
  role: OrgRole;
}): Promise<{ token: string }> {
  const email = input.email.trim().toLowerCase();

  const existing = await db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(eq(memberships.organizationId, input.organizationId), eq(users.email, email)),
    );
  if (existing.length > 0) {
    throw new TeamError("That person is already on the team.", "ALREADY_MEMBER");
  }

  const pending = await db
    .select({ id: verificationTokens.id })
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.organizationId, input.organizationId),
        eq(verificationTokens.email, email),
        eq(verificationTokens.kind, "INVITE"),
      ),
    );
  if (pending.length > 0) {
    throw new TeamError("An invitation is already open for that address.", "INVITE_EXISTS");
  }

  const { token, lookup } = newToken();

  await db.transaction(async (tx) => {
    const org = (
      await tx
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, input.organizationId))
        .limit(1)
    )[0];

    await tx.insert(verificationTokens).values({
      id: lookup,
      kind: "INVITE",
      organizationId: input.organizationId,
      email,
      // The role is fixed at invitation time; the invitee cannot choose it.
      role: input.role,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      createdBy: input.invitedBy,
    });

    await sendMail(
      {
        to: email,
        subject: `You have been invited to ${org?.name ?? "an organization"}`,
        body: `You were invited as ${input.role.toLowerCase()}. The link expires in 7 days.`,
        link: `/invite?token=${token}`,
      },
      tx,
    );

    await recordAudit(
      {
        action: "team.invited",
        organizationId: input.organizationId,
        actorUserId: input.invitedBy,
        objectType: "invitation",
        metadata: { email, role: input.role },
      },
      tx,
    );
  });

  return { token };
}

export type InviteDetails = {
  email: string;
  role: OrgRole;
  organizationId: string;
  organizationName: string;
  userExists: boolean;
};

/** Reads an invitation without consuming it, for the acceptance screen. */
export async function peekInvite(token: string): Promise<InviteDetails> {
  const rows = await db
    .select({
      email: verificationTokens.email,
      role: verificationTokens.role,
      organizationId: verificationTokens.organizationId,
      expiresAt: verificationTokens.expiresAt,
      consumedAt: verificationTokens.consumedAt,
      organizationName: organizations.name,
    })
    .from(verificationTokens)
    .leftJoin(organizations, eq(organizations.id, verificationTokens.organizationId))
    .where(
      and(eq(verificationTokens.id, tokenLookup(token)), eq(verificationTokens.kind, "INVITE")),
    )
    .limit(1);

  const invite = rows[0];
  if (!invite || !invite.organizationId || !invite.role) {
    throw new TeamError("That invitation link is not valid.", "INVITE_INVALID");
  }
  if (invite.consumedAt) {
    throw new TeamError("That invitation has already been used.", "INVITE_USED");
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    throw new TeamError("That invitation has expired. Ask for a new one.", "INVITE_EXPIRED");
  }

  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, invite.email))
    .limit(1);

  return {
    email: invite.email,
    role: invite.role,
    organizationId: invite.organizationId,
    organizationName: invite.organizationName ?? "the organization",
    userExists: existingUser.length > 0,
  };
}

/**
 * Consumes an invitation, creating the user if needed.
 *
 * The membership is created with the role recorded on the invitation, never one
 * supplied by the caller, so accepting cannot escalate privilege.
 */
export async function acceptInvite(input: {
  token: string;
  fullName?: string;
  password?: string;
}): Promise<{ userId: string; organizationId: string }> {
  const lookup = tokenLookup(input.token);

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(verificationTokens)
      .where(and(eq(verificationTokens.id, lookup), eq(verificationTokens.kind, "INVITE")))
      .for("update")
      .limit(1);

    const invite = rows[0];
    if (!invite || !invite.organizationId || !invite.role) {
      throw new TeamError("That invitation link is not valid.", "INVITE_INVALID");
    }
    if (invite.consumedAt) {
      throw new TeamError("That invitation has already been used.", "INVITE_USED");
    }
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new TeamError("That invitation has expired.", "INVITE_EXPIRED");
    }

    let user = (
      await tx.select().from(users).where(eq(users.email, invite.email)).limit(1)
    )[0];

    if (!user) {
      if (!input.password || input.password.length < 12) {
        throw new TeamError("Choose a password of at least 12 characters.", "INVITE_INVALID");
      }
      const inserted = await tx
        .insert(users)
        .values({
          email: invite.email,
          passwordHash: await hashPassword(input.password),
          fullName: input.fullName?.trim() || invite.email.split("@")[0]!,
          // The invitation itself proves control of the address.
          emailVerifiedAt: new Date(),
        })
        .returning();
      user = inserted[0]!;
    }

    await tx
      .insert(memberships)
      .values({
        organizationId: invite.organizationId,
        userId: user.id,
        role: invite.role,
      })
      .onConflictDoNothing();

    // Single use: consumed inside the same transaction that grants access.
    await tx
      .update(verificationTokens)
      .set({ consumedAt: new Date() })
      .where(eq(verificationTokens.id, lookup));

    await recordAudit(
      {
        action: "team.invite_accepted",
        organizationId: invite.organizationId,
        actorUserId: user.id,
        objectType: "membership",
        metadata: { role: invite.role },
      },
      tx,
    );

    return { userId: user.id, organizationId: invite.organizationId };
  });
}

export async function revokeInvite(input: {
  organizationId: string;
  inviteId: string;
  actorUserId: string;
}): Promise<void> {
  await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.id, input.inviteId),
        eq(verificationTokens.organizationId, input.organizationId),
        eq(verificationTokens.kind, "INVITE"),
      ),
    );

  await recordAudit({
    action: "team.invite_revoked",
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    objectType: "invitation",
    objectId: input.inviteId,
  });
}

/** Changes a member's role. Refuses to demote the last Owner. */
export async function changeRole(input: {
  organizationId: string;
  membershipId: string;
  role: OrgRole;
  actorUserId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const current = (
      await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.id, input.membershipId),
            eq(memberships.organizationId, input.organizationId),
          ),
        )
        .for("update")
        .limit(1)
    )[0];

    if (!current) throw new TeamError("That member was not found.", "NOT_A_MEMBER");
    if (current.role === input.role) return;

    if (current.role === "OWNER" && (await ownerCount(tx, input.organizationId)) <= 1) {
      throw new TeamError(
        "This is the last owner. Promote someone else before changing this role.",
        "LAST_OWNER",
      );
    }

    await tx
      .update(memberships)
      .set({ role: input.role })
      .where(eq(memberships.id, input.membershipId));

    await recordAudit(
      {
        action: "team.role_changed",
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        objectType: "membership",
        objectId: input.membershipId,
        metadata: { from: current.role, to: input.role },
      },
      tx,
    );
  });
}

/** Removes a member. Refuses to remove the last Owner. */
export async function removeMember(input: {
  organizationId: string;
  membershipId: string;
  actorUserId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const current = (
      await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.id, input.membershipId),
            eq(memberships.organizationId, input.organizationId),
          ),
        )
        .for("update")
        .limit(1)
    )[0];

    if (!current) throw new TeamError("That member was not found.", "NOT_A_MEMBER");

    if (current.role === "OWNER" && (await ownerCount(tx, input.organizationId)) <= 1) {
      throw new TeamError(
        "This is the last owner. An organization must keep at least one.",
        "LAST_OWNER",
      );
    }

    await tx.delete(memberships).where(eq(memberships.id, input.membershipId));

    await recordAudit(
      {
        action: "team.member_removed",
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        objectType: "membership",
        objectId: input.membershipId,
        metadata: { role: current.role },
      },
      tx,
    );
  });
}

/** Other owners, used to check whether a destructive change is safe. */
export async function otherOwners(
  organizationId: string,
  excludingMembershipId: string,
): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.role, "OWNER"),
        ne(memberships.id, excludingMembershipId),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}
