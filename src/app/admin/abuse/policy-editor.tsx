"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setContentPolicyAction,
  type ConfigActionResult,
} from "@/server/actions/app-config";
import type { StoredContentPolicy } from "@/server/domain/content-checks";
import { Button, Card, DataTable, Notice, Pill } from "@/components/ui";
import { useLocale, useT } from "@/i18n/client";

/**
 * The content policy.
 *
 * Shown as a readable table, edited as JSON. A per-field form for a list of
 * regular expressions would be a lot of chrome around a text box — the people
 * who edit blocked patterns are writing patterns either way, and the JSON is
 * validated on the server before anything is saved.
 */
export function PolicyEditor({ policy }: { policy: StoredContentPolicy }) {
  const t = useT();
  const { tag } = useLocale();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => JSON.stringify(policy, null, 2));
  const [result, setResult] = useState<ConfigActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      const outcome = await setContentPolicyAction(draft);
      setResult(outcome);
      if (outcome.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  const blocking = policy.rules.filter((r) => r.severity === "BLOCK").length;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="card-title">{t.admin.abuse.rulesTitle}</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            {t.admin.abuse.rulesSummary(
              policy.rules.length,
              blocking,
              policy.reviewRecipientThreshold.toLocaleString(tag),
            )}
          </p>
        </div>
        {editing ? null : (
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(JSON.stringify(policy, null, 2));
              setResult(null);
              setEditing(true);
            }}
          >
            {t.admin.abuse.editPolicy}
          </Button>
        )}
      </div>

      {result ? (
        <div className="px-5 pt-4">
          <Notice tone={result.ok ? "success" : "danger"} title={result.ok ? t.contacts.detail.saved : t.contacts.detail.notSaved}>
            {result.message}
          </Notice>
        </div>
      ) : null}

      {editing ? (
        <div className="px-5 py-4">
          <label className="field-label" htmlFor="policy-json">
            {t.admin.abuse.policyJson}
          </label>
          <textarea
            id="policy-json"
            className="field mt-1 min-h-80 font-mono text-[12px]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
          />
          <p className="mt-2 text-[12.5px] text-muted">
            {t.admin.abuse.redosNote}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={save} disabled={pending}>
              {pending ? t.common.saving : t.admin.abuse.savePolicy}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
              {t.common.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 min-w-0">
          <DataTable>
            <thead>
              <tr>
                <th>{t.admin.abuse.colRule}</th>
                <th>{t.admin.abuse.colOutcome}</th>
                <th>{t.admin.abuse.colPattern}</th>
              </tr>
            </thead>
            <tbody>
              {policy.rules.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <span className="block text-[13px] font-semibold text-ink">
                      {rule.description}
                    </span>
                    <span className="block font-mono text-[11.5px] text-muted">{rule.id}</span>
                  </td>
                  <td>
                    <Pill tone={rule.severity === "BLOCK" ? "danger" : "warning"}>
                      {rule.severity === "BLOCK" ? t.admin.abuse.outcomeRefuse : t.admin.abuse.outcomeHold}
                    </Pill>
                  </td>
                  <td className="max-w-sm break-all font-mono text-[11.5px] text-muted">
                    /{rule.pattern}/{rule.flags}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>

          <div className="grid gap-4 border-t border-line px-5 py-4 sm:grid-cols-2">
            <div>
              <p className="text-[12.5px] font-semibold text-ink">{t.admin.abuse.linksTitle}</p>
              <ul className="mt-1.5 space-y-1 text-[12.5px] text-muted">
                <li>
                  {policy.url.reviewShorteners
                    ? t.admin.abuse.shortenersHeld
                    : t.admin.abuse.shortenersAllowed}
                </li>
                <li>
                  {policy.url.reviewUnknownDomains
                    ? t.admin.abuse.unknownHeld
                    : t.admin.abuse.unknownAllowed}
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[12.5px] font-semibold text-ink">{t.admin.abuse.domainsTitle}</p>
              <p className="mt-1.5 text-[12.5px] text-muted">
                {t.admin.abuse.domainCounts(
                  policy.url.allowedDomains.length,
                  policy.url.blockedDomains.length,
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
