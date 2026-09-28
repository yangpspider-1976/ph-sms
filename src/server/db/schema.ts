/**
 * Database schema.
 *
 * Rules encoded here on purpose (the server, not the UI, is authoritative):
 *  - every tenant-owned row carries organization_id;
 *  - money is integer centavos (bigint), never floating point;
 *  - phone numbers are stored encrypted + keyed-hash, with a display mask;
 *  - duplicate protection lives in unique indexes, not in application checks.
 */
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const now = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const orgStatus = pgEnum("org_status", [
  "PENDING_REVIEW",
  "NEEDS_INFORMATION",
  "ACTIVE",
  "SUSPENDED",
  "REJECTED",
]);

/** Platform Admin is not an organization role; it lives on the user record. */
export const orgRole = pgEnum("org_role", [
  "OWNER",
  "ORG_ADMIN",
  "SENDER",
  "APPROVER",
  "VIEWER",
]);

export const senderStatus = pgEnum("sender_status", [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "REVOKED",
]);

export const suppressionScope = pgEnum("suppression_scope", ["ORGANIZATION", "PLATFORM"]);

export const importStatus = pgEnum("import_status", [
  "UPLOADED",
  "PARSING",
  "READY",
  "FAILED",
  "EXPIRED",
]);

/** Mutually exclusive primary exclusion reason for an imported row. */
export const importRowStatus = pgEnum("import_row_status", [
  "ELIGIBLE",
  "BLANK",
  "INVALID",
  "DUPLICATE",
  "SUPPRESSED",
  "OVER_CEILING",
]);

export const messagePurpose = pgEnum("message_purpose", ["INFORMATIONAL", "PROMOTIONAL"]);

export const smsEncoding = pgEnum("sms_encoding", ["GSM7", "UCS2"]);

/** Campaign execution. FINISHED means no dispatch work remains, not "all delivered". */
export const campaignStatus = pgEnum("campaign_status", [
  "DRAFT",
  "PENDING_APPROVAL",
  "SCHEDULED",
  "QUEUED",
  "PROCESSING",
  "PAUSED_REVIEW",
  "FINISHED",
  "CANCELLED",
]);

/** Per-recipient submission to the provider. */
export const submissionStatus = pgEnum("submission_status", [
  "PENDING",
  "SUBMITTING",
  "ACCEPTED",
  "REJECTED",
  "UNKNOWN",
  "CANCELLED",
  "EXCLUDED",
]);

/** Delivery, only meaningful for ACCEPTED items. UNAVAILABLE = no conclusive receipt. */
export const deliveryStatus = pgEnum("delivery_status", [
  "PENDING",
  "DELIVERED",
  "UNDELIVERED",
  "EXPIRED",
  "UNAVAILABLE",
]);

/** PURCHASE/ADJUSTMENT/CHARGE/REFUND move posted balance; RESERVE/RELEASE move holds. */
export const ledgerType = pgEnum("ledger_type", [
  "PURCHASE",
  "PROMOTION",
  "ADJUSTMENT",
  "CHARGE",
  "REFUND",
  "RESERVE",
  "RELEASE",
  "EXPIRY",
]);

export const reservationStatus = pgEnum("reservation_status", [
  "ACTIVE",
  "CAPTURED",
  "RELEASED",
]);

export const paymentStatus = pgEnum("payment_status", [
  "PENDING",
  "PAID",
  "FAILED",
  "EXPIRED",
  "REFUNDED",
  "DISPUTED",
]);

export const quotaPeriod = pgEnum("quota_period", ["DAY", "MONTH"]);

export const jobStatus = pgEnum("job_status", [
  "PENDING",
  "CLAIMED",
  "DONE",
  "FAILED",
  "PAUSED",
]);

export const inquiryStatus = pgEnum("inquiry_status", [
  "NEW",
  "CONTACTED",
  "REVIEWING",
  "QUOTATION_SENT",
  "CONTRACTED",
  "COMPLETED",
  "REJECTED",
]);

export const appMode = pgEnum("app_mode", ["MOCK", "PARTNER_SANDBOX", "LIVE"]);

