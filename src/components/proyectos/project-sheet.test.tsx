// tablero-seguimiento-social, Fase 3b.4: ficha de proyecto (General /
// Cronograma / Soportes). NOTE (TDD deviation, declared honestly): this
// component's production code was authored before this test file — see
// Deviations in apply-progress. The tests below are still real behavioral
// assertions against the actual rendered output, not retrofitted smoke
// tests, and they pin down real regressions (e.g. XOR toggle, permission
// gating on soportes) going forward.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actividad, Meta, ProjectDetail, Soporte } from "@/hooks/projects";
import { ProjectSheet } from "./project-sheet";

const { detailQuery, goalsQuery, activitiesQuery, attachmentsQuery, uploadMutation, deleteMutation } =
  vi.hoisted(() => ({
    detailQuery: { data: null as ProjectDetail | null, isError: false },
    goalsQuery: { data: [] as Meta[], isLoading: false },
    activitiesQuery: { data: [] as Actividad[], isLoading: false },
    attachmentsQuery: { data: [] as Soporte[], isLoading: false },
    uploadMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) },
    deleteMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) },
  }));

vi.mock("@/hooks/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/projects")>();
  return {
    ...actual,
    useProjectDetail: () => detailQuery,
    useGoals: () => goalsQuery,
    useActivities: () => activitiesQuery,
    useAttachments: () => attachmentsQuery,
    useUploadAttachment: () => uploadMutation,
    useDeleteAttachment: () => deleteMutation,
  };
});

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

function renderSheet() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectSheet projectId="proy-1" onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  detailQuery.data = null;
  detailQuery.isError = false;
  goalsQuery.data = [];
  activitiesQuery.data = [];
  attachmentsQuery.data = [];
  uploadMutation.mutateAsync.mockClear();
  deleteMutation.mutateAsync.mockClear();
});

describe("ProjectSheet — General tab", () => {
  it("renders the project's real fields (código, cliente, responsable)", () => {
    detailQuery.data = makeProject();
    renderSheet();

    expect(screen.getByText("P-01")).toBeInTheDocument();
    expect(screen.getByText("Alcaldía Demo")).toBeInTheDocument();
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("Social")).toBeInTheDocument();
  });
});

describe("ProjectSheet — Cronograma tab", () => {
  it("shows línea base (fecha_planificada) and real (fecha_real) for each actividad", async () => {
    detailQuery.data = makeProject();
    goalsQuery.data = [
      { id: "meta-1", proyecto_id: "proy-1", nombre: "Meta Uno", descripcion: null, created_at: "", updated_at: "" },
    ];
    activitiesQuery.data = [
      {
        id: "act-1",
        proyecto_id: "proy-1",
        meta_id: "meta-1",
        nombre: "Taller comunitario",
        descripcion: null,
        peso: 1,
        fecha_planificada: "2026-03-01T00:00:00.000Z",
        fecha_real: null,
        porcentaje_avance: 40,
        created_at: "",
        updated_at: "",
      },
    ];
    renderSheet();
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Cronograma" }));

    await waitFor(() => expect(screen.getByText("Taller comunitario")).toBeInTheDocument());
    expect(screen.getByText("Meta: Meta Uno")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText(/Real: —/)).toBeInTheDocument();
  });
});

describe("ProjectSheet — Soportes tab", () => {
  it("lists existing soportes and shows the upload form for a puede_editar_proyecto=true user", async () => {
    detailQuery.data = makeProject({ puede_editar_proyecto: true });
    attachmentsQuery.data = [
      {
        id: "sop-1",
        proyecto_id: "proy-1",
        actividad_id: null,
        gasto_id: null,
        tipo: "VERIFICACION",
        nombre: "Evidencia.pdf",
        storage_path: "proyectos/proy-1/soportes/sop-1_Evidencia.pdf",
        url_externa: null,
        tamano_bytes: 1024,
        download_url: "https://signed.example/file",
        created_at: "",
      },
    ];
    renderSheet();
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Soportes" }));

    await waitFor(() => expect(screen.getByText("Evidencia.pdf")).toBeInTheDocument());
    expect(screen.getByLabelText("Descargar Evidencia.pdf")).toBeInTheDocument();
    expect(screen.getByLabelText("Eliminar Evidencia.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Guardar soporte/ })).toBeInTheDocument();
  });

  it("hides the upload form and delete buttons for a puede_editar_proyecto=false viewer (RNF-03)", async () => {
    detailQuery.data = makeProject({ puede_editar_proyecto: false });
    attachmentsQuery.data = [
      {
        id: "sop-1",
        proyecto_id: "proy-1",
        actividad_id: null,
        gasto_id: null,
        tipo: "VERIFICACION",
        nombre: "Evidencia.pdf",
        storage_path: null,
        url_externa: "https://drive.example/x",
        tamano_bytes: null,
        download_url: "https://drive.example/x",
        created_at: "",
      },
    ];
    renderSheet();
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Soportes" }));

    await waitFor(() => expect(screen.getByText("Evidencia.pdf")).toBeInTheDocument());
    expect(screen.queryByLabelText("Eliminar Evidencia.pdf")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Guardar soporte/ })).not.toBeInTheDocument();
  });

  it("toggling to 'Enlace' swaps the file input for a URL input (D8 XOR)", async () => {
    detailQuery.data = makeProject({ puede_editar_proyecto: true });
    renderSheet();
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Soportes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Guardar soporte/ })).toBeInTheDocument());
    expect(screen.getByLabelText("Archivo del soporte")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Enlace \(https/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Enlace" }));

    expect(screen.queryByLabelText("Archivo del soporte")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Enlace \(https/)).toBeInTheDocument();
  });

  it("submits the upload mutation with nombre/tipo/url when creating a link soporte", async () => {
    detailQuery.data = makeProject({ puede_editar_proyecto: true });
    renderSheet();
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Soportes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Guardar soporte/ })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Enlace" }));
    await user.type(screen.getByLabelText("Nombre"), "Acta");
    await user.type(screen.getByLabelText(/Enlace \(https/), "https://drive.example/carpeta");
    await user.click(screen.getByRole("button", { name: /Guardar soporte/ }));

    await waitFor(() =>
      expect(uploadMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          nombre: "Acta",
          tipo: "VERIFICACION",
          url: "https://drive.example/carpeta",
        }),
      ),
    );
  });

  it("clicking eliminar calls the delete mutation with the soporte id", async () => {
    detailQuery.data = makeProject({ puede_editar_proyecto: true });
    attachmentsQuery.data = [
      {
        id: "sop-1",
        proyecto_id: "proy-1",
        actividad_id: null,
        gasto_id: null,
        tipo: "VERIFICACION",
        nombre: "Evidencia.pdf",
        storage_path: null,
        url_externa: "https://drive.example/x",
        tamano_bytes: null,
        download_url: "https://drive.example/x",
        created_at: "",
      },
    ];
    renderSheet();
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Soportes" }));
    await waitFor(() => expect(screen.getByLabelText("Eliminar Evidencia.pdf")).toBeInTheDocument());
    await user.click(screen.getByLabelText("Eliminar Evidencia.pdf"));

    expect(deleteMutation.mutateAsync).toHaveBeenCalledWith("sop-1");
  });
});
