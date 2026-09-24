// gestion-proyectos-workspace, Phase 4 (design.md T6): split of the
// previously self-fetching `CurveSChartContainer` into an exported
// presentational `CurveSChart` (props only, already existed unexported) + a
// container reading `useProjectDashboard`. The no-projectId container path
// is the regression guard for `/tablero-gerencial-client.tsx`, which still
// calls `<CurveSChartContainer />` with no props.

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectDashboard } from "@/hooks/projects";
import CurveSChartContainer, { CurveSChart } from "./curve-s-chart";

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

describe("CurveSChart (presentational)", () => {
  it("renders the empty state when there is no data", () => {
    render(<CurveSChart data={null} />);
    expect(screen.getByText("Sin datos disponibles")).toBeInTheDocument();
  });

  it("renders a bar per mes when data is present", () => {
    render(<CurveSChart data={makeData().curva_s} />);
    expect(screen.getByText("Curva S")).toBeInTheDocument();
    // The chart truncates the raw "YYYY-MM" mes label to its first 3 chars.
    expect(screen.getByText("2026-01".slice(0, 3))).toBeInTheDocument();
  });

  it("spaces the y-axis marks vertically, 100% at the top and 0% at the bottom", () => {
    render(<CurveSChart data={makeData().curva_s} />);

    // jsdom does not compute real layout, but it DOES reflect the inline
    // `style` we assign ourselves, so reading `style.top` here is a valid,
    // discriminating check (unlike asserting on Tailwind-only classes).
    const pcts = [0, 25, 50, 75, 100];
    const tops = pcts.map(
      (pct) => screen.getByTestId(`y-axis-mark-${pct}`).style.top
    );

    // All 5 marks must land on distinct vertical positions.
    expect(new Set(tops).size).toBe(5);

    // Percentage axis: as pct increases, `top` must strictly decrease
    // (higher percentage = higher on screen = smaller `top`).
    const topValues = tops.map((top) => parseFloat(top));
    for (let i = 1; i < topValues.length; i++) {
      expect(topValues[i]).toBeLessThan(topValues[i - 1]);
    }
  });
});

describe("CurveSChartContainer", () => {
  it("fetches the org-wide dashboard when called with no projectId (tablero-gerencial regression guard)", () => {
    dashboardQuery.data = makeData();

    render(<CurveSChartContainer />);

    expect(useProjectDashboardMock).toHaveBeenCalledWith(null);
  });

  it("fetches the scoped dashboard when given a projectId", () => {
    dashboardQuery.data = makeData();

    render(<CurveSChartContainer projectId="proy-1" />);

    expect(useProjectDashboardMock).toHaveBeenCalledWith("proy-1");
  });

  it("shows the loading state", () => {
    dashboardQuery.isLoading = true;

    render(<CurveSChartContainer />);

    expect(screen.getByText("Cargando curva S...")).toBeInTheDocument();
  });

  it("shows the error state", () => {
    dashboardQuery.isError = true;

    render(<CurveSChartContainer />);

    expect(screen.getByText("No se pudo cargar la curva S")).toBeInTheDocument();
  });
});
