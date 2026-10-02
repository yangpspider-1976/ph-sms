"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** How often the page re-reads the campaign while messages are going out. */
const INTERVAL_MS = 5_000;

/** A tab left open on a stuck campaign stops asking after this long. */
const LIMIT_MS = 3 * 60_000;

/**
 * Re-reads the campaign while it is sending.
 *
 * Dispatch runs after the page that triggered it has been served, so the first
 * view of a campaign that has just become due still shows it waiting. Without
 * this, that is where it stays until someone thinks to press F5.
 */
export function RefreshWhileSending() {
  const router = useRouter();

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > LIMIT_MS) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);

  return null;
}
