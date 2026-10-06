"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { IconCheckCircle, IconFile } from "./icons";
import { cx } from "./ui";
import { useLocale, useT } from "@/i18n/client";

/**
 * File picker drawn as a drop zone.
 *
 * The real `<input type="file">` is stretched invisibly over the whole box
 * rather than hidden. That keeps everything the browser already does for one: a
 * click anywhere opens the picker, a file dropped on the box is taken,
 * `required` is enforced and the form submits the file. Hiding it (`sr-only`)
 * loses the drop, so "Drop your CSV here" opened the file in the browser
 * instead; showing it leaves the browser's own "Choose File — No file chosen"
 * sitting beside the styled box, in the browser's language rather than ours.
 *
 * `row` is a compact strip for a form; `stack` is a tall centred target.
 */
export function FileDrop({
  id,
  name,
  accept,
  required,
  title,
  hint,
  layout = "row",
  keepSelection = true,
  onFile,
}: {
  id: string;
  name?: string;
  accept?: string;
  required?: boolean;
  /** The visible label, and the input's accessible name. */
  title: string;
  hint?: string;
  layout?: "row" | "stack";
  /**
   * Whether the box holds on to the chosen file and shows it, as a form field
   * does. Pass false when the caller reads the file straight away and shows the
   * result itself.
   */
  keepSelection?: boolean;
  onFile?: (file: File | undefined) => void;
}) {
  const t = useT();
  const { tag } = useLocale();
  const input = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<{ name: string; size: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // A form reset empties the input without firing `change`.
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const clear = () => setChosen(null);
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);

  function changed(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    onFile?.(file);
    if (keepSelection) {
      setChosen(file ? { name: file.name, size: file.size } : null);
    } else {
      // Otherwise picking the same file twice in a row fires nothing.
      event.target.value = "";
    }
  }

  const describedBy = chosen || hint ? `${id}-detail` : undefined;
  const action = chosen ? t.components.fileDrop.change : t.components.fileDrop.browse;

  return (
    <div
      onDragEnter={() => setDragging(true)}
      onDragOver={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      onDrop={() => setDragging(false)}
      className={cx(
        "relative rounded-[10px] border border-dashed transition-colors",
        // The focus ring belongs to the box: the input that has focus is invisible.
        "has-focus-visible:border-brand-500 has-focus-visible:shadow-[0_0_0_3px_var(--color-brand-100)]",
        dragging
          ? "border-brand-500 bg-brand-50"
          : "border-brand-200 bg-brand-50/40 hover:border-brand-300 hover:bg-brand-50",
        layout === "row" ? "flex flex-wrap items-center gap-3 px-4 py-4" : "px-4 py-10 text-center",
      )}
    >
      {layout === "row" ? (
        <>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-muted">
            {chosen ? <IconCheckCircle size={20} className="text-success-fg" /> : <IconFile size={20} />}
          </span>
          {/* Narrow enough to stay beside the icon on a phone; the button wraps. */}
          <span className="min-w-0 flex-1 basis-40">
            <label htmlFor={id} className="block text-[13.5px] font-semibold text-ink">
              {title}
            </label>
            <Detail id={describedBy} chosen={chosen} hint={hint} tag={tag} />
          </span>
          <span
            aria-hidden="true"
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] font-semibold text-ink"
          >
            {action}
          </span>
        </>
      ) : (
        <>
          <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center text-muted">
            {chosen ? <IconCheckCircle size={26} className="text-success-fg" /> : <IconFile size={26} />}
          </span>
          <label htmlFor={id} className="block text-[13.5px] text-body">
            {title}
          </label>
          <Detail id={describedBy} chosen={chosen} hint={hint} tag={tag} />
          <span aria-hidden="true" className="mt-1 block text-[13px] text-muted">
            {t.components.fileDrop.or}
          </span>
          <span
            aria-hidden="true"
            className="mt-2 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white"
          >
            {action}
          </span>
        </>
      )}

      <input
        ref={input}
        id={id}
        name={name}
        type="file"
        accept={accept}
        required={required}
        aria-describedby={describedBy}
        // An empty title stops the browser's own "No file chosen" tooltip.
        title=""
        onChange={changed}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

function Detail({
  id,
  chosen,
  hint,
  tag,
}: {
  id: string | undefined;
  chosen: { name: string; size: number } | null;
  hint: string | undefined;
  tag: string;
}) {
  if (chosen) {
    return (
      <span id={id} className="block truncate text-[12.5px] text-body">
        <span className="font-semibold text-ink">{chosen.name}</span> · {formatSize(chosen.size, tag)}
      </span>
    );
  }
  return hint ? (
    <span id={id} className="block text-[12.5px] text-muted">
      {hint}
    </span>
  ) : null;
}

/** Binary units, to match the "4 MiB" the upload limit is stated in. */
function formatSize(bytes: number, tag: string): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toLocaleString(tag, { maximumFractionDigits: kib < 10 ? 1 : 0 })} KiB`;
  return `${(kib / 1024).toLocaleString(tag, { maximumFractionDigits: 1 })} MiB`;
}
