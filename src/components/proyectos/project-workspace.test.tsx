// gestion-proyectos-workspace, Phase 4 (design.md T1, T6 — spec.md "Workspace
// por proyecto con tabs" + "Tab Resumen reutiliza el endpoint agregado").
// Phases 5-7: Cronograma/Gantt/Indicadores are no longer disabled stubs —
// each mounts its own `tabs/*-tab.tsx` component, mirroring the Resumen
// tab's own mount-only-when-selected behavior (each tab component below is
// mocked so this file stays a pure `ProjectWorkspace` shell test).

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/http";
import type { ProjectDetail } from "@/hooks/projects";
import { ProjectWorkspace } from "./project-workspace";

const { detailQuery, routerReplaceMock, searchParamsMock } = vi.hoisted(() => ({
  detailQuery: {
    data: null as ProjectDetail | null,
    isLoading: false,
    isError: false,
    error: null as unknown,
  },
  routerReplaceMock: vi.fn(),
  searchParamsMock: { get: vi.fn<(key: string) => string | null>(() => null) },
}));

vi.mock("@/hooks/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/projects")>();
  return {
    ...actual,
    useProjectDetail: () => detailQuery,
  };
});

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({ replace: routerReplaceMock }),
    usePathname: () => "/proyectos/proy-1",
    useSearchParams: () => searchParamsMock,
  };
});

const resumenTabSpy = vi.fn();
vi.mock("@/components/proyectos/tabs/resumen-tab", () => ({
  ResumenTab: (props: { projectId: string }) => {
    resumenTabSpy(props);
    return <div data-testid="resumen-tab" />;
  },
}));

const cronogramaTabSpy = vi.fn();
vi.mock("@/components/proyectos/tabs/cronograma-tab", () => ({
  CronogramaTab: (props: { projectId: string }) => {
    cronogramaTabSpy(props);
    return <div data-testid="cronograma-tab" />;
  },
}));

const ganttTabSpy = vi.fn();
vi.mock("@/components/proyectos/tabs/gantt-tab", () => ({
  GanttTab: (props: { projectId: string }) => {
    ganttTabSpy(props);
    return <div data-testid="gantt-tab" />;
  },
}));

const indicadoresTabSpy = vi.fn();
vi.mock("@/components/proyectos/tabs/indicadores-tab", () => ({
  IndicadoresTab: (props: { projectId: string }) => {
    indicadoresTabSpy(props);
    return <div data-testid="indicadores-tab" />;
  },
}));

const financieroTabSpy = vi.fn();
vi.mock("@/components/proyectos/tabs/financiero-tab", () => ({
  FinancieroTab: (props: { projectId: string }) => {
    financieroTabSpy(props);
    return <div data-testid="financiero-tab" />;
  },
}));

const legalizacionTabSpy = vi.fn();
vi.mock("@/components/proyectos/tabs/legalizacion-tab", () => ({
  LegalizacionTab: (props: { projectId: string }) => {
    legalizacionTabSpy(props);
    return <div data-testid="legalizacion-tab" />;
  },
}));

function makeProject(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: "proy-1",
    codigo: "P-01",
    nombre: "Fortalecimiento Comunitario",
    cliente_id: "cli-1",
    cliente_nombre: "Alcaldía Demo",
    oportunidad_id: null,
    territorio: "Bogotá",
    linea_estrategica: "SOCIAL",
    fecha_inicio: "2026-01-01T00:00:00.000Z",
    fecha_fin: "2026-12-31T00:00:00.000Z",
    estado: "EN_EJECUCION",
    beneficiarios_meta: 100,
    responsable_id: "u-1",
    responsable_nombre: "Ana Pérez",
    puede_editar_proyecto: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  detailQuery.data = null;
  detailQuery.isLoading = false;
  detailQuery.isError = false;
  detailQuery.error = null;
  routerReplaceMock.mockClear();
  searchParamsMock.get.mockReset().mockReturnValue(null);
  resumenTabSpy.mockClear();
  cronogramaTabSpy.mockClear();
  ganttTabSpy.mockClear();
  indicadoresTabSpy.mockClear();
  financieroTabSpy.mockClear();
  legalizacionTabSpy.mockClear();
});

