"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorize } from "@/server/auth/context";
import { createSession } from "@/server/auth/session";
import { orgRole } from "@/server/db/schema";
import {
  acceptInvite,
  changeRole,
  inviteMember,
  removeMember,
  revokeInvite,
  TeamError,
} from "@/server/domain/team";

export type TeamResult = { ok: boolean; message: string };

/**
 * Derived from the database enum rather than restated, so a role added to the
 * schema is accepted here instead of being silently rejected as invalid.
 */
const ROLES = orgRole.enumValues;

export async function inviteMemberAction(formData: FormData): Promise<TeamResult> {
  const auth = await authorize("team.manage");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const parsed = z
    .object({
      email: z.string().email("Enter a valid email address."),
      role: z.enum(ROLES),
    })
    .safeParse({ email: formData.get("email"), role: formData.get("role") });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That invitation is not valid." };
  }

  try {
    await inviteMember({
      organizationId: auth.ctx.org.organizationId,
      invitedBy: auth.ctx.user.id,
      email: parsed.data.email,
      role: parsed.data.role,
    });
  } catch (err) {
    if (err instanceof TeamError) return { ok: false, message: err.message };
    throw err;
  }

  revalidatePath("/app/settings/team");
  return {
    ok: true,
    message: `Invitation sent to ${parsed.data.email}. It expires in 7 days and can be used once.`,
  };
}

export async function revokeInviteAction(inviteId: string): Promise<TeamResult> {
  const auth = await authorize("team.manage");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  await revokeInvite({
    organizationId: auth.ctx.org.organizationId,
    inviteId,
    actorUserId: auth.ctx.user.id,
  });

  revalidatePath("/app/settings/team");
  return { ok: true, message: "Invitation revoked." };
}

export async function changeRoleAction(formData: FormData): Promise<TeamResult> {
  const auth = await authorize("team.manage");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const parsed = z
    .object({ membershipId: z.string().uuid(), role: z.enum(ROLES) })
    .safeParse({ membershipId: formData.get("membershipId"), role: formData.get("role") });

  if (!parsed.success) return { ok: false, message: "That change is not valid." };

  try {
    await changeRole({
      organizationId: auth.ctx.org.organizationId,
      membershipId: parsed.data.membershipId,
      role: parsed.data.role,
      actorUserId: auth.ctx.user.id,
    });
  } catch (err) {
    if (err instanceof TeamError) return { ok: false, message: err.message };
    throw err;
  }

  revalidatePath("/app/settings/team");
  return { ok: true, message: "Role updated." };
}

export async function removeMemberAction(membershipId: string): Promise<TeamResult> {
  const auth = await authorize("team.manage");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  try {
    await removeMember({
      organizationId: auth.ctx.org.organizationId,
      membershipId,
      actorUserId: auth.ctx.user.id,
    });
  } catch (err) {
    if (err instanceof TeamError) return { ok: false, message: err.message };
    throw err;
  }

  revalidatePath("/app/settings/team");
  return { ok: true, message: "Member removed." };
}

export type AcceptResult = { ok: false; message: string };

/**
 * Accepts an invitation.
 *
 * Unauthenticated on purpose — the token is the credential, and the role comes
 * from the invitation rather than from this form, so accepting cannot grant
 * more access than was offered.
 */
export async function acceptInviteAction(formData: FormData): Promise<AcceptResult | never> {
  const parsed = z
    .object({
      token: z.string().min(10),
      fullName: z.string().max(200).optional(),
      password: z.string().max(200).optional(),
    })
    .safeParse({
      token: formData.get("token"),
      fullName: String(formData.get("fullName") ?? ""),
      password: String(formData.get("password") ?? ""),
    });

  if (!parsed.success) return { ok: false, message: "That invitation link is not valid." };

  let result: { userId: string; organizationId: string };
  try {
    result = await acceptInvite({
      token: parsed.data.token,
      fullName: parsed.data.fullName,
      password: parsed.data.password,
    });
  } catch (err) {
    if (err instanceof TeamError) return { ok: false, message: err.message };
    throw err;
  }

  await createSession(result.userId);
  redirect("/app/dashboard");
}
