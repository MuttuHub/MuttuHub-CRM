// tablero-seguimiento-social, Fase 4c (4c.4): el shell del dashboard expone
// la quinta cara "Tablero gerencial" en el arreglo `CARAS` y la monta al
// seleccionarla, junto a las otras cuatro. Las caras se mockean para aislar
// el cableado del shell (spec.md "Integración en el shell existente").
//
// dashboard-export-excel: segundo describe en este mismo archivo — cubre el
// trigger "Exportar Excel" de las 4 caras tabulares. Reusa los mismos mocks
// de caras de arriba (incluye cara-management para no montar el componente
// real, aunque esa cara no tenga export).

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>();
  return { ...actual, useUsers: () => ({ data: [] }) };
});

vi.mock("@/components/dashboard/cara-pipeline", () => ({
  CaraPipeline: () => <div>cara-pipeline</div>,
}));
vi.mock("@/components/dashboard/cara-tasks", () => ({
  CaraTareas: () => <div>cara-tasks</div>,
}));
vi.mock("@/components/dashboard/cara-clients-activity", () => ({
  CaraClientesActividad: () => <div>cara-clients-activity</div>,
}));
vi.mock("@/components/dashboard/cara-my-summary", () => ({
  CaraMiResumen: () => <div>cara-my-summary</div>,
}));
vi.mock("@/components/dashboard/cara-management", () => ({
  CaraGerencial: () => <div>cara-management</div>,
}));

import { DashboardTabs, EXPORT_CONFIG } from "./dashboard-page";

describe("DashboardTabs (shell)", () => {
  it("lists the fifth 'Tablero gerencial' face next to the other four", () => {
    render(<DashboardTabs />);
    for (const label of [
      "Pipeline comercial",
      "Gestión de tareas",
      "Actividad de clientes",
      "Mi resumen",
      "Tablero gerencial",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("mounts the management face only when its tab is selected", () => {
    render(<DashboardTabs />);
    expect(screen.queryByText("cara-management")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Tablero gerencial" }));

    expect(screen.getByText("cara-management")).toBeInTheDocument();
    expect(screen.queryByText("cara-pipeline")).toBeNull();
  });

  // F1.6 (tablero-gerencial-unificado, design.md's Routing Decision): `/` +
  // `/?cara=management` (nav, o el redirect 308 de `/tablero-gerencial`)
  // deben montar la 5.ª cara directamente, sin que el usuario tenga que
  // hacer clic en la pestaña.
  it("mounts the management face first when initialCara='management' (from ?cara=management)", () => {
    render(<DashboardTabs initialCara="management" />);

    expect(screen.getByText("cara-management")).toBeInTheDocument();
    expect(screen.queryByText("cara-pipeline")).toBeNull();
    expect(screen.getByRole("button", { name: "Tablero gerencial" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("defaults to the pipeline face when no initialCara is given", () => {
    render(<DashboardTabs />);

    expect(screen.getByText("cara-pipeline")).toBeInTheDocument();
    expect(screen.queryByText("cara-management")).toBeNull();
  });
});

function mockFetchOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["x"])),
    }),
  );
}

describe("DashboardTabs — Excel export trigger", () => {
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

  it("only maps the 4 implemented caras — the 'management' cara stays PDF-only", () => {
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

  it("hides the trigger for the management (tacómetro/radar) cara", async () => {
    const user = userEvent.setup();
    render(<DashboardTabs />);

    await user.click(screen.getByRole("button", { name: "Tablero gerencial" }));

    expect(screen.queryByRole("button", { name: /exportar excel/i })).toBeNull();
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
