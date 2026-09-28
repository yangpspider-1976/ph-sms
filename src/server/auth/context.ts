import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/server/env";
import { roleHas, type Permission } from "./rbac";
import { getMemberships, getSessionUser, type OrgContext, type SessionUser } from "./session";

export const ACTIVE_ORG_COOKIE = "ph_sms_org";

/** Thrown by the guards below; surfaced as a denied state, never as a stack trace. */
export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NOT_AUTHENTICATED"
      | "EMAIL_UNVERIFIED"
      | "NO_ORGANIZATION"
      | "ORG_NOT_ACTIVE"
      | "FORBIDDEN"
      | "MFA_REQUIRED",
    readonly supportRef: string = referenceId(),
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Short reference a user can quote to support; also written to the audit log. */
export function referenceId(): string {
  return `REF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export type AuthContext = {
  user: SessionUser;
  org: OrgContext;
  memberships: OrgContext[];
  can: (permission: Permission) => boolean;
};

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Resolves the active organization for this request.
 *
 * The cookie only *selects* among memberships the user already has; if it names
 * an organization they do not belong to it is ignored, so tampering with it
 * cannot reach another tenant.
 */
export async function requireOrgContext(options?: {
  allowInactive?: boolean;
}): Promise<AuthContext> {
  const user = await requireUser();
  if (!user.emailVerifiedAt) redirect("/verify-email");

  const list = await getMemberships(user.id);
  if (list.length === 0) redirect("/onboarding");

  const store = await cookies();
  const requested = store.get(ACTIVE_ORG_COOKIE)?.value;
  const org = list.find((m) => m.organizationId === requested) ?? list[0]!;

  if (!options?.allowInactive && org.organizationStatus !== "ACTIVE") {
    // Pending, suspended and rejected organizations can still see their status
    // page; they cannot reach anything that sends or spends.
    redirect("/app/account-status");
  }

  return {
    user,
    org,
    memberships: list,
    can: (permission: Permission) => roleHas(org.role, permission),
  };
}

/** Guard for a specific permission. Throws rather than silently doing nothing. */
export async function requirePermission(permission: Permission): Promise<AuthContext> {
  const ctx = await requireOrgContext();
  if (!ctx.can(permission)) {
    throw new AuthorizationError(
      `Your role (${ctx.org.role}) cannot perform this action.`,
      "FORBIDDEN",
    );
  }
  return ctx;
}

/**
 * Platform admin surface. Separate from the customer surface, and in LIVE it
 * additionally requires MFA on the current session.
 */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isPlatformAdmin) redirect("/app/dashboard");
  if (env.APP_MODE === "LIVE" && !user.adminMfaAt) redirect("/admin/mfa");
  return user;
}

/** Non-redirecting variant for server actions and route handlers. */
export async function currentContext(): Promise<AuthContext | null> {
  const user = await getSessionUser();
  if (!user || !user.emailVerifiedAt) return null;
  const list = await getMemberships(user.id);
  if (list.length === 0) return null;
  const store = await cookies();
  const requested = store.get(ACTIVE_ORG_COOKIE)?.value;
  const org = list.find((m) => m.organizationId === requested) ?? list[0]!;
  return {
    user,
    org,
    memberships: list,
    can: (permission: Permission) => roleHas(org.role, permission),
  };
}

/**
 * Authorizes an action for a server action or API route.
 * Returns the context or an error describing exactly why it was refused.
 */
export async function authorize(
  permission: Permission,
): Promise<{ ok: true; ctx: AuthContext } | { ok: false; error: AuthorizationError }> {
  const ctx = await currentContext();
  if (!ctx) {
    return {
      ok: false,
      error: new AuthorizationError("Sign in to continue.", "NOT_AUTHENTICATED"),
    };
  }
  if (ctx.org.organizationStatus !== "ACTIVE") {
    return {
      ok: false,
      error: new AuthorizationError(
        `This organization is ${ctx.org.organizationStatus.toLowerCase().replace("_", " ")} and cannot perform this action.`,
        "ORG_NOT_ACTIVE",
      ),
    };
  }
  if (!ctx.can(permission)) {
    return {
      ok: false,
      error: new AuthorizationError(
        `Your role (${ctx.org.role}) cannot perform this action.`,
        "FORBIDDEN",
      ),
    };
  }
  return { ok: true, ctx };
}
