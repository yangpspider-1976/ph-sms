import { cloneElement, isValidElement, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { IconChevronRight, IconInfo } from "./icons";
import { ScrollRegion } from "./scroll-region";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dark";
type ButtonSize = "sm" | "md" | "lg";

/* Square, as everything people operate is (DESIGN.md). Disabled is a grey fill
   with a muted label, not a faded copy of the live button. */
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:border-line! disabled:bg-subtle! disabled:text-muted!";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  // Outline: expands or offers a second path beside a primary.
  secondary: "bg-white text-brand-700 border border-brand-600 hover:bg-brand-50",
  // Quiet: back, list, export.
  ghost: "bg-subtle text-ink border border-line-strong hover:bg-navy-50",
  danger: "bg-white text-danger-fg border border-danger-fg hover:bg-danger-bg",
  // Slate navy: a second action that still needs weight.
  dark: "bg-navy-800 text-white hover:bg-navy-900",
};

// Minimum heights, so a button with a second line of text grows instead of clipping it.
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-4 text-[13px]",
  md: "min-h-11 px-5 text-[14px]",
  lg: "min-h-13.5 px-10 text-[17px]",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <Link
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("card", className)} {...props} />;
}

/**
 * Data table with its own horizontal scroll container.
 *
 * The container is part of the component rather than something each page
 * remembers to add: a bare wide table pushes the whole document sideways on a
 * phone, and that was missed on six pages before the responsive tests caught it.
 *
 * `relative` matters too: a visually hidden header (`sr-only` is absolutely
 * positioned) otherwise takes its position from an ancestor outside the scroll
 * container, escapes it, and widens the page — /admin/settings by 64px.
 *
 * Cells stay on one line and the table scrolls when it is too wide. The two
 * kinds of cell with no natural limit opt out by class (see globals.css):
 * `cell-title` for a name someone typed, `cell-text` for a reason or a
 * description. `wrap` is for a summary table in a narrow card, which should fit
 * rather than scroll.
 */
export function DataTable({
  className,
  children,
  wrap = false,
  ...props
}: ComponentProps<"table"> & { wrap?: boolean }) {
  return (
    <ScrollRegion className="relative min-w-0 overflow-x-auto">
      <table className={cx("data-table", wrap && "data-table-wrap", className)} {...props}>
        {children}
      </table>
    </ScrollRegion>
  );
}

/**
 * A form in a card. The card spans the page like the cards around it; from
 * laptop width the heading and guidance sit on the left and the fields on the
 * right, at a width a form is comfortable at. Capping the card itself to that
 * width left it ending two-thirds of the way across, short of its neighbours.
 */
export function FormCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <h2 className="card-title">{title}</h2>
          {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
        </div>
        <div className="max-w-2xl">{children}</div>
      </div>
    </Card>
  );
}

