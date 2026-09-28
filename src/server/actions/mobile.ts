"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/context";
import {
  confirmMobileVerification,
  MobileVerificationError,
  removeVerifiedMobile,
  startMobileVerification,
} from "@/server/domain/mobile-verification";
import { checkRateLimit } from "@/server/security/rate-limit";
import { getSmsProvider } from "@/server/providers/sms";
import { env } from "@/server/env";

/** Mobile verification (AUTH-02). Optional for every account. */

export type MobileResult =
  | { ok: true; message: string; mask?: string; demoCode?: string }
  | { ok: false; message: string };

const startSchema = z.object({ number: z.string().min(5).max(40) });

export async function startMobileVerificationAction(
  formData: FormData,
): Promise<MobileResult> {
  const user = await requireUser();

  // Each code is an outbound SMS that costs money, so the request is limited
  // whether or not the number turns out to be valid.
  const limit = await checkRateLimit("test-send", `verify:${user.id}`);
  if (!limit.allowed) return { ok: false, message: limit.message };

  const parsed = startSchema.safeParse({ number: String(formData.get("number") ?? "") });
  if (!parsed.success) return { ok: false, message: "Enter your mobile number." };

  try {
    const result = await startMobileVerification({
      userId: user.id,
      rawNumber: parsed.data.number,
      provider: getSmsProvider(),
      // In demo mode no real handset receives anything, so the code is shown
      // on screen. Never in LIVE.
      exposeDemoCode: env.APP_MODE === "MOCK",
    });

    revalidatePath("/app/settings/profile");
    return {
      ok: true,
      mask: result.mask,
      demoCode: result.demoCode,
      message: `We sent a 6-digit code to ${result.mask}. It expires in 10 minutes.`,
    };
  } catch (err) {
    if (err instanceof MobileVerificationError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function confirmMobileVerificationAction(
  formData: FormData,
): Promise<MobileResult> {
  const user = await requireUser();

  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) return { ok: false, message: "Enter the 6-digit code." };

  try {
    const { mask } = await confirmMobileVerification({ userId: user.id, code });
    revalidatePath("/app/settings/profile");
    revalidatePath("/app/send");
    return { ok: true, mask, message: `${mask} is verified. You can now send test messages.` };
  } catch (err) {
    if (err instanceof MobileVerificationError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function removeVerifiedMobileAction(): Promise<MobileResult> {
  const user = await requireUser();
  await removeVerifiedMobile(user.id);
  revalidatePath("/app/settings/profile");
  revalidatePath("/app/send");
  return { ok: true, message: "Your mobile number has been removed." };
}
