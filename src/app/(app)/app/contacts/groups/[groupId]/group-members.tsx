"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addToGroupAction,
  removeFromGroupAction,
  type GroupResult,
} from "@/server/actions/groups";
import { Button, Card, DataTable, Notice } from "@/components/ui";
import { useT } from "@/i18n/client";

type Member = {
  contactId: string;
  masked: string;
  firstName: string | null;
  lastName: string | null;
};

type Candidate = { id: string; masked: string; name: string };

/** The group's current members, with removal. */
export function GroupMembers({
  groupId,
  members,
}: {
  groupId: string;
  members: Member[];
}) {
  const t = useT();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<GroupResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function remove() {
    startTransition(async () => {
      const outcome = await removeFromGroupAction({
        groupId,
        contactIds: [...selected],
      });
      setResult(outcome);
      if (outcome.ok) {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  return (
    <div>
      {result ? (
        <div className="px-5 pt-4">
          <Notice tone={result.ok ? "success" : "danger"} title={result.ok ? t.groups.updated : t.groups.notUpdated}>
            {result.message}
          </Notice>
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <span className="text-[13px] font-semibold text-ink">
            {t.groups.selected(selected.size)}
          </span>
          <Button variant="ghost" size="sm" onClick={remove} disabled={pending}>
            {pending ? t.groups.removing : t.groups.removeFromGroup}
          </Button>
          <span className="text-[12.5px] text-muted">
            {t.groups.staysInContacts}
          </span>
        </div>
      ) : null}

      <div className="min-w-0">
        <DataTable>
          <thead>
            <tr>
              <th className="w-10">
                <span className="sr-only">{t.common.select}</span>
              </th>
              <th>{t.contacts.colRecipient}</th>
              <th>{t.contacts.colName}</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.contactId}>
                <td>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-600"
                    checked={selected.has(member.contactId)}
                    onChange={() => toggle(member.contactId)}
                    aria-label={`${t.common.select} ${member.masked}`}
                  />
                </td>
                <td className="font-mono text-[12.5px]">{member.masked}</td>
                <td>{[member.firstName, member.lastName].filter(Boolean).join(" ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}

/** Adds contacts that are not already in this group. */
function AddPanel({
  groupId,
  candidates,
}: {
  groupId: string;
  candidates: Candidate[];
}) {
  const t = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [result, setResult] = useState<GroupResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const visible = filter.trim()
    ? candidates.filter((c) =>
        `${c.masked} ${c.name}`.toLowerCase().includes(filter.trim().toLowerCase()),
      )
    : candidates;

  function add() {
    startTransition(async () => {
      const outcome = await addToGroupAction({ groupId, contactIds: [...selected] });
      setResult(outcome);
      if (outcome.ok) {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  return (
    <Card className="p-5">
      <h2 className="card-title">{t.groups.addContacts}</h2>

      {candidates.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted">
          {t.groups.allAlreadyIn}
        </p>
      ) : (
        <>
          <label className="sr-only" htmlFor="group-filter">
            {t.groups.filterLabel}
          </label>
          <input
            id="group-filter"
            className="field mt-3"
            placeholder={t.groups.filterPlaceholder}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />

          <div className="mt-3 max-h-64 overflow-auto rounded-[10px] border border-line">
            {visible.length === 0 ? (
              <p className="px-3 py-3 text-[12.5px] text-muted">{t.groups.nothingMatches}</p>
            ) : (
              <ul className="divide-y divide-line">
                {visible.map((candidate) => (
                  <li key={candidate.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-navy-50">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-600"
                        checked={selected.has(candidate.id)}
                        onChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(candidate.id)) next.delete(candidate.id);
                            else next.add(candidate.id);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0">
                        <span className="block font-mono text-[12.5px] text-ink">
                          {candidate.masked}
                        </span>
                        {candidate.name ? (
                          <span className="block truncate text-[12.5px] text-muted">
                            {candidate.name}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button className="mt-3" onClick={add} disabled={pending || selected.size === 0}>
            {pending ? t.groups.adding : t.groups.addSelected(selected.size)}
          </Button>
        </>
      )}

      {result ? (
        <div className="mt-3">
          <Notice tone={result.ok ? "success" : "danger"} title={result.ok ? t.groups.added : t.groups.notAdded}>
            {result.message}
          </Notice>
        </div>
      ) : null}
    </Card>
  );
}

GroupMembers.AddPanel = AddPanel;
