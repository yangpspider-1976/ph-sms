import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { campaigns, messageItems } from "@/server/db/schema";

/**
 * Scoped campaign reads.
 *
 * Every query here takes the organization id and applies it in the WHERE
 * clause, so a row belonging to another tenant does not resolve — it comes back
 * as "not found" rather than as a permission error, which also avoids
 * confirming that the id exists at all.
 *
 * These live in one place so the pages and the tests exercise the same
 * predicate rather than each writing their own.
 */

export async function getCampaignForOrg(campaignId: string, organizationId: string) {
  const rows = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, organizationId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listCampaignsForOrg(
  organizationId: string,
  options: { scheduledOnly?: boolean; limit?: number } = {},
) {
  const where = options.scheduledOnly
    ? and(eq(campaigns.organizationId, organizationId), eq(campaigns.status, "SCHEDULED"))
    : eq(campaigns.organizationId, organizationId);

  return db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      includedCount: campaigns.includedCount,
      scheduledAt: campaigns.scheduledAt,
      createdAt: campaigns.createdAt,
      cost: campaigns.maxAuthorizedCostCentavos,
      accepted: sql<number>`(
        select count(*) from ${messageItems}
        where ${messageItems.campaignId} = ${campaigns.id}
          and ${messageItems.submissionStatus} = 'ACCEPTED'
      )::int`,
      delivered: sql<number>`(
        select count(*) from ${messageItems}
        where ${messageItems.campaignId} = ${campaigns.id}
          and ${messageItems.deliveryStatus} = 'DELIVERED'
      )::int`,
    })
    .from(campaigns)
    .where(where)
    .orderBy(desc(campaigns.createdAt))
    .limit(options.limit ?? 100);
}

/**
 * Recipient rows for a campaign.
 *
 * Scoped on the message items themselves as well as the campaign, so this is
 * safe even if a caller passes a campaign id it did not check first.
 */
export async function listCampaignItemsForOrg(
  campaignId: string,
  organizationId: string,
  limit = 200,
) {
  return db
    .select()
    .from(messageItems)
    .where(
      and(
        eq(messageItems.campaignId, campaignId),
        eq(messageItems.organizationId, organizationId),
      ),
    )
    .limit(limit);
}

export async function campaignSummaryForOrg(campaignId: string, organizationId: string) {
  const rows = await db
    .select({
      total: sql<number>`count(*)::int`,
      accepted: sql<number>`count(*) filter (where ${messageItems.submissionStatus} = 'ACCEPTED')::int`,
      rejected: sql<number>`count(*) filter (where ${messageItems.submissionStatus} = 'REJECTED')::int`,
      unresolved: sql<number>`count(*) filter (where ${messageItems.submissionStatus} in ('UNKNOWN','SUBMITTING'))::int`,
      excluded: sql<number>`count(*) filter (where ${messageItems.submissionStatus} = 'EXCLUDED')::int`,
      cancelled: sql<number>`count(*) filter (where ${messageItems.submissionStatus} = 'CANCELLED')::int`,
      delivered: sql<number>`count(*) filter (where ${messageItems.deliveryStatus} = 'DELIVERED')::int`,
      undelivered: sql<number>`count(*) filter (where ${messageItems.deliveryStatus} = 'UNDELIVERED')::int`,
      charged: sql<number>`coalesce(sum(${messageItems.costCentavos}) filter (where ${messageItems.charged}), 0)::int`,
    })
    .from(messageItems)
    .where(
      and(
        eq(messageItems.campaignId, campaignId),
        eq(messageItems.organizationId, organizationId),
      ),
    );

  return (
    rows[0] ?? {
      total: 0,
      accepted: 0,
      rejected: 0,
      unresolved: 0,
      excluded: 0,
      cancelled: 0,
      delivered: 0,
      undelivered: 0,
      charged: 0,
    }
  );
}
