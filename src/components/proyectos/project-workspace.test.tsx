// gestion-proyectos-workspace, Phase 4 (design.md T1, T6 — spec.md "Workspace
// por proyecto con tabs" + "Tab Resumen reutiliza el endpoint agregado").
// Only the Resumen tab is wired this PR; Cronograma/Gantt/Indicadores are
// disabled stubs (design's own incremental-tab-rollout guidance) until
// Phases 5-7.

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

  it("renders Cronograma/Gantt/Indicadores as disabled stub tabs", () => {
    detailQuery.data = makeProject();

    render(<ProjectWorkspace projectId="proy-1" />);

    expect(screen.getByRole("tab", { name: "Cronograma" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("tab", { name: "Gantt" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("tab", { name: "Indicadores" })).toHaveAttribute("aria-disabled", "true");
  });

  it("respects a ?tab= stub value from the URL even though its trigger is disabled", () => {
    detailQuery.data = makeProject();
    searchParamsMock.get.mockImplementation((key: string) => (key === "tab" ? "cronograma" : null));

    render(<ProjectWorkspace projectId="proy-1" />);

    expect(screen.getByText("Próximamente.")).toBeInTheDocument();
    expect(screen.queryByTestId("resumen-tab")).not.toBeInTheDocument();
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
