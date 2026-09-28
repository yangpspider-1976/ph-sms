"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/server/auth/context";
import { commitImport, createImport, deleteContacts, type ImportPreview } from "@/server/domain/contacts";
import { addSuppression } from "@/server/domain/suppression";
import { normalizePhone, splitPastedNumbers } from "@/server/domain/phone";
import { db } from "@/server/db";
import { getEffectiveConfig } from "@/server/domain/app-config";
import { checkRateLimit } from "@/server/security/rate-limit";

export type ImportActionResult =
  | { ok: true; preview: ImportPreview }
  | { ok: false; message: string; code: string; detail?: string[] };

/** Uploads and previews a CSV. Nothing is added to the contact list yet. */
export async function uploadContactsAction(formData: FormData): Promise<ImportActionResult> {
  const auth = await authorize("contacts.manage");
  if (!auth.ok) return { ok: false, message: auth.error.message, code: auth.error.code };

  const limit = await checkRateLimit("upload", auth.ctx.org.organizationId);
  if (!limit.allowed) return { ok: false, message: limit.message, code: "RATE_LIMITED" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a CSV file to upload.", code: "NO_FILE" };
  }

  const config = await getEffectiveConfig();
  if (file.size > config.maxUploadBytes) {
    return {
      ok: false,
      message: `That file is larger than the ${Math.round(config.maxUploadBytes / 1024 / 1024)} MiB limit.`,
      code: "TOO_LARGE",
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const outcome = await createImport({
    organizationId: auth.ctx.org.organizationId,
    userId: auth.ctx.user.id,
    filename: file.name,
    bytes,
    acknowledgedUnknownColumns: formData.get("acknowledgeUnknown") === "on",
  });

  if (!outcome.ok) {
    return { ok: false, message: outcome.message, code: outcome.code, detail: outcome.detail };
  }

  revalidatePath("/app/contacts");
  return { ok: true, preview: outcome.preview };
}

export type CommitResult =
  | { ok: true; added: number; updated: number; skippedSuppressed: number }
  | { ok: false; message: string };

/** Commits a reviewed import. */
export async function commitImportAction(importId: string): Promise<CommitResult> {
  const auth = await authorize("contacts.manage");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const parsed = z.string().uuid().safeParse(importId);
  if (!parsed.success) return { ok: false, message: "That import is not valid." };

  const result = await commitImport({
    importId: parsed.data,
    organizationId: auth.ctx.org.organizationId,
    userId: auth.ctx.user.id,
  });

  revalidatePath("/app/contacts");
  return { ok: true, ...result };
}

export async function deleteContactsAction(contactIds: string[]): Promise<{ deleted: number }> {
  const auth = await authorize("contacts.manage");
  if (!auth.ok) return { deleted: 0 };

  const deleted = await deleteContacts({
    organizationId: auth.ctx.org.organizationId,
    contactIds,
    userId: auth.ctx.user.id,
  });

  revalidatePath("/app/contacts");
  return { deleted };
}

export type OptOutResult = { ok: boolean; message: string; added?: number };

/**
 * Records opt-out requests received by the business through its own channels.
 *
 * This is the MVP intake: an operator enters numbers a recipient asked to be
 * removed. It only ever writes to this organization's list — a business cannot
 * create a platform-wide block.
 */
export async function addOptOutsAction(formData: FormData): Promise<OptOutResult> {
  const auth = await authorize("suppression.manage");
  if (!auth.ok) return { ok: false, message: auth.error.message };

  const raw = String(formData.get("numbers") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "Requested to stop";
  const entries = splitPastedNumbers(raw);

  if (entries.length === 0) {
    return { ok: false, message: "Enter at least one mobile number." };
  }

  let added = 0;
  let invalid = 0;

  await db.transaction(async (tx) => {
    for (const entry of entries) {
      const result = normalizePhone(entry);
      if (!result.ok) {
        invalid += 1;
        continue;
      }
      const created = await addSuppression(tx, {
        normalized: result.normalized,
        scope: "ORGANIZATION",
        organizationId: auth.ctx.org.organizationId,
        reason,
        source: "OPERATOR_INTAKE",
        createdBy: auth.ctx.user.id,
      });
      if (created.created) added += 1;
    }
  });

  revalidatePath("/app/contacts/opt-outs");

  return {
    ok: true,
    added,
    message:
      invalid > 0
        ? `${added} added. ${invalid} entr${invalid === 1 ? "y was" : "ies were"} not a valid Philippine mobile number.`
        : `${added} number${added === 1 ? "" : "s"} added to your opt-out list.`,
  };
}