/* -------------------------------------------------------------------------- */
/* Organizations, users, membership                                           */
/* -------------------------------------------------------------------------- */

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    status: orgStatus("status").notNull().default("PENDING_REVIEW"),
    registrationId: text("registration_id"),
    address: text("address"),
    industry: text("industry"),
    websiteUrl: text("website_url"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    intendedUsage: text("intended_usage"),
    /** Null = platform default from configuration. */
    dailyDestinationLimit: integer("daily_destination_limit"),
    monthlyDestinationLimit: integer("monthly_destination_limit"),
    unitPriceCentavos: integer("unit_price_centavos"),
    statusReason: text("status_reason"),
    statusChangedBy: uuid("status_changed_by"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => [index("organizations_status_idx").on(t.status)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    mfaEnrolledAt: timestamp("mfa_enrolled_at", { withTimezone: true }),
    /** TOTP shared secret, encrypted at rest. Null until enrolled. */
    totpSecretEncrypted: text("totp_secret_encrypted"),
    /** SHA-256 of each unused recovery code; the codes themselves are shown once. */
    totpRecoveryHashes: jsonb("totp_recovery_hashes").$type<string[]>(),
    /**
     * Optional verified mobile (AUTH-02). Stored the same three ways as every
     * other number on the platform: ciphertext to read it back, keyed hash to
     * match it, mask to show it. Null until the user chooses to add one.
     */
    mobileEncrypted: text("mobile_encrypted"),
    mobileHmac: text("mobile_hmac"),
    mobileMask: text("mobile_mask"),
    mobileVerifiedAt: timestamp("mobile_verified_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(sql`lower(${t.email})`),
    index("users_mobile_hmac_idx").on(t.mobileHmac),
  ],
);

/**
 * A pending mobile-verification challenge.
 *
 * Separate from `verification_tokens` because that table keys on an email
 * address and stores its token in the clear for a link; this one holds a hash
 * of a short code that is texted to a phone, and short codes have to be
 * attempt-limited or six digits is no protection at all.
 */
export const mobileVerifications = pgTable(
  "mobile_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The number being proven, encrypted; only written to the user once proven. */
    phoneEncrypted: text("phone_encrypted").notNull(),
    phoneHmac: text("phone_hmac").notNull(),
    phoneMask: text("phone_mask").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: now(),
  },
  (t) => [index("mobile_verifications_user_idx").on(t.userId, t.createdAt)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRole("role").notNull(),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex("memberships_org_user_key").on(t.organizationId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the opaque token; the token itself is never stored. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    adminMfaAt: timestamp("admin_mfa_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: now(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Email verification, password reset and team invitation tokens (hashed). */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(), // EMAIL_VERIFY | PASSWORD_RESET | INVITE
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    email: text("email").notNull(),
    role: orgRole("role"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: now(),
  },
  (t) => [index("verification_tokens_email_idx").on(t.email, t.kind)],
);

/* -------------------------------------------------------------------------- */
/* Sender identities                                                          */
/* -------------------------------------------------------------------------- */

export const senderIdentities = pgTable(
  "sender_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    status: senderStatus("status").notNull().default("PENDING"),
    /** Whether the real sender can receive inbound replies (drives "Reply STOP"). */
    supportsInboundReplies: boolean("supports_inbound_replies").notNull().default(false),
    evidenceNote: text("evidence_note"),
    partnerReference: text("partner_reference"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionReason: text("decision_reason"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("sender_identities_org_value_key").on(t.organizationId, t.value),
    index("sender_identities_status_idx").on(t.status),
  ],
);

/* -------------------------------------------------------------------------- */
/* Contacts and suppression                                                   */
/* -------------------------------------------------------------------------- */

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    numberHash: text("number_hash").notNull(),
    numberEncrypted: text("number_encrypted").notNull(),
    numberMasked: text("number_masked").notNull(),
    keyVersion: smallint("key_version").notNull().default(1),
    firstName: text("first_name"),
    lastName: text("last_name"),
    custom: jsonb("custom").$type<Record<string, string>>(),
    tags: jsonb("tags").$type<string[]>(),
    consentSource: text("consent_source"),
    consentDate: timestamp("consent_date", { withTimezone: true }),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("contacts_org_number_key").on(t.organizationId, t.numberHash),
    index("contacts_org_idx").on(t.organizationId),
  ],
);

/**
 * Opt-out and safety blocks.
 * ORGANIZATION rows belong to one tenant; PLATFORM rows have organization_id NULL
 * and are only writable by a platform admin. Deleting a contact must not remove
 * the matching suppression row.
 */
export const suppressions = pgTable(
  "suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: suppressionScope("scope").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    numberHash: text("number_hash").notNull(),
    numberMasked: text("number_masked").notNull(),
    keyVersion: smallint("key_version").notNull().default(1),
    reason: text("reason").notNull(),
    evidenceRef: text("evidence_ref"),
    source: text("source").notNull(), // OPERATOR_INTAKE | INBOUND_REPLY | WEB_OPT_OUT | ADMIN
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex("suppressions_org_number_key")
      .on(t.organizationId, t.numberHash)
      .where(sql`${t.scope} = 'ORGANIZATION'`),
    uniqueIndex("suppressions_platform_number_key")
      .on(t.numberHash)
      .where(sql`${t.scope} = 'PLATFORM'`),
    index("suppressions_number_idx").on(t.numberHash),
  ],
);

export const contactGroups = pgTable(
  "contact_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("contact_groups_org_name_key").on(t.organizationId, t.name)],
);

export const contactGroupMembers = pgTable(
  "contact_group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => contactGroups.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    addedAt: now(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.contactId] }),
    index("contact_group_members_contact_idx").on(t.contactId),
  ],
);

/* -------------------------------------------------------------------------- */
/* CSV imports                                                                */
/* -------------------------------------------------------------------------- */

export const imports = pgTable(
  "imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    byteSize: integer("byte_size").notNull(),
    status: importStatus("status").notNull().default("UPLOADED"),
    /** Encrypted original; deleted by the retention job. */
    originalEncrypted: text("original_encrypted"),
    failureReason: text("failure_reason"),
    ignoredColumns: jsonb("ignored_columns").$type<string[]>(),
    rawRowCount: integer("raw_row_count").notNull().default(0),
    eligibleCount: integer("eligible_count").notNull().default(0),
    blankCount: integer("blank_count").notNull().default(0),
    invalidCount: integer("invalid_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    suppressedCount: integer("suppressed_count").notNull().default(0),
    overCeilingCount: integer("over_ceiling_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => [index("imports_org_idx").on(t.organizationId, t.createdAt)],
);

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sourceRowNumber: integer("source_row_number").notNull(),
    rawValue: text("raw_value"),
    numberHash: text("number_hash"),
    numberEncrypted: text("number_encrypted"),
    numberMasked: text("number_masked"),
    status: importRowStatus("status").notNull(),
    reasonDetail: text("reason_detail"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    custom: jsonb("custom").$type<Record<string, string>>(),
    consentSource: text("consent_source"),
    consentDate: text("consent_date"),
  },
  (t) => [
    index("import_rows_import_idx").on(t.importId, t.status),
    uniqueIndex("import_rows_import_row_key").on(t.importId, t.sourceRowNumber),
  ],
);

/* -------------------------------------------------------------------------- */
/* Templates and quotes                                                       */
/* -------------------------------------------------------------------------- */

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    body: text("body").notNull(),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("templates_org_name_version_key").on(t.organizationId, t.name, t.version)],
);