describe("ProjectWorkspace", () => {
  it("renders the header (nombre, código, cliente, estado) and the Resumen tab by default", () => {
    detailQuery.data = makeProject();

    render(<ProjectWorkspace projectId="proy-1" />);

    expect(screen.getByText("Fortalecimiento Comunitario")).toBeInTheDocument();
    expect(screen.getByText(/P-01/)).toBeInTheDocument();
    expect(screen.getByText(/Alcaldía Demo/)).toBeInTheDocument();
    expect(screen.getByText("En ejecución")).toBeInTheDocument();
    expect(screen.getByTestId("resumen-tab")).toBeInTheDocument();
    expect(resumenTabSpy).toHaveBeenCalledWith({ projectId: "proy-1" });
  });

  it("shows the link to the Oportunidad de origen only when oportunidad_id is set", () => {
    detailQuery.data = makeProject({ oportunidad_id: "opp-1" });
    const { rerender } = render(<ProjectWorkspace projectId="proy-1" />);
    expect(screen.getByRole("link", { name: /oportunidad de origen/i })).toBeInTheDocument();

    detailQuery.data = makeProject({ oportunidad_id: null });
    rerender(<ProjectWorkspace projectId="proy-1" />);
    expect(screen.queryByRole("link", { name: /oportunidad de origen/i })).not.toBeInTheDocument();
  });

  it("renders Cronograma/Gantt/Indicadores/Financiero/Legalización as enabled (non-disabled) tabs", () => {
    detailQuery.data = makeProject();

    render(<ProjectWorkspace projectId="proy-1" />);

    expect(screen.getByRole("tab", { name: "Cronograma" })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("tab", { name: "Gantt" })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("tab", { name: "Indicadores" })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("tab", { name: "Financiero" })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("tab", { name: "Legalización" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("mounts only the Cronograma tab's content (not Resumen) when ?tab=cronograma", () => {
    detailQuery.data = makeProject();
    searchParamsMock.get.mockImplementation((key: string) => (key === "tab" ? "cronograma" : null));

    render(<ProjectWorkspace projectId="proy-1" />);

    expect(screen.getByTestId("cronograma-tab")).toBeInTheDocument();
    expect(cronogramaTabSpy).toHaveBeenCalledWith({ projectId: "proy-1" });
    expect(screen.queryByTestId("resumen-tab")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gantt-tab")).not.toBeInTheDocument();
    expect(screen.queryByTestId("indicadores-tab")).not.toBeInTheDocument();
  });

  it("mounts only the Gantt tab's content when ?tab=gantt", () => {
    detailQuery.data = makeProject();
    searchParamsMock.get.mockImplementation((key: string) => (key === "tab" ? "gantt" : null));

    render(<ProjectWorkspace projectId="proy-1" />);

    expect(screen.getByTestId("gantt-tab")).toBeInTheDocument();
    expect(ganttTabSpy).toHaveBeenCalledWith({ projectId: "proy-1" });
    expect(screen.queryByTestId("resumen-tab")).not.toBeInTheDocument();
  });

  it("mounts only the Indicadores tab's content when ?tab=indicadores", () => {
    detailQuery.data = makeProject();
    searchParamsMock.get.mockImplementation((key: string) => (key === "tab" ? "indicadores" : null));

    render(<ProjectWorkspace projectId="proy-1" />);

    expect(screen.getByTestId("indicadores-tab")).toBeInTheDocument();
    expect(indicadoresTabSpy).toHaveBeenCalledWith({ projectId: "proy-1" });
    expect(screen.queryByTestId("resumen-tab")).not.toBeInTheDocument();
  });

  it("mounts only the Financiero tab's content when ?tab=financiero", () => {
    detailQuery.data = makeProject();
    searchParamsMock.get.mockImplementation((key: string) => (key === "tab" ? "financiero" : null));

    render(<ProjectWorkspace projectId="proy-1" />);

    expect(screen.getByTestId("financiero-tab")).toBeInTheDocument();
    expect(financieroTabSpy).toHaveBeenCalledWith({ projectId: "proy-1" });
    expect(screen.queryByTestId("resumen-tab")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cronograma-tab")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gantt-tab")).not.toBeInTheDocument();
    expect(screen.queryByTestId("indicadores-tab")).not.toBeInTheDocument();
  });

  it("does not mount the Financiero tab's content when another tab is active", () => {
    detailQuery.data = makeProject();

    render(<ProjectWorkspace projectId="proy-1" />);

    expect(screen.queryByTestId("financiero-tab")).not.toBeInTheDocument();
  });

  it("mounts only the Legalización tab's content when ?tab=legalizacion", () => {
    detailQuery.data = makeProject();
    searchParamsMock.get.mockImplementation((key: string) => (key === "tab" ? "legalizacion" : null));

    render(<ProjectWorkspace projectId="proy-1" />);

    expect(screen.getByTestId("legalizacion-tab")).toBeInTheDocument();
    expect(legalizacionTabSpy).toHaveBeenCalledWith({ projectId: "proy-1" });
    expect(screen.queryByTestId("resumen-tab")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cronograma-tab")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gantt-tab")).not.toBeInTheDocument();
    expect(screen.queryByTestId("indicadores-tab")).not.toBeInTheDocument();
    expect(screen.queryByTestId("financiero-tab")).not.toBeInTheDocument();
  });

  it("does not mount the Legalización tab's content when another tab is active", () => {
    detailQuery.data = makeProject();

    render(<ProjectWorkspace projectId="proy-1" />);

    expect(screen.queryByTestId("legalizacion-tab")).not.toBeInTheDocument();
  });

  it("shows an access-denied message when the detail query 403s", () => {
    detailQuery.isError = true;
    detailQuery.error = new ApiError("No tienes permisos sobre este proyecto.", 403, "FORBIDDEN");

    render(<ProjectWorkspace projectId="proy-1" />);

    expect(screen.getByText("No tienes permisos para ver este proyecto.")).toBeInTheDocument();
    expect(screen.queryByTestId("resumen-tab")).not.toBeInTheDocument();
  });

  it("shows a generic error message for a non-403 error", () => {
    detailQuery.isError = true;
    detailQuery.error = new ApiError("El proyecto no existe.", 404, "NOT_FOUND");

    render(<ProjectWorkspace projectId="proy-1" />);

    expect(screen.getByText("No pudimos cargar el proyecto.")).toBeInTheDocument();
  });
});
