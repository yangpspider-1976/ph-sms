"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { sendTestAction } from "@/server/actions/test-send";
import type { TestRecipient } from "@/server/domain/test-send";
import { Button, Notice, Select } from "@/components/ui";
import { IconSend } from "@/components/icons";
import { useT } from "@/i18n/client";

/**
 * Test send (MSG-04).
 *
 * Sits in the message step, where a sender is deciding whether the wording is
 * right — that is the moment the feature is for. It says plainly that a test
 * costs money, because it does.
 */
export function TestSendPanel({
  recipients,
  senderIdentityId,
  body,
  disabledReason,
  unitPriceCentavos,
  segments,
}: {
  recipients: TestRecipient[];
  senderIdentityId: string;
  body: string;
  disabledReason: string | null;
  unitPriceCentavos: number;
  segments: number;
}) {
  const t = useT();

  const [to, setTo] = useState(recipients[0]?.userId ?? "");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    startTransition(async () => {
      const outcome = await sendTestAction({
        senderIdentityId,
        body,
        recipientUserId: to || undefined,
        // Bound to this exact message, so a second click on the same wording
        // does not send twice — but changing a word sends a genuinely new test.
        idempotencyKey: `test-${senderIdentityId}-${to}-${hash(body)}`,
      });
      setResult(outcome);
    });
  }

  const cost = unitPriceCentavos * Math.max(segments, 1);

  if (recipients.length === 0) {
    return (
      <div className="rounded-[10px] border border-line bg-navy-50 px-4 py-3.5">
        <p className="text-[13px] font-semibold text-ink">{t.send.testSendTitle}</p>
        <p className="mt-1 text-[12.5px] leading-snug text-muted">
          <Link href="/app/settings/profile" className="font-semibold text-brand-600 hover:underline">
            {t.send.testVerifyLink}
          </Link>{" "}
          {t.send.testVerifyAfter}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-line bg-navy-50 px-4 py-3.5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label className="field-label" htmlFor="test-recipient">
            {t.send.testSendTo}
          </label>
          <Select
            id="test-recipient"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={pending}
          >
            {recipients.map((r) => (
              <option key={r.userId} value={r.userId}>
                {r.isSelf ? t.send.testSelf(r.mask) : t.send.testOther(r.mask, r.fullName)}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="ghost" onClick={send} disabled={pending || Boolean(disabledReason)}>
          <IconSend size={15} />
          {pending ? t.send.testSending : t.send.testSendButton}
        </Button>
      </div>

      <p className="mt-2 text-[12.5px] leading-snug text-muted">
        {disabledReason ?? t.send.testCostNote(`₱${(cost / 100).toFixed(2)}`)}
      </p>

      {result ? (
        <div className="mt-3">
          <Notice
            tone={result.ok ? "success" : "danger"}
            title={result.ok ? t.send.testSent : t.send.testNotSent}
          >
            {result.message}
          </Notice>
        </div>
      ) : null}
    </div>
  );
}

/** Small stable digest so the same wording reuses the same idempotency key. */
function hash(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