/**
 * Immutable priced offer. Confirmation is bound to the exact quote id, its
 * content hash, its recipient snapshot hash and the authenticated user.
 */
export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    senderIdentityId: uuid("sender_identity_id")
      .notNull()
      .references(() => senderIdentities.id, { onDelete: "restrict" }),
    purpose: messagePurpose("purpose").notNull(),
    body: text("body").notNull(),
    bodyHash: text("body_hash").notNull(),
    recipientHash: text("recipient_hash").notNull(),
    recipientSnapshot: text("recipient_snapshot").notNull(), // encrypted JSON array
    encoding: smsEncoding("encoding").notNull(),
    segmentsPerMessage: integer("segments_per_message").notNull(),
    recipientCount: integer("recipient_count").notNull(),
    segmentTotal: integer("segment_total").notNull(),
    unitPriceCentavos: integer("unit_price_centavos").notNull(),
    maxAuthorizedCostCentavos: bigint("max_authorized_cost_centavos", { mode: "number" })
      .notNull(),
    pricingPolicyVersion: integer("pricing_policy_version").notNull(),
    taxPolicyVersion: integer("tax_policy_version").notNull(),
    exclusions: jsonb("exclusions").$type<Record<string, number>>().notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedByCampaignId: uuid("consumed_by_campaign_id"),
    isTestSend: boolean("is_test_send").notNull().default(false),
    /** Decided by content checks at quote time; carried into the campaign. */
    requiresApproval: boolean("requires_approval").notNull().default(false),
    approvalReason: text("approval_reason"),
    createdAt: now(),
  },
  (t) => [index("quotes_org_idx").on(t.organizationId, t.createdAt)],
);

