"use server";

import { z } from "zod";
import { authorize, referenceId } from "@/server/auth/context";
import { recordAudit } from "@/server/audit";
import { checkRateLimit } from "@/server/security/rate-limit";
import { sendMail } from "@/server/providers/mail";
import { enServerText } from "@/i18n/locales/en-server-text";
import { getI18n } from "@/i18n/server";
import { renderEmail } from "@/server/domain/email-templates";

export type SupportResult =
  | { ok: true; reference: string; message: string }
  | { ok: false; message: string };

const schema = z.object({
  subject: z.string().min(3, enServerText.sayBriefly).max(200),
  category: z.enum(["DELIVERY", "BILLING", "ACCOUNT", "SENDER_ID", "OTHER"]),
  // A campaign or reference the customer is asking about. Optional.
  relatedRef: z.string().max(100).optional(),
  detail: z.string().min(20, enServerText.tellUsWhatHappened).max(4000),
});

/**
 * Raises a support request.
 *
 * The reference returned to the customer is the same one written to the audit
 * log, so when they quote it, support can find the request and everything
 * around it rather than asking them to describe it again.
 */
export async function submitSupportRequestAction(
  formData: FormData,
): Promise<SupportResult> {
  const auth = await authorize("reports.view");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const limit = await checkRateLimit("inquiry", `support:${auth.ctx.org.organizationId}`);
  if (!limit.allowed) return { ok: false, message: limit.message };

  const parsed = schema.safeParse({
    subject: String(formData.get("subject") ?? ""),
    category: String(formData.get("category") ?? "OTHER"),
    relatedRef: String(formData.get("relatedRef") ?? "") || undefined,
    detail: String(formData.get("detail") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? enServerText.checkTheForm };
  }

  const reference = referenceId();

  await recordAudit({
    action: "support.request_raised",
    organizationId: auth.ctx.org.organizationId,
    actorUserId: auth.ctx.user.id,
    objectType: "support_request",
    objectId: reference,
    metadata: {
      subject: parsed.data.subject,
      category: parsed.data.category,
      relatedRef: parsed.data.relatedRef ?? null,
      // The body is deliberately not copied into the audit log: it is the
      // customer's own words and may contain details they would not expect to
      // be kept in an operational record. It goes to support by mail.
    },
  });

  // The copy goes to the person asking, in the language they asked in. The
  // category shows by the label they chose it under.
  const { t, locale } = await getI18n();
  const categories = {
    DELIVERY: t.supportPage.categoryDelivery,
    BILLING: t.supportPage.categoryBilling,
    ACCOUNT: t.supportPage.categoryAccount,
    SENDER_ID: t.supportPage.categorySenderId,
    OTHER: t.supportPage.categoryOther,
  } satisfies Record<typeof parsed.data.category, string>;

  await sendMail({
    to: auth.ctx.user.email,
    ...(await renderEmail("supportReceived", locale, {
      reference,
      subject: parsed.data.subject,
      category: categories[parsed.data.category],
      about: parsed.data.relatedRef ? t.emails.supportAbout(parsed.data.relatedRef) : "",
      details: parsed.data.detail,
    })),
  });

  return {
    ok: true,
    reference,
    message: enServerText.supportReference(reference, auth.ctx.user.email),
  };
}
