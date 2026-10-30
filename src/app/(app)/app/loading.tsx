import { PageSkeleton } from "@/components/page-skeleton";

/**
 * Loading state for every portal page.
 *
 * Portal pages are rendered on request, and without a loading state Next.js
 * cannot prefetch anything for them, so a click waited for the server with
 * nothing on screen. With this, links prefetch the loading state and a click
 * switches pages at once while the content streams in.
 *
 * A loading state only shows when the route segment directly below it
 * changes, so the sections with pages of their own (campaigns, contacts and
 * groups, settings, credits) have one too, for moving between their pages.
 *
 * Because the page streams, a page that turns out not to exist arrives as the
 * not-found page with a 200 status rather than a 404: Next.js cannot change
 * the status once the response has started.
 */
export default function Loading() {
  return <PageSkeleton />;
}
