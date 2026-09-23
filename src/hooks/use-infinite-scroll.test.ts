import { render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installMockIntersectionObserver,
  latestIntersectionObserver,
} from "@/test/intersection-observer";
import { useInfiniteScroll } from "./use-infinite-scroll";

/** Mounts a component that calls useInfiniteScroll and attaches the returned
 * ref to a sentinel div, so the hook's callback-ref path runs like it would
 * inside a real component. */
function Sentinel(props: {
  hasNextPage: boolean;
  fetchNextPage: () => unknown;
  isFetchingNextPage: boolean;
}) {
  const sentinelRef = useInfiniteScroll(props);
  return createElement("div", { "data-testid": "sentinel", ref: sentinelRef });
}

describe("useInfiniteScroll", () => {
  beforeEach(() => {
    installMockIntersectionObserver();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls fetchNextPage when the sentinel intersects", () => {
    const fetchNextPage = vi.fn();
    render(
      createElement(Sentinel, {
        hasNextPage: true,
        fetchNextPage,
        isFetchingNextPage: false,
      }),
    );

    latestIntersectionObserver().trigger(true);

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("does not call fetchNextPage when hasNextPage is false", () => {
    const fetchNextPage = vi.fn();
    render(
      createElement(Sentinel, {
        hasNextPage: false,
        fetchNextPage,
        isFetchingNextPage: false,
      }),
    );

    latestIntersectionObserver().trigger(true);

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("does not call fetchNextPage when isFetchingNextPage is true", () => {
    const fetchNextPage = vi.fn();
    render(
      createElement(Sentinel, {
        hasNextPage: true,
        fetchNextPage,
        isFetchingNextPage: true,
      }),
    );

    latestIntersectionObserver().trigger(true);

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("does not call fetchNextPage when the sentinel is not intersecting", () => {
    const fetchNextPage = vi.fn();
    render(
      createElement(Sentinel, {
        hasNextPage: true,
        fetchNextPage,
        isFetchingNextPage: false,
      }),
    );

    latestIntersectionObserver().trigger(false);

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("disconnects the observer on unmount", () => {
    const fetchNextPage = vi.fn();
    const { unmount } = render(
      createElement(Sentinel, {
        hasNextPage: true,
        fetchNextPage,
        isFetchingNextPage: false,
      }),
    );
    const observer = latestIntersectionObserver();

    unmount();

    expect(observer.disconnect).toHaveBeenCalled();
  });
});
