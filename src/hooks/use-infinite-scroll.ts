"use client";

// Shared infinite-scroll trigger for admin list screens (audit-log-section,
// accesos-section). Wraps the standard useInfiniteQuery result shape
// ({ hasNextPage, fetchNextPage, isFetchingNextPage }) and returns a
// callback ref to attach to a sentinel element placed after the list.

import { useCallback, useEffect, useRef } from "react";

export type UseInfiniteScrollOptions = {
  hasNextPage: boolean;
  fetchNextPage: () => unknown;
  isFetchingNextPage: boolean;
  /** Disables the observer entirely (e.g. while a list is in an error
   * state). Default: true. */
  enabled?: boolean;
  /** Passed through to `IntersectionObserver`'s `rootMargin`, so the fetch
   * starts slightly before the sentinel is actually on screen. Default:
   * "200px". */
  rootMargin?: string;
};

/**
 * Attaches an `IntersectionObserver` to a sentinel element and calls
 * `fetchNextPage` when it enters the viewport, guarding against duplicate
 * calls while a fetch is already in flight or there is no next page.
 *
 * Usage: `<div ref={sentinelRef} />` placed right after the list/table.
 */
export function useInfiniteScroll({
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  enabled = true,
  rootMargin = "200px",
}: UseInfiniteScrollOptions): (node: Element | null) => void {
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Latest values live in refs so the observer callback (created once per
  // sentinel node) always reads the current fetch state instead of a stale
  // closure captured when the sentinel was attached.
  const hasNextPageRef = useRef(hasNextPage);
  const isFetchingNextPageRef = useRef(isFetchingNextPage);
  const fetchNextPageRef = useRef(fetchNextPage);
  const isIntersectingRef = useRef(false);

  hasNextPageRef.current = hasNextPage;
  isFetchingNextPageRef.current = isFetchingNextPage;
  fetchNextPageRef.current = fetchNextPage;

  const maybeFetchNextPage = useCallback(() => {
    if (
      isIntersectingRef.current &&
      hasNextPageRef.current &&
      !isFetchingNextPageRef.current
    ) {
      fetchNextPageRef.current();
    }
  }, []);

  const sentinelRef = useCallback(
    (node: Element | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      isIntersectingRef.current = false;

      if (!node || !enabled) return;

      const observer = new IntersectionObserver(
        (entries) => {
          isIntersectingRef.current = entries[0]?.isIntersecting ?? false;
          maybeFetchNextPage();
        },
        { rootMargin },
      );

      observer.observe(node);
      observerRef.current = observer;
    },
    [enabled, rootMargin, maybeFetchNextPage],
  );

  // Gotcha: once a page fetch resolves, the sentinel may still be sitting in
  // the viewport (short pages / tall screens) with no new intersection
  // event to fire the observer callback again — IntersectionObserver only
  // fires on a transition, not on every frame it stays intersecting. This
  // re-checks the last known intersection state whenever the guard
  // conditions change, so a tall viewport keeps fetching pages instead of
  // stalling until the user nudges the scrollbar.
  useEffect(() => {
    maybeFetchNextPage();
  }, [hasNextPage, isFetchingNextPage, maybeFetchNextPage]);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  return sentinelRef;
}
