"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/server/db";
import { inquiries } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { checkRateLimit } from "@/server/security/rate-limit";

/**
 * Public bulk inquiry.
 *
 * This is the route for high-volume and promotional sending, which is not
 * self-service. The form deliberately does NOT accept a recipient list: there
 * is no reason to collect other people's phone numbers before there is even an
 * agreement in place.
 */

export type InquiryResult =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

const schema = z.object({
  company: z.string().min(2, "Enter your business name.").max(200),
  contactName: z.string().min(2, "Enter a contact name.").max(200),
  contactEmail: z.string().email("Enter a valid email address."),
  contactPhone: z.string().max(40).optional(),
  estimatedVolume: z.coerce
    .number()
    .int()
    .positive("Enter roughly how many messages you expect to send.")
    .max(100_000_000),
  frequency: z.string().min(1, "How often would you send?").max(100),
  purpose: z.enum(["INFORMATIONAL", "PROMOTIONAL"]),
  audience: z.string().min(10, "Describe who receives these messages.").max(1000),
  preferredDate: z.string().max(40).optional(),
  sampleMessage: z.string().min(10, "Paste an example message.").max(1000),
  senderNeeds: z.string().max(200).optional(),
  consentSource: z.string().min(3, "Tell us how these people agreed to hear from you.").max(500),
  // Honeypot: a real person leaves this empty.
  website: z.string().max(0).optional(),
});

export async function submitInquiryAction(formData: FormData): Promise<InquiryResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }

  // Silently accept a honeypot submission so a bot learns nothing.
  if (parsed.data.website) {
    return { ok: true, message: "Thank you. We will be in touch." };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  // Per sender, not global: one busy afternoon must not close the form to
  // everybody else. When the client cannot be identified the limit is skipped
  // rather than applied to a shared bucket, because a shared bucket would let
  // five submissions close the form for every visitor. The honeypot and the
  // validation still apply.
  if (ip) {
    const limit = await checkRateLimit("inquiry", ip);
    if (!limit.allowed) return { ok: false, message: limit.message };
  }

  await db.transaction(async (tx) => {
    await tx.insert(inquiries).values({
      company: parsed.data.company,
      contactName: parsed.data.contactName,
      contactEmail: parsed.data.contactEmail.toLowerCase(),
      contactPhone: parsed.data.contactPhone || null,
      estimatedVolume: parsed.data.estimatedVolume,
      frequency: parsed.data.frequency,
      purpose: parsed.data.purpose,
      audience: parsed.data.audience,
      preferredDate: parsed.data.preferredDate || null,
      sampleMessage: parsed.data.sampleMessage,
      senderNeeds: parsed.data.senderNeeds || null,
      consentSource: parsed.data.consentSource,
      status: "NEW",
    });

    await recordAudit(
      {
        action: "inquiry.submitted",
        actorKind: "SYSTEM",
        objectType: "inquiry",
        metadata: {
          company: parsed.data.company,
          volume: parsed.data.estimatedVolume,
          purpose: parsed.data.purpose,
          ip: ip ?? "unknown",
        },
      },
      tx,
    );
  });

  // No outbound email is sent in demo mode; an operator picks this up in the
  // admin console.
  return {
    ok: true,
    message:
      "Thank you. Your request has been logged and someone will contact you about volumes, pricing and sender approval.",
  };
}
