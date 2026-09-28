import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { IconChevronRight, IconInfo } from "./icons";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dark";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "bg-white text-brand-700 border border-brand-200 hover:bg-brand-50",
  ghost: "bg-white text-ink border border-line hover:bg-navy-50",
  danger: "bg-white text-danger-fg border border-danger-bg hover:bg-danger-bg",
  dark: "bg-navy-800 text-white hover:bg-navy-900",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "text-[13px] px-3 py-1.5",
  md: "text-sm px-4 py-2.5",
  lg: "text-[15px] px-6 py-3",
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
 */
export function DataTable({ className, children, ...props }: ComponentProps<"table">) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className={cx("data-table", className)} {...props}>
        {children}
      </table>
    </div>
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
    brand: "bg-brand-50 text-brand-600",
    teal: "bg-teal-100 text-teal-700",
    violet: "bg-violet-bg text-violet-fg",
    navy: "bg-navy-100 text-navy-700",
  } as const;

  return (
    <Link
      href={href}
      className="card flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:border-brand-200 hover:bg-brand-50/40"
    >
      <span
        className={cx(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px]",
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

/** Status pill with a dot. The label always carries the meaning, not the colour. */
export function Pill({
  tone = "neutral",
  children,
  dot = true,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold",
        TONES[tone],
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" /> : null}
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
  const border: Record<Tone, string> = {
    info: "border-brand-200",
    success: "border-success-bg",
    warning: "border-warning-bg",
    danger: "border-danger-bg",
    violet: "border-violet-bg",
    neutral: "border-line",
    brand: "border-brand-200",
  };
  return (
    <div className={cx("rounded-[10px] border p-4", TONES[tone], border[tone])}>
      <div className="flex gap-2.5">
        <IconInfo size={17} className="mt-px shrink-0" />
        <div className="min-w-0">
          <p className="text-[13.5px] font-bold">{title}</p>
          {/* No opacity: the tone colours sit at ~4.9:1, and dimming them fails AA. */}
          {children ? <div className="mt-1 text-[13px]">{children}</div> : null}
          {supportRef ? (
            <p className="mt-2 text-[12px]">Support reference: {supportRef}</p>
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
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon ? (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 text-muted">
          {icon}
        </span>
      ) : null}
      <p className="text-[15px] font-bold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
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
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-danger-fg">*</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p className="mt-1.5 text-[12.5px] text-muted">{hint}</p>
      ) : null}
      {error ? (
        <p className="mt-1.5 text-[12.5px] font-medium text-danger-fg">{error}</p>
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

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx("field appearance-none pr-8", className)} {...props} />;
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
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[27px] leading-tight font-extrabold text-ink">{title}</h1>
        {description ? (
          <p className="mt-1.5 text-[14px] text-body">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/** Small key/value row used in review panels and detail pages. */
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-line py-2.5 last:border-b-0">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-right text-[13px] font-semibold text-ink">{value}</dd>
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
    <div className="card px-4 py-3.5">
      <p className="text-[12.5px] font-medium text-muted">{label}</p>
      <p
        className={cx(
          "mt-1 text-[22px] font-extrabold",
          tone === "neutral" ? "text-ink" : TONES[tone].split(" ")[1],
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}
