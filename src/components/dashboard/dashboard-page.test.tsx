import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/hooks/crm", () => ({
  useUsers: () => ({ data: [] }),
}));

// The 4 caras pull their own TanStack Query data; they're irrelevant to the
// export trigger under test, so they're stubbed out to avoid needing a
// QueryClientProvider / network mocking for this test file.
vi.mock("@/components/dashboard/cara-pipeline", () => ({
  CaraPipeline: () => <div data-testid="cara-pipeline" />,
}));
vi.mock("@/components/dashboard/cara-tasks", () => ({
  CaraTareas: () => <div data-testid="cara-tasks" />,
}));
vi.mock("@/components/dashboard/cara-clients-activity", () => ({
  CaraClientesActividad: () => <div data-testid="cara-clients-activity" />,
}));
vi.mock("@/components/dashboard/cara-my-summary", () => ({
  CaraMiResumen: () => <div data-testid="cara-my-summary" />,
}));

import { DashboardTabs, EXPORT_CONFIG } from "./dashboard-page";

function mockFetchOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["x"])),
    }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  // jsdom does not implement these; the download flow needs them stubbed.
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DashboardTabs — Excel export trigger", () => {
  it("only maps the 4 implemented caras — a future 'management' cara stays PDF-only until added here", () => {
    expect(Object.keys(EXPORT_CONFIG).sort()).toEqual(
      ["clients-activity", "my-summary", "pipeline", "tasks"].sort(),
    );
  });

  it("shows an 'Exportar Excel' trigger for the default (pipeline) cara", () => {
    render(<DashboardTabs />);

    expect(screen.getByRole("button", { name: /exportar excel/i })).toBeInTheDocument();
  });

  it("shows the trigger for every one of the 4 implemented caras", async () => {
    const user = userEvent.setup();
    render(<DashboardTabs />);

    for (const label of [
      "Gestión de tareas",
      "Actividad de clientes",
      "Mi resumen",
      "Pipeline comercial",
    ]) {
      await user.click(screen.getByRole("button", { name: label }));
      expect(screen.getByRole("button", { name: /exportar excel/i })).toBeInTheDocument();
    }
  });

  it("downloads the pipeline export from the dashboard pipeline export endpoint with the current filters", async () => {
    mockFetchOk();
    const user = userEvent.setup();
    render(<DashboardTabs />);

    await user.click(screen.getByRole("button", { name: /exportar excel/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^\/api\/v1\/dashboard\/pipeline\/export/),
      );
    });
  });

  it("downloads the tasks-cara export from its own export endpoint (not the pipeline one)", async () => {
    mockFetchOk();
    const user = userEvent.setup();
    render(<DashboardTabs />);

    await user.click(screen.getByRole("button", { name: "Gestión de tareas" }));
    await user.click(screen.getByRole("button", { name: /exportar excel/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^\/api\/v1\/dashboard\/tasks\/export/),
      );
    });
  });
});
