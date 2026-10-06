import Link from "next/link";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { Card, CardHeader } from "./ui";
import { getI18n } from "@/i18n/server";
import { formatDateTime } from "@/i18n/format";

/**
 * In-app notifications.
 *
 * The notification adapter writes here and to the local mail sink. Actual email
 * delivery is a separate integration that is not configured, so nothing here
 * implies a message reached anyone's inbox.
 */
export async function NotificationsPanel({
  organizationId,
  userId,
  limit = 5,
}: {
  organizationId: string;
  userId: string;
  limit?: number;
}) {
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        // Organization-wide notices have no user; personal ones match this user.
        or(isNull(notifications.userId), eq(notifications.userId, userId)),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  if (rows.length === 0) return null;

  const { t, locale } = await getI18n();

  return (
    <Card className="mt-5">
      <CardHeader title={t.components.notifications.title} description={t.components.notifications.description} />
      <ul className="divide-y divide-line">
        {rows.map((notification) => (
          <li key={notification.id} className="px-5 py-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-bold text-ink">{notification.title}</p>
                <p className="mt-0.5 text-[13px] text-body">{notification.body}</p>
              </div>
              <span className="whitespace-nowrap text-[12px] text-muted">
                {formatDateTime(notification.createdAt, locale)}
              </span>
            </div>
            {notification.href ? (
              <Link
                href={notification.href}
                className="mt-1.5 inline-block text-[12.5px] font-semibold text-brand-600 hover:underline"
              >
                {t.components.notifications.view}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