/* -------------------------------------------------------------------------- */
/* Campaigns and message items                                                */
/* -------------------------------------------------------------------------- */

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    status: campaignStatus("status").notNull().default("QUEUED"),
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "restrict" }),
    senderIdentityId: uuid("sender_identity_id")
      .notNull()
      .references(() => senderIdentities.id, { onDelete: "restrict" }),
    senderValueSnapshot: text("sender_value_snapshot").notNull(),
    purpose: messagePurpose("purpose").notNull(),
    body: text("body").notNull(),
    bodyHash: text("body_hash").notNull(),
    encoding: smsEncoding("encoding").notNull(),
    segmentsPerMessage: integer("segments_per_message").notNull(),
    unitPriceCentavos: integer("unit_price_centavos").notNull(),
    pricingPolicyVersion: integer("pricing_policy_version").notNull(),
    maxAuthorizedCostCentavos: bigint("max_authorized_cost_centavos", { mode: "number" })
      .notNull(),
    requestedCount: integer("requested_count").notNull(),
    includedCount: integer("included_count").notNull(),
    exclusions: jsonb("exclusions").$type<Record<string, number>>().notNull(),
    isTestSend: boolean("is_test_send").notNull().default(false),
    /** Set when content checks flag a campaign; cleared by an approver. */
    requiresApproval: boolean("requires_approval").notNull().default(false),
    approvalReason: text("approval_reason"),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedBy: uuid("rejected_by").references(() => users.id, { onDelete: "set null" }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    pausedReason: text("paused_reason"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => [
    index("campaigns_org_idx").on(t.organizationId, t.createdAt),
    index("campaigns_status_idx").on(t.status),
    uniqueIndex("campaigns_quote_key").on(t.quoteId),
  ],
);

export const messageItems = pgTable(
  "message_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Stable idempotency key handed to the provider; never regenerated. */
    stableKey: text("stable_key").notNull(),
    numberHash: text("number_hash").notNull(),
    numberEncrypted: text("number_encrypted").notNull(),
    numberMasked: text("number_masked").notNull(),
    segments: integer("segments").notNull(),
    costCentavos: integer("cost_centavos").notNull(),
    submissionStatus: submissionStatus("submission_status").notNull().default("PENDING"),
    deliveryStatus: deliveryStatus("delivery_status").notNull().default("PENDING"),
    partnerReference: text("partner_reference"),
    errorCategory: text("error_category"),
    errorCode: text("error_code"),
    excludedReason: text("excluded_reason"),
    attempts: integer("attempts").notNull().default(0),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    charged: boolean("charged").notNull().default(false),
    updatedAt: updated(),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex("message_items_stable_key").on(t.stableKey),
    uniqueIndex("message_items_campaign_number_key").on(t.campaignId, t.numberHash),
    index("message_items_campaign_idx").on(t.campaignId, t.submissionStatus),
    index("message_items_partner_ref_idx").on(t.partnerReference),
  ],
);

/* -------------------------------------------------------------------------- */
/* Wallet, ledger, reservations                                               */
/* -------------------------------------------------------------------------- */

