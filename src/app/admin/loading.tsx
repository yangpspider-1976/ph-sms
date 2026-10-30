import { PageSkeleton } from "@/components/page-skeleton";

/**
 * Loading state for the admin console's pages, which are all direct children
 * of /admin. See app/(app)/app/loading.tsx for why it matters.
 */
export default function Loading() {
  return <PageSkeleton />;
}
