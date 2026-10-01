"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearConfigValueAction,
  setConfigValueAction,
  type ConfigActionResult,
} from "@/server/actions/app-config";
import { Button, Card, DataTable, Notice, Pill } from "@/components/ui";
import { useLocale, useT } from "@/i18n/client";
import { keepValuesOnSubmit } from "@/components/form-submit";

type Row = {
  key: string;
  label: string;
  value: number;
  defaultValue: number;
  overridden: boolean;
  updatedAt: string | null;
};

/**
 * Admin-editable limits.
 *
 * Every row shows the built-in default beside the current value, so it is
 * always clear what has been changed from stock and what has not.
 */
export function ConfigEditor({ rows, mode }: { rows: Row[]; mode: string }) {
  const t = useT();
  const { tag } = useLocale();

  const [result, setResult] = useState<ConfigActionResult | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save(formData: FormData) {
    startTransition(async () => {
      const outcome = await setConfigValueAction(formData);
      setResult(outcome);
      if (outcome.ok) {
        setEditing(null);
        router.refresh();
      }
    });
  }

  function reset(key: string) {
    startTransition(async () => {
      const outcome = await clearConfigValueAction(key);
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  return (
    <Card>
      <div className="px-5 pt-5">
        <h2 className="card-title">{t.admin.settings.editableTitle}</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          Changes apply to the next send — nothing needs restarting. Every change is kept in the
          version history and written to the audit log. Overrides are saved against the{" "}
          <strong>{mode}</strong> environment only.
        </p>
      </div>

      {result ? (
        <div className="px-5 pt-4">
          <Notice tone={result.ok ? "success" : "danger"} title={result.ok ? t.contacts.detail.saved : t.contacts.detail.notSaved}>
            {result.message}
          </Notice>
        </div>
      ) : null}

      <div className="mt-4 min-w-0">
        <DataTable>
          <thead>
            <tr>
              <th>{t.admin.settings.colSetting}</th>
              <th>{t.admin.settings.colValue}</th>
              <th>{t.admin.settings.colDefault}</th>
              <th>
                <span className="sr-only">{t.common.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>
                  <span className="block text-[13px] font-semibold text-ink">{row.label}</span>
                  <span className="block font-mono text-[11.5px] text-muted">{row.key}</span>
                </td>
                <td>
                  {editing === row.key ? (
                    <form action={save} onSubmit={keepValuesOnSubmit(save)} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="key" value={row.key} />
                      <label className="sr-only" htmlFor={`value-${row.key}`}>
                        {row.label}
                      </label>
                      <input
                        id={`value-${row.key}`}
                        className="field w-32"
                        name="value"
                        type="number"
                        defaultValue={row.value}
                        min={1}
                        required
                        autoFocus
                      />
                      <Button type="submit" size="sm" disabled={pending}>
                        {pending ? t.common.saving : t.common.save}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(null)}
                        disabled={pending}
                      >
                        {t.common.cancel}
                      </Button>
                    </form>
                  ) : (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] text-ink">
                        {row.value.toLocaleString(tag)}
                      </span>
                      {row.overridden ? <Pill tone="info">{t.admin.settings.changed}</Pill> : null}
                    </span>
                  )}
                </td>
                <td className="font-mono text-[12.5px] text-muted">
                  {row.defaultValue.toLocaleString(tag)}
                </td>
                <td>
                  {editing === row.key ? null : (
                    <span className="flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setResult(null);
                          setEditing(row.key);
                        }}
                        disabled={pending}
                      >
                        {t.common.change}
                      </Button>
                      {row.overridden ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => reset(row.key)}
                          disabled={pending}
                        >
                          {t.admin.settings.restoreDefault}
                        </Button>
                      ) : null}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </Card>
  );
}
