// tablero-seguimiento-social, Fase 4c (4c.3): la quinta cara "Tablero de
// Control Gerencial" compone los seis KPIs de spec.md management-dashboard
// sobre el único endpoint agregado (`useDashboardManagement`, D9), con las
// primitivas SVG propias (D7) y las reutilizaciones existentes.

import { fireEvent, render, screen, within } from "@testing-library/react";
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

import { buildRadarAxes, CaraGerencial } from "./cara-management";

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
    por_proyecto: [],
    por_territorio: [],
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

// F1.6 (tablero-gerencial-unificado): radar multi-eje (D1) — la razón de
// negocio (qué 5 KPIs, en qué orden) vive en una función pura testeada por
// separado del render, en vez de inspeccionar geometría SVG.
describe("buildRadarAxes (F1.6, design.md D1)", () => {
  it("builds exactly 5 axes: técnico, financiero, indicadores, cronograma, entregables", () => {
    const axes = buildRadarAxes(
      makeData({
        avance_tecnico: 70,
        avance_financiero: 60,
        cumplimiento_indicadores: 80,
        cumplimiento_cronograma: 90,
        productos_entregados: 3,
        productos_programados: 6,
      }),
    );

    expect(axes).toEqual([
      { label: "Avance técnico", value: 70 },
      { label: "Avance financiero", value: 60 },
      { label: "Cumplimiento de indicadores", value: 80 },
      { label: "Cumplimiento de cronograma", value: 90 },
      { label: "Entregables", value: 50 },
    ]);
  });

  it("entregables axis is 0 (not NaN) when nothing is programado", () => {
    const axes = buildRadarAxes(makeData({ productos_entregados: 0, productos_programados: 0 }));
    expect(axes.find((a) => a.label === "Entregables")).toEqual({ label: "Entregables", value: 0 });
  });
});

describe("CaraGerencial — F1.6 (tablero-gerencial-unificado)", () => {
  it("passes exactly 5 axes to the Radar", () => {
    mgmtQuery.data = makeData();
    const { container } = render(<CaraGerencial filters={{}} />);
    expect(container.querySelectorAll('[data-testid="radar-eje"]').length).toBe(5);
  });

  it("renders one cronograma bar and one entregables row per por_proyecto entry, not a single aggregated bar", () => {
    mgmtQuery.data = makeData({
      por_proyecto: [
        {
          proyecto_id: "p1",
          nombre: "Proyecto Uno",
          cumplimiento_cronograma: 80,
          productos_entregados: 3,
          productos_programados: 5,
        },
        {
          proyecto_id: "p2",
          nombre: "Proyecto Dos",
          cumplimiento_cronograma: 40,
          productos_entregados: 1,
          productos_programados: 4,
        },
      ],
    });
    render(<CaraGerencial filters={{}} />);

    // Cada proyecto aparece en la sección de cronograma Y en la de
    // entregables — dos apariciones, nunca una sola barra agregada.
    expect(screen.getAllByText("Proyecto Uno")).toHaveLength(2);
    expect(screen.getAllByText("Proyecto Dos")).toHaveLength(2);
  });

  it("renders 'Semaforización territorial' with one row per por_territorio entry", () => {
    mgmtQuery.data = makeData({
      por_territorio: [
        { territorio: "Bogotá", proyectos_count: 3, color_tecnico: "verde", color_financiero: "rojo" },
        { territorio: "Cali", proyectos_count: 1, color_tecnico: "amarillo", color_financiero: "verde" },
      ],
    });
    render(<CaraGerencial filters={{}} />);

    const section = screen.getByText("Semaforización territorial").closest("section")!;
    expect(within(section).getByText("Bogotá")).toBeInTheDocument();
    expect(within(section).getByText("Cali")).toBeInTheDocument();
    expect(within(section).getByText("3 proyectos")).toBeInTheDocument();
    expect(within(section).getByText("1 proyecto")).toBeInTheDocument();
  });

  it("shows a Línea estratégica chip selector and includes it in the query on selection", () => {
    mgmtQuery.data = makeData();
    render(<CaraGerencial filters={{ desde: "2026-01-01" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Empleabilidad" }));

    expect(useDashboardManagementMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ desde: "2026-01-01", linea_estrategica: "EMPLEABILIDAD" }),
    );
  });

  it("shows a Territorio input and includes it in the query on change", () => {
    mgmtQuery.data = makeData();
    render(<CaraGerencial filters={{}} />);

    fireEvent.change(screen.getByLabelText("Territorio"), { target: { value: "Cali" } });

    expect(useDashboardManagementMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ territorio: "Cali" }),
    );
  });

  it("shows a doble-conteo warning when indicadores_beneficiarios_count > 1 (Auditoría KPI 6)", () => {
    mgmtQuery.data = makeData({ indicadores_beneficiarios_count: 2 });
    render(<CaraGerencial filters={{}} />);
    expect(screen.getByText(/riesgo de doble conteo/i)).toBeInTheDocument();
  });

  it("does not show the doble-conteo warning when indicadores_beneficiarios_count is 1", () => {
    mgmtQuery.data = makeData({ indicadores_beneficiarios_count: 1 });
    render(<CaraGerencial filters={{}} />);
    expect(screen.queryByText(/riesgo de doble conteo/i)).not.toBeInTheDocument();
  });
});
