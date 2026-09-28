"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { revokeInviteAction } from "@/server/actions/team";
import { Button, Pill } from "@/components/ui";
import { useT } from "@/i18n/client";

export function InviteRow({
  inviteId,
  email,
  role,
  expiresAt,
  expired,
}: {
  inviteId: string;
  email: string;
  role: string;
  expiresAt: string;
  expired: boolean;
}) {
  const t = useT();

  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function revoke() {
    startTransition(async () => {
      await revokeInviteAction(inviteId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-ink">{email}</p>
        <p className="mt-0.5 text-[12.5px] text-muted">
          Invited as {role.toLowerCase()} · {expired ? "expired" : "expires"} {expiresAt}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {expired ? (
          <Pill tone="neutral">{t.settings.team.expired}</Pill>
        ) : (
          <Pill tone="warning">{t.settings.team.pending}</Pill>
        )}
        <Button variant="ghost" size="sm" onClick={revoke} disabled={pending}>
          {pending ? "Revoking…" : "Revoke"}
        </Button>
      </div>
    </div>
  );
}
