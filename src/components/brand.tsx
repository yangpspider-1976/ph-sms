import Link from "next/link";
import { cx } from "./ui";

/** Product name is configurable; this is a working name, not finalized branding. */
export const PRODUCT_NAME = "PH SMS";
export const PRODUCT_TAGLINE = "Simple Messaging for a More Connected Philippines";

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[9px] bg-brand-600 text-white"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        width={size * 0.58}
        height={size * 0.58}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 2.6V11.5A7.5 7.5 0 0 1 11.5 4h2A7.5 7.5 0 0 1 21 11.5Z" />
        <path d="M9 11.8h.01M12.5 11.8h.01M16 11.8h.01" />
      </svg>
    </span>
  );
}

export function Wordmark({
  href = "/",
  subtitle,
  onDark = false,
  size = 30,
}: {
  href?: string;
  subtitle?: string;
  onDark?: boolean;
  size?: number;
}) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="leading-none">
        <span
          className={cx(
            "block text-[19px] font-extrabold tracking-tight",
            onDark ? "text-white" : "text-ink",
          )}
        >
          {PRODUCT_NAME}
        </span>
        {subtitle ? (
          <span
            className={cx(
              "mt-1 block text-[12px] font-medium",
              onDark ? "text-navy-300" : "text-muted",
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/**
 * Persistent demo marker. In MOCK mode nothing here sends an SMS or takes a
 * payment, and the interface says so on every page rather than letting a
 * screenshot be mistaken for a live system.
 */
export function DemoFooterMark({ className }: { className?: string }) {
  return (
    <p className={cx("text-[12px] text-muted", className)}>
      Design preview • Sample content • Demo — no real SMS or payments
    </p>
  );
}

/**
 * Loose handwritten annotation used on the marketing page.
 *
 * The colour is a prop rather than something the caller overrides via
 * className: `cx` concatenates classes without merging them, so passing
 * `text-navy-300` alongside a default `text-navy-500` left both on the element
 * and the winner came down to stylesheet order. One of those two fails
 * contrast on whichever background it lands on.
 */
export function Scribble({
  children,
  className,
  rotate = -4,
  on = "light",
}: {
  children: React.ReactNode;
  className?: string;
  rotate?: number;
  /** Which background this sits on; decides the accessible ink colour. */
  on?: "light" | "dark";
}) {
  return (
    <span
      className={cx(
        "pointer-events-none select-none text-[13px] leading-snug",
        // 5.73:1 on the light hero; 6.50:1 on the dark band. Both pass AA.
        on === "dark" ? "text-navy-300" : "text-navy-500",
        className,
      )}
      style={{
        fontFamily: "'Segoe Script', 'Bradley Hand', 'Comic Sans MS', cursive",
        transform: `rotate(${rotate}deg)`,
        display: "inline-block",
      }}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}
