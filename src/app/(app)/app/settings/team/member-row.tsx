"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  changeRoleAction,
  removeMemberAction,
  type TeamResult,
} from "@/server/actions/team";
import { Button, Notice, Pill, Select } from "@/components/ui";
import { ROLE_ORDER, ROLE_TONES } from "@/server/auth/rbac";
import type { OrgRole } from "@/server/db/schema";
import { useT } from "@/i18n/client";

const ROLE_TONE = ROLE_TONES;

export function MemberRow({
  membershipId,
  email,
  fullName,
  role,
  verified,
  joinedAt,
  isSelf,
  isLastOwner,
  canManage,
}: {
  membershipId: string;
  email: string;
  fullName: string;
  role: OrgRole;
  verified: boolean;
  joinedAt: string;
  isSelf: boolean;
  isLastOwner: boolean;
  canManage: boolean;
}) {
  const t = useT();

  const [result, setResult] = useState<TeamResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function updateRole(formData: FormData) {
    startTransition(async () => {
      const outcome = await changeRoleAction(formData);
      setResult(outcome);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const outcome = await removeMemberAction(membershipId);
      setResult(outcome);
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-ink">
            {fullName}
            {isSelf ? <span className="ml-2 text-[12px] font-normal text-muted">(you)</span> : null}
          </p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {email} · joined {joinedAt}
            {verified ? "" : " · email not verified"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManage && !isLastOwner ? (
            <form action={updateRole} className="flex items-center gap-2">
              <input type="hidden" name="membershipId" value={membershipId} />
              <Select
                name="role"
                defaultValue={role}
                className="py-1.5 text-[13px]"
                aria-label={`Role for ${fullName}`}
              >
                {ROLE_ORDER.map((role) => (
                  <option key={role} value={role}>
                    {t.roles.labels[role]}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="ghost" size="sm" disabled={pending}>
                {t.common.save}
              </Button>
            </form>
          ) : (
            <Pill tone={ROLE_TONE[role] ?? "neutral"} dot={false}>
              {t.roles.labels[role]}
            </Pill>
          )}

          {canManage && !isLastOwner ? (
            confirming ? (
              <span className="flex items-center gap-2">
                <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
                  {pending ? t.settings.team.removing : t.common.confirm}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                  {t.common.cancel}
                </Button>
              </span>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
                {t.common.remove}
              </Button>
            )
          ) : null}
        </div>
      </div>

      {isLastOwner ? (
        <p className="mt-2 text-[12px] text-muted">
          {t.settings.team.lastOwnerNote}
        </p>
      ) : null}

      {result && !result.ok ? (
        <div className="mt-3">
          <Notice tone="danger" title={t.settings.team.notChanged}>
            {result.message}
          </Notice>
        </div>
      ) : null}
    </div>
  );
}
