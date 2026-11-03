import { logoutAction } from "@/server/actions/auth";
import { IconLogOut } from "./icons";

/**
 * Signs the current user out. A plain form posting to the server action, so it
 * works before any client JavaScript has loaded.
 *
 * `utility` is a small text link for the header's top row; `button` is the
 * bordered button with an icon, whose label is icon-only on narrow screens.
 */
export function LogoutButton({
  label,
  look = "button",
}: {
  label: string;
  look?: "button" | "utility";
}) {
  if (look === "utility") {
    return (
      <form action={logoutAction}>
        <button type="submit" className="-my-1 py-1 text-[12px] text-muted hover:text-ink">
          {label}
        </button>
      </form>
    );
  }

  return (
    <form action={logoutAction}>
      <button
        type="submit"
        aria-label={label}
        className="flex items-center gap-2 border border-line-strong px-2 py-1.5 text-[13px] text-ink hover:bg-navy-50 sm:px-3"
      >
        <IconLogOut size={15} className="text-muted" />
        <span className="hidden sm:inline">{label}</span>
      </button>
    </form>
  );
}
