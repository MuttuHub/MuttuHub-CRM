// gestion-proyectos-workspace, Phase 4 (design.md T6): split of the
// previously self-fetching `KpiCards` into a presentational `KpiCardsView`
// (props only) + a container that reads `useProjectDashboard`. The
// no-projectId container behavior is the regression guard for
// `/tablero-gerencial-client.tsx`, which still calls `<KpiCards />` with no
// props and must keep receiving the org-wide aggregate.

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectDashboard } from "@/hooks/projects";
import { KpiCards, KpiCardsView } from "./kpi-cards";

const { dashboardQuery, useProjectDashboardMock } = vi.hoisted(() => ({
  dashboardQuery: {
    data: null as ProjectDashboard | null,
    isLoading: false,
    isError: false,
  },
  useProjectDashboardMock: vi.fn(),
}));

vi.mock("@/hooks/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/projects")>();
  return {
    ...actual,
    useProjectDashboard: (projectId: string | null) => {
      useProjectDashboardMock(projectId);
      return dashboardQuery;
    },
  };
});

function makeData(overrides: Partial<ProjectDashboard> = {}): ProjectDashboard {
  return {
    avance_tecnico: 72,
    avance_financiero: 65,
    cumplimiento_indicadores: 80,
    cumplimiento_cronograma: 90,
    productos_entregados: 4,
    productos_programados: 6,
    beneficiarios_atendidos: 120,
    beneficiarios_meta: 200,
    indicadores_beneficiarios_count: 1,
    color_tecnico: "verde",
    color_financiero: "amarillo",
    curva_s: { meses: ["2026-01"], planificado: [10], ejecutado: [8] },
    ...overrides,
  };
}

beforeEach(() => {
  dashboardQuery.data = null;
  dashboardQuery.isLoading = false;
  dashboardQuery.isError = false;
  useProjectDashboardMock.mockClear();
});

describe("KpiCardsView", () => {
  it("renders the 6 KPI cards from props", () => {
    render(<KpiCardsView data={makeData()} />);

    expect(screen.getByText("Avance Técnico")).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.getByText("Beneficiarios")).toBeInTheDocument();
    expect(screen.getByText("120/200")).toBeInTheDocument();
  });
});

describe("KpiCards (container)", () => {
  it("fetches the org-wide dashboard when called with no projectId (tablero-gerencial regression guard)", () => {
    dashboardQuery.data = makeData();

    render(<KpiCards />);

    expect(useProjectDashboardMock).toHaveBeenCalledWith(null);
  });

  it("fetches the scoped dashboard when given a projectId", () => {
    dashboardQuery.data = makeData();

    render(<KpiCards projectId="proy-1" />);

    expect(useProjectDashboardMock).toHaveBeenCalledWith("proy-1");
  });

  it("shows the loading state", () => {
    dashboardQuery.isLoading = true;

    render(<KpiCards />);

    expect(screen.getByText("Cargando...")).toBeInTheDocument();
  });

  it("shows the error state", () => {
    dashboardQuery.isError = true;

    render(<KpiCards />);

    expect(screen.getByText("No se pudo cargar el tablero gerencial")).toBeInTheDocument();
  });
});