export function CardHeader({
  title,
  action,
  description,
}: {
  title: ReactNode;
  action?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div>
        <h2 className="card-title">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Tile row used across the dashboards: icon chip, label, sublabel, chevron. */
export function NavTile({
  href,
  icon,
  title,
  subtitle,
  tint = "brand",
}: {
  href: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  tint?: "brand" | "teal" | "violet" | "navy";
}) {
  const tints = {
    brand: "bg-brand-50 text-brand-700",
    teal: "bg-teal-100 text-teal-700",
    violet: "bg-violet-bg text-violet-fg",
    navy: "bg-navy-100 text-navy-700",
  } as const;

  return (
    <Link
      href={href}
      className="card flex items-center gap-4 px-5 py-4 transition-colors hover:bg-subtle"
    >
      <span
        className={cx(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          tints[tint],
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-ink">{title}</span>
        <span className="block truncate text-[13px] text-muted">{subtitle}</span>
      </span>
      <IconChevronRight size={16} className="shrink-0 text-muted" />
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

export type Tone =
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "violet"
  | "neutral"
  | "brand";

const TONES: Record<Tone, string> = {
  info: "bg-info-bg text-info-fg",
  success: "bg-success-bg text-success-fg",
  warning: "bg-warning-bg text-warning-fg",
  danger: "bg-danger-bg text-danger-fg",
  violet: "bg-violet-bg text-violet-fg",
  neutral: "bg-neutral-bg text-neutral-fg",
  brand: "bg-brand-50 text-brand-700",
};

/** Square status label. The word always carries the meaning, not the colour. */
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        // A status is one token: wrapped, "Credit / added" reads as two.
        "inline-flex items-center gap-1.5 whitespace-nowrap px-2 py-0.5 text-[12px] font-medium",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Messaging                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Every error surface carries an action and a support reference, so a user can
 * say what happened without guessing.
 */
export function Notice({
  tone = "info",
  title,
  children,
  supportRef,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  supportRef?: string;
}) {
  // A square box on the tone's tint: the title takes the tone colour, the
  // message stays in body grey, which reads at 6:1 or better on every tint.
  return (
    <div className={cx("p-5", TONES[tone].split(" ")[0])}>
      <div className="flex gap-3">
        <IconInfo size={18} className={cx("mt-px shrink-0", TONES[tone].split(" ")[1])} />
        <div className="min-w-0">
          <p className={cx("text-[15px] font-bold", TONES[tone].split(" ")[1])}>{title}</p>
          {children ? <div className="mt-1 text-[13.5px] text-body">{children}</div> : null}
          {supportRef ? (
            <p className="mt-2 text-[12px] text-body">Support reference: {supportRef}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Empty state. Says what to do next rather than only that there is nothing. */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {icon ? (
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-muted">
          {icon}
        </span>
      ) : null}
      <p className="text-[16px] font-bold text-ink">{title}</p>
      <p className="mt-1.5 max-w-sm text-[14px] text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Forms                                                                      */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  required,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
}) {
  // An error is tied to its control, so a screen reader reads it on focus and
  // the control can be styled and found as invalid — not just red text nearby.
  const errorId = error && htmlFor ? `${htmlFor}-error` : undefined;
  const control =
    errorId && isValidElement<{ "aria-describedby"?: string }>(children)
      ? cloneElement(children, {
          "aria-invalid": true,
          "aria-describedby": cx(children.props["aria-describedby"], errorId),
        } as Record<string, unknown>)
      : children;

  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-danger-fg">*</span> : null}
      </label>
      {control}
      {hint && !error ? (
        <p className="mt-1.5 text-[12.5px] text-muted">{hint}</p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1.5 text-[12.5px] font-medium text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx("field", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx("field resize-y", className)} {...props} />;
}

/** The arrow is drawn by `select.field` in globals.css. */
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx("field", className)} {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Page furniture                                                             */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  // The title band of every working page: the title, a line under it, and the
  // page's main action at the right.
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div>
        <h1 className="text-[18px] leading-snug font-medium text-ink sm:text-[20px]">{title}</h1>
        {description ? (
          <p className="mt-1.5 text-[14px] text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Section tabs: equal segments across the column, the current one filled.
 * Each is a link, so a section is one address and the back button works.
 */
export function SectionTabs({
  label,
  tabs,
  current,
}: {
  /** Names the set for a screen reader, e.g. "Contacts sections". */
  label: string;
  tabs: Array<{ href: string; label: string }>;
  current: string;
}) {
  return (
    <nav aria-label={label} className="mb-8">
      <ul className="flex">
        {tabs.map((tab) => {
          const active = tab.href === current;
          return (
            <li key={tab.href} className="-ml-px min-w-0 flex-1 first:ml-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-12.5 items-center justify-center border px-2 text-center text-[14px] leading-tight sm:text-[16px]",
                  active
                    ? "relative border-brand-600 bg-brand-600 font-bold text-white"
                    : "border-line text-muted hover:bg-subtle hover:text-ink",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Small key/value row used in review panels and detail pages. */
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-h-10.5 items-center justify-between gap-6 border-b border-line py-2.5 last:border-b-0">
      <dt className="text-[13.5px] text-muted">{label}</dt>
      <dd className="text-right text-[13.5px] font-medium text-ink">{value}</dd>
    </div>
  );
}

export function Stat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <div className="card px-5 py-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p
        className={cx(
          "mt-1.5 text-[24px] leading-tight font-bold tabular-nums",
          tone === "neutral" ? "text-ink" : TONES[tone].split(" ")[1],
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}
