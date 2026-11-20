import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { inquiries, inquiryStatus, users } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { sendMail } from "@/server/providers/mail";
import { renderEmail } from "./email-templates";
import { dictionaryFor } from "@/i18n/dictionaries";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";

/**
 * The bulk inquiry pipeline: NEW → CONTACTED → REVIEWING → QUOTATION_SENT →
 * CONTRACTED → COMPLETED, or REJECTED.
 *
 * A CRM record and nothing more. Marking an inquiry CONTRACTED does not queue a
 * single SMS — a contracted campaign still goes through the normal reviewed
 * send path. What it does do is tell people: when the status changes, the
 * customer is emailed in the language they wrote in, and so is the assigned
 * operator, unless they made the change themselves.
 */

export type InquiryStatus = (typeof inquiryStatus.enumValues)[number];
export const INQUIRY_STATUSES = inquiryStatus.enumValues;

export type InquiryUpdateOutcome =
  | { ok: true; statusChanged: boolean; customerEmailed: boolean; operatorEmailed: boolean }
  | { ok: false; code: "NOT_FOUND" | "NOT_AN_OPERATOR" };

export async function updateInquiry(input: {
  inquiryId: string;
  status: InquiryStatus;
  note: string | null;
  /** The platform admin the inquiry is assigned to, or null for nobody. */
  ownerUserId: string | null;
  actor: { id: string; fullName: string };
  /** The acting admin's language, for the email to a colleague. */
  actorLocale: Locale;
}): Promise<InquiryUpdateOutcome> {
  // Only a platform admin can own an inquiry: the id arrives from a form.
  let owner: { id: string; email: string } | null = null;
  if (input.ownerUserId) {
    const [row] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.id, input.ownerUserId), eq(users.isPlatformAdmin, true)))
      .limit(1);
    if (!row) return { ok: false, code: "NOT_AN_OPERATOR" };
    owner = row;
  }

  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(inquiries)
      .where(eq(inquiries.id, input.inquiryId))
      .for("update")
      .limit(1);
    if (!before) return { ok: false, code: "NOT_FOUND" } as const;

    await tx
      .update(inquiries)
      .set({
        status: input.status,
        internalNote: input.note,
        ownerUserId: owner?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(inquiries.id, input.inquiryId));

    const statusChanged = before.status !== input.status;
    let customerEmailed = false;
    let operatorEmailed = false;

    if (statusChanged) {
      const locale = isLocale(before.locale) ? before.locale : DEFAULT_LOCALE;
      const t = dictionaryFor(locale);
      await sendMail(
        {
          to: before.contactEmail,
          ...(await renderEmail(
            "inquiryCustomer",
            locale,
            {
              name: before.contactName,
              company: before.company,
              status: t.status.inquiry[input.status],
              statusNote: t.emails.inquiryStatusNotes[input.status],
            },
            tx,
          )),
        },
        tx,
      );
      customerEmailed = true;

      if (owner && owner.id !== input.actor.id) {
        const colleague = dictionaryFor(input.actorLocale);
        await sendMail(
          {
            to: owner.email,
            ...(await renderEmail(
              "inquiryOperator",
              input.actorLocale,
              {
                company: before.company,
                status: colleague.status.inquiry[input.status],
                changedBy: input.actor.fullName,
              },
              tx,
            )),
            link: "/admin/inquiries",
          },
          tx,
        );
        operatorEmailed = true;
      }
    }

    await recordAudit(
      {
        action: "admin.inquiry_updated",
        actorUserId: input.actor.id,
        actorKind: "PLATFORM_ADMIN",
        objectType: "inquiry",
        objectId: input.inquiryId,
        metadata: {
          status: input.status,
          previousStatus: before.status,
          owner: owner?.id ?? null,
          customerEmailed,
          operatorEmailed,
        },
      },
      tx,
    );

    return { ok: true, statusChanged, customerEmailed, operatorEmailed } as const;
  });
}
