import type { OrgRole } from "@/server/db/schema";

/**
 * Permission model.
 *
 * Every check is evaluated on the server against the authenticated user's
 * membership. The UI hides what a role cannot do, but hiding a button is a
 * courtesy, not a control — the server refuses the action either way.
 */
export const PERMISSIONS = [
  "campaign.view",
  "campaign.create",
  "campaign.send",
  "campaign.test",
  "campaign.cancel",
  /** Release a campaign that content checks held for review. */
  "campaign.approve",
  "contacts.view",
  "contacts.manage",
  "suppression.view",
  "suppression.manage",
  "templates.view",
  "templates.manage",
  "sender.view",
  "sender.apply",
  "billing.view",
  "billing.manage",
  "team.view",
  "team.manage",
  "reports.view",
  "reports.export.masked",
  "reports.export.full",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const OWNER: Permission[] = [...PERMISSIONS];

/**
 * Organization Admin: everything operational, nothing financial.
 *
 * The distinction from Owner is deliberate — an operations manager needs
 * contacts, templates, sender identities and campaign settings without being
 * able to spend money, change roles or unmask phone numbers.
 */
const ORG_ADMIN: Permission[] = [
  "campaign.view",
  "campaign.create",
  "campaign.send",
  "campaign.test",
  "campaign.cancel",
  "contacts.view",
  "contacts.manage",
  "suppression.view",
  "suppression.manage",
  "templates.view",
  "templates.manage",
  "sender.view",
  "sender.apply",
  "billing.view",
  "team.view",
  "reports.view",
  "reports.export.masked",
  "settings.manage",
];

const SENDER: Permission[] = [
  "campaign.view",
  "campaign.create",
  "campaign.send",
  "campaign.test",
  "campaign.cancel",
  "contacts.view",
  "suppression.view",
  "templates.view",
  "templates.manage",
  "sender.view",
  "reports.view",
  "reports.export.masked",
  "billing.view",
];

/**
 * Approver: reviews what the content checks flagged.
 *
 * Deliberately cannot create or send. Separating "writes the message" from
 * "releases the message" is the entire point of an approval step — an approver
 * who can also send can approve their own work.
 */
const APPROVER: Permission[] = [
  "campaign.view",
  "campaign.approve",
  "campaign.cancel",
  "contacts.view",
  "suppression.view",
  "templates.view",
  "sender.view",
  "reports.view",
  "reports.export.masked",
  "billing.view",
];

/** Read-only, masked. A Viewer cannot export unmasked data or send anything. */
const VIEWER: Permission[] = [
  "campaign.view",
  "contacts.view",
  "suppression.view",
  "templates.view",
  "sender.view",
  "reports.view",
  "reports.export.masked",
  "billing.view",
];

const ROLE_PERMISSIONS: Record<OrgRole, Permission[]> = {
  OWNER,
  ORG_ADMIN,
  SENDER,
  APPROVER,
  VIEWER,
};

export function roleHas(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: OrgRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

/** Roles that can release a held campaign. */
export const APPROVING_ROLES: OrgRole[] = ["OWNER", "APPROVER"];

/** Display order, most to least privileged. */
/**
 * Role order for pickers and guides. The words themselves live in the locale
 * dictionaries (`roles.labels`, `roles.descriptions`), because they are read by
 * customers and have to be translated.
 */
export const ROLE_ORDER: OrgRole[] = ["OWNER", "ORG_ADMIN", "APPROVER", "SENDER", "VIEWER"];

/**
 * Badge tone per role. Kept here rather than in each page so that adding a role
 * is one edit — the previous copies in the team pages silently stopped covering
 * the roles added for the approval workflow.
 */
export const ROLE_TONES: Record<OrgRole, "brand" | "info" | "warning" | "neutral"> = {
  OWNER: "brand",
  ORG_ADMIN: "brand",
  APPROVER: "warning",
  SENDER: "info",
  VIEWER: "neutral",
};
