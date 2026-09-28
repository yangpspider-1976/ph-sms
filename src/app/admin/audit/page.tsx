import { desc, eq, ilike, and, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { auditEvents, organizations, users } from "@/server/db/schema";
import { requirePlatformAdmin } from "@/server/auth/context";
import { formatManila } from "@/server/config";
import {
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  Input,
  Notice,
  PageHeader,
  Pill,
} from "@/components/ui";
import { IconList } from "@/components/icons";
import { getDictionary } from "@/i18n/server";

export const metadata = { title: "Audit logs" };
export const dynamic = "force-dynamic";

/** Actions that change money, access or policy get extra visual weight. */
const SENSITIVE = /^(admin\.|payment\.|export\.|campaign\.stop|auth\.)/;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const t = await getDictionary();

  await requirePlatformAdmin();
  const { action } = await searchParams;

  const filters: SQL[] = [];
  if (action?.trim()) filters.push(ilike(auditEvents.action, `%${action.trim()}%`));

  const rows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      actorKind: auditEvents.actorKind,
      objectType: auditEvents.objectType,
      objectId: auditEvents.objectId,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
      ip: auditEvents.ip,
      actorEmail: users.email,
      organizationName: organizations.name,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .leftJoin(organizations, eq(organizations.id, auditEvents.organizationId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(auditEvents.createdAt))
    .limit(200);

  return (
    <>
      <PageHeader title={t.admin.audit.title} description={t.admin.audit.subheading} />

      <div className="mb-5 max-w-3xl">
        <Notice tone="info" title={t.admin.audit.scopeTitle}>
          Approvals, role changes, sends, stops, wallet movements, exports, suppression changes
          and policy changes are all recorded. Full phone numbers and message bodies are not:
          the log points at records rather than duplicating their contents.
        </Notice>
      </div>

      <Card className="mb-5 p-4">
        <form className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="field-label" htmlFor="action">
              Filter by action
            </label>
            <Input
              id="action"
              name="action"
              defaultValue={action ?? ""}
              placeholder={t.admin.audit.filterPlaceholder}
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title={`${rows.length} events`} description={t.admin.audit.mostRecentFirst} />
        {rows.length === 0 ? (
          <EmptyState
            title={t.admin.audit.emptyTitle}
            description={t.admin.audit.emptyBody}
            icon={<IconList size={20} />}
          />
        ) : (
                      <DataTable>
              <thead>
                <tr>
                  <th>{t.admin.audit.colAction}</th>
                  <th>{t.admin.audit.colActor}</th>
                  <th>{t.admin.colOrganization}</th>
                  <th>{t.admin.audit.colObject}</th>
                  <th>{t.admin.audit.colDetail}</th>
                  <th>{t.admin.colWhen}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Pill tone={SENSITIVE.test(row.action) ? "warning" : "neutral"}>
                        {row.action}
                      </Pill>
                    </td>
                    <td className="text-muted">
                      {row.actorEmail ?? row.actorKind.toLowerCase()}
                    </td>
                    <td className="text-muted">{row.organizationName ?? "—"}</td>
                    <td className="text-muted">{row.objectType ?? "—"}</td>
                    <td className="max-w-[280px] truncate text-muted" title={summarize(row.metadata)}>
                      {summarize(row.metadata)}
                    </td>
                    <td className="whitespace-nowrap text-muted">{formatManila(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
        )}
      </Card>
    </>
  );
}

function summarize(metadata: Record<string, unknown> | null): string {
  if (!metadata) return "—";
  return Object.entries(metadata)
    .map(([key, value]) => `${key}=${typeof value === "object" ? "…" : String(value)}`)
    .join(" · ");
}
