import { logoutAction } from "@/server/actions/auth";
import { IconLogOut } from "./icons";

/**
 * Signs the current user out. A plain form posting to the server action, so it
 * works before any client JavaScript has loaded. The label is icon-only on
 * narrow screens, where the header has little room.
 */
export function LogoutButton({ label }: { label: string }) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        aria-label={label}
        className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5 text-[13px] font-semibold text-ink hover:bg-navy-50 sm:px-3"
      >
        <IconLogOut size={15} className="text-muted" />
        <span className="hidden sm:inline">{label}</span>
      </button>
    </form>
  );
}
