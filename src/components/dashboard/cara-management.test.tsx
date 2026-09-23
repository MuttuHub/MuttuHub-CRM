// tablero-seguimiento-social, Fase 4c (4c.3): la quinta cara "Tablero de
// Control Gerencial" compone los seis KPIs de spec.md management-dashboard
// sobre el único endpoint agregado (`useDashboardManagement`, D9), con las
// primitivas SVG propias (D7) y las reutilizaciones existentes.

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectDashboard } from "@/hooks/projects";
import { ApiError } from "@/lib/api/http";

const { mgmtQuery, useDashboardManagementMock } = vi.hoisted(() => ({
  mgmtQuery: {
    data: null as ProjectDashboard | null,
    isLoading: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  useDashboardManagementMock: vi.fn(),
}));

vi.mock("@/hooks/dashboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/dashboard")>();
  return {
    ...actual,
    useDashboardManagement: (filters: unknown) => {
      useDashboardManagementMock(filters);
      return mgmtQuery;
    },
  };
});

import { CaraGerencial } from "./cara-management";

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
    curva_s: { meses: ["2026-01", "2026-02"], planificado: [10, 40], ejecutado: [8, 30] },
    ...overrides,
  };
}

beforeEach(() => {
  mgmtQuery.data = null;
  mgmtQuery.isLoading = false;
  mgmtQuery.isError = false;
  mgmtQuery.error = null;
  useDashboardManagementMock.mockClear();
});

describe("CaraGerencial", () => {
  it("renders the six KPI blocks from the aggregated endpoint", () => {
    mgmtQuery.data = makeData();
    const { container } = render(<CaraGerencial filters={{}} />);

    expect(screen.getByText("Avance técnico")).toBeInTheDocument();
    expect(screen.getByText("Avance financiero")).toBeInTheDocument();
    expect(screen.getByText("Cumplimiento de indicadores")).toBeInTheDocument();
    expect(screen.getByText("Cumplimiento de cronograma")).toBeInTheDocument();
    expect(screen.getByText("Productos entregados")).toBeInTheDocument();
    expect(screen.getByText("Beneficiarios atendidos")).toBeInTheDocument();

    // Primitivas SVG propias (D7) + la Curva S ya existente.
    expect(container.querySelector('[data-testid="tacometro-aguja"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="radar-poligono"]')).not.toBeNull();
    expect(screen.getByText("Curva S")).toBeInTheDocument();
  });

  it("passes the shell filters through to the aggregated query", () => {
    mgmtQuery.data = makeData();
    const filters = { desde: "2026-01-01", responsable_id: "u-1" };
    render(<CaraGerencial filters={filters} />);
    expect(useDashboardManagementMock).toHaveBeenCalledWith(filters);
  });

  it("shows the loading state", () => {
    mgmtQuery.isLoading = true;
    render(<CaraGerencial filters={{}} />);
    expect(screen.getByText("Cargando tablero gerencial…")).toBeInTheDocument();
  });

  it("shows a permission message on 403 instead of a generic failure", () => {
    mgmtQuery.isError = true;
    mgmtQuery.error = new ApiError("No tienes permisos para ver el tablero gerencial.", 403);
    render(<CaraGerencial filters={{}} />);
    expect(
      screen.getByText("No tienes permisos para ver el tablero gerencial."),
    ).toBeInTheDocument();
  });

  it("shows the retry card on a non-permission failure", () => {
    mgmtQuery.isError = true;
    mgmtQuery.error = new ApiError("Boom", 500);
    render(<CaraGerencial filters={{}} />);
    expect(screen.getByText("Plataforma no conectada")).toBeInTheDocument();
  });
});
