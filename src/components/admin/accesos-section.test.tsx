import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccesosSection } from "./accesos-section";
import type { AccesoRow } from "@/hooks/admin";
import {
  installMockIntersectionObserver,
  latestIntersectionObserver,
} from "@/test/intersection-observer";

const { accesosQuery } = vi.hoisted(() => ({
  accesosQuery: {
    data: {
      pages: [
        {
          accesos: [
            {
              id: "acc-1",
              created_at: "2026-08-01T12:00:00.000Z",
              ip: "10.0.0.1",
              user_agent: "Mozilla/5.0",
              usuario: { email: "ana@muttu.co", nombre: "Ana Pérez" },
            },
          ] as AccesoRow[],
          next_before: null as string | null,
        },
      ],
    },
    isLoading: false,
    isError: false,
    error: null as unknown,
    hasNextPage: true,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  },
}));

vi.mock("@/hooks/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/admin")>();
  return { ...actual, useAccesos: () => accesosQuery };
});

describe("AccesosSection", () => {
  beforeEach(() => {
    accesosQuery.hasNextPage = true;
    accesosQuery.isFetchingNextPage = false;
    accesosQuery.isError = false;
    accesosQuery.fetchNextPage.mockReset();
    installMockIntersectionObserver();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the access log rows", () => {
    render(<AccesosSection />);

    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("ana@muttu.co")).toBeInTheDocument();
  });

  it("auto-fetches the next page when the scroll sentinel intersects", () => {
    render(<AccesosSection />);

    latestIntersectionObserver().trigger(true);

    expect(accesosQuery.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("does not auto-fetch when there is no next page", () => {
    accesosQuery.hasNextPage = false;
    render(<AccesosSection />);

    // hasNextPage=false means no sentinel is rendered at all, so there is
    // no observer instance to trigger — this asserts the guard at the
    // rendering level (the fallback button is also hidden).
    expect(screen.queryByTestId("infinite-scroll-sentinel")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument();
  });

  it("does not auto-fetch while a page is already loading", () => {
    accesosQuery.isFetchingNextPage = true;
    render(<AccesosSection />);

    latestIntersectionObserver().trigger(true);

    expect(accesosQuery.fetchNextPage).not.toHaveBeenCalled();
  });

  it("still renders the manual 'Cargar más' button alongside the sentinel", () => {
    render(<AccesosSection />);

    expect(screen.getByRole("button", { name: "Cargar más" })).toBeInTheDocument();
  });
});