export const wallets = pgTable("wallets", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  /** Settled funds. available = postedBalance - heldCentavos. */
  postedBalanceCentavos: bigint("posted_balance_centavos", { mode: "number" })
    .notNull()
    .default(0),
  heldCentavos: bigint("held_centavos", { mode: "number" }).notNull().default(0),
  /** Negative balance owed after a chargeback; blocks sending until cleared. */
  debtCentavos: bigint("debt_centavos", { mode: "number" }).notNull().default(0),
  sendingFrozen: boolean("sending_frozen").notNull().default(false),
  updatedAt: updated(),
});

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: ledgerType("type").notNull(),
    /** Signed. Never mutated; corrections are compensating entries. */
    amountCentavos: bigint("amount_centavos", { mode: "number" }).notNull(),
    postedBalanceAfter: bigint("posted_balance_after", { mode: "number" }).notNull(),
    heldAfter: bigint("held_after", { mode: "number" }).notNull(),
    operationRef: text("operation_ref").notNull(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    reservationId: uuid("reservation_id"),
    paymentId: uuid("payment_id"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason"),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex("ledger_entries_operation_ref_key").on(t.operationRef),
    index("ledger_entries_org_idx").on(t.organizationId, t.createdAt),
  ],
);

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    amountCentavos: bigint("amount_centavos", { mode: "number" }).notNull(),
    capturedCentavos: bigint("captured_centavos", { mode: "number" }).notNull().default(0),
    releasedCentavos: bigint("released_centavos", { mode: "number" }).notNull().default(0),
    status: reservationStatus("status").notNull().default("ACTIVE"),
    createdAt: now(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("reservations_org_idx").on(t.organizationId, t.status)],
);

/* -------------------------------------------------------------------------- */
/* Quota                                                                      */
/* -------------------------------------------------------------------------- */

export const quotaBuckets = pgTable(
  "quota_buckets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    period: quotaPeriod("period").notNull(),
    /** Asia/Manila calendar key: YYYY-MM-DD for DAY, YYYY-MM for MONTH. */
    periodKey: text("period_key").notNull(),
    limitCount: integer("limit_count").notNull(),
    reservedCount: integer("reserved_count").notNull().default(0),
    consumedCount: integer("consumed_count").notNull().default(0),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("quota_buckets_org_period_key").on(t.organizationId, t.period, t.periodKey),
  ],
);

export const quotaReservations = pgTable(
  "quota_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    bucketId: uuid("bucket_id")
      .notNull()
      .references(() => quotaBuckets.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    consumed: integer("consumed").notNull().default(0),
    status: reservationStatus("status").notNull().default("ACTIVE"),
    createdAt: now(),
  },
  (t) => [index("quota_reservations_campaign_idx").on(t.campaignId, t.status)],
);

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Business payment reference; deduplicated independently of event ids. */
    reference: text("reference").notNull(),
    provider: text("provider").notNull(),
    environment: text("environment").notNull(),
    merchantId: text("merchant_id"),
    checkoutId: text("checkout_id"),
    packageCode: text("package_code").notNull(),
    packageSnapshot: jsonb("package_snapshot").$type<Record<string, unknown>>().notNull(),
    amountCentavos: bigint("amount_centavos", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("PHP"),
    creditCentavos: bigint("credit_centavos", { mode: "number" }).notNull(),
    status: paymentStatus("status").notNull().default("PENDING"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("payments_provider_reference_key").on(t.provider, t.reference),
    index("payments_org_idx").on(t.organizationId, t.createdAt),
  ],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    externalEventId: text("external_event_id").notNull(),
    type: text("type").notNull(),
    paymentReference: text("payment_reference"),
    signatureValid: boolean("signature_valid").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    outcome: text("outcome"),
    receivedAt: now(),
  },
  (t) => [
    uniqueIndex("payment_events_provider_event_key").on(t.provider, t.externalEventId),
    index("payment_events_reference_idx").on(t.paymentReference),
  ],
);

/* -------------------------------------------------------------------------- */
/* Dispatch jobs and provider events                                          */
/* -------------------------------------------------------------------------- */

export const dispatchJobs = pgTable(
  "dispatch_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("DISPATCH_CAMPAIGN"),
    status: jobStatus("status").notNull().default("PENDING"),
    runAt: timestamp("run_at", { withTimezone: true }).notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => [
    index("dispatch_jobs_claim_idx").on(t.status, t.runAt),
    uniqueIndex("dispatch_jobs_campaign_kind_key").on(t.campaignId, t.kind),
  ],
);

export const dispatchAttempts = pgTable(
  "dispatch_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageItemId: uuid("message_item_id")
      .notNull()
      .references(() => messageItems.id, { onDelete: "cascade" }),
    attemptNo: integer("attempt_no").notNull(),
    outcome: text("outcome").notNull(),
    errorCategory: text("error_category"),
    errorCode: text("error_code"),
    latencyMs: integer("latency_ms"),
    correlationId: text("correlation_id"),
    createdAt: now(),
  },
  (t) => [index("dispatch_attempts_item_idx").on(t.messageItemId)],
);

export const providerEvents = pgTable(
  "provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    externalEventId: text("external_event_id").notNull(),
    signatureValid: boolean("signature_valid").notNull(),
    /** Provider's own reference or our stable key; resolved via stored mappings. */
    reference: text("reference"),
    mappedStatus: text("mapped_status"),
    messageItemId: uuid("message_item_id").references(() => messageItems.id, {
      onDelete: "set null",
    }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    outcome: text("outcome"),
    quarantined: boolean("quarantined").notNull().default(false),
    receivedAt: now(),
  },
  (t) => [
    uniqueIndex("provider_events_provider_event_key").on(t.provider, t.externalEventId),
    index("provider_events_reference_idx").on(t.reference),
  ],
);

/* -------------------------------------------------------------------------- */
/* Inquiries, notifications, mail sink, audit, configuration                  */
/* -------------------------------------------------------------------------- */

export const inquiries = pgTable(
  "inquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    company: text("company").notNull(),
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone"),
    estimatedVolume: integer("estimated_volume").notNull(),
    frequency: text("frequency").notNull(),
    purpose: messagePurpose("purpose").notNull(),
    audience: text("audience").notNull(),
    preferredDate: text("preferred_date"),
    sampleMessage: text("sample_message").notNull(),
    senderNeeds: text("sender_needs"),
    consentSource: text("consent_source"),
    status: inquiryStatus("status").notNull().default("NEW"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    internalNote: text("internal_note"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => [index("inquiries_status_idx").on(t.status, t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: now(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

/** Local development mail sink. No message leaves the machine in MOCK mode. */
export const mailSink = pgTable(
  "mail_sink",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    createdAt: now(),
  },
  (t) => [index("mail_sink_created_idx").on(t.createdAt)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorKind: text("actor_kind").notNull(), // USER | PLATFORM_ADMIN | SYSTEM
    action: text("action").notNull(),
    objectType: text("object_type"),
    objectId: text("object_id"),
    /** Redacted: never full phone numbers or message bodies. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: now(),
  },
  (t) => [
    index("audit_events_org_idx").on(t.organizationId, t.createdAt),
    index("audit_events_action_idx").on(t.action, t.createdAt),
  ],
);

/** Versioned, validated runtime configuration. Demo values never auto-promote to LIVE. */
export const appConfig = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  version: integer("version").notNull().default(1),
  mode: appMode("mode").notNull().default("MOCK"),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: updated(),
});

export const appConfigVersions = pgTable(
  "app_config_versions",
  {
    key: text("key").notNull(),
    version: integer("version").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    mode: appMode("mode").notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: now(),
  },
  (t) => [primaryKey({ columns: [t.key, t.version] })],
);

/**
 * Rate-limit counters (SEC-06).
 *
 * In the database rather than in memory because the app runs as more than one
 * process. The subject is a keyed hash: an IP address is personal data and this
 * table is not a reason to keep a visitor log.
 */
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bucket: text("bucket").notNull(),
    subjectHash: text("subject_hash").notNull(),
    createdAt: now(),
  },
  (t) => [index("rate_limit_hits_lookup_idx").on(t.bucket, t.subjectHash, t.createdAt)],
);

/** Idempotency records for state-changing endpoints and server actions. */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    scope: text("scope").notNull(),
    requestHash: text("request_hash").notNull(),
    responseRef: text("response_ref"),
    createdAt: now(),
  },
  (t) => [index("idempotency_keys_org_idx").on(t.organizationId, t.scope)],
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  memberships: many(memberships),
  senderIdentities: many(senderIdentities),
  campaigns: many(campaigns),
  wallet: one(wallets, {
    fields: [organizations.id],
    references: [wallets.organizationId],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  sessions: many(sessions),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [memberships.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [campaigns.organizationId],
    references: [organizations.id],
  }),
  senderIdentity: one(senderIdentities, {
    fields: [campaigns.senderIdentityId],
    references: [senderIdentities.id],
  }),
  items: many(messageItems),
}));

export const messageItemsRelations = relations(messageItems, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [messageItems.campaignId],
    references: [campaigns.id],
  }),
}));

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type MessageItem = typeof messageItems.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type SenderIdentity = typeof senderIdentities.$inferSelect;
export type OrgRole = (typeof orgRole.enumValues)[number];
export type AppMode = (typeof appMode.enumValues)[number];
