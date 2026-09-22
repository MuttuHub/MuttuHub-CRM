// gestion-proyectos-workspace, Phase 2 (design.md T7, T9): client-side
// search/filter over the unpaginated GET /api/v1/projects response. Mirrors
// the mocking convention of project-sheet.test.tsx (mock the hooks module,
// not fetch) since this component only orchestrates hook data + local state.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/hooks/kanban";
import type { ProjectListRow } from "@/hooks/projects";
import { ProjectList } from "./project-list";

const { projectsQuery, currentUserQuery, createMutationMock, routerPushMock } = vi.hoisted(() => ({
  projectsQuery: { data: [] as ProjectListRow[], isLoading: false },
  currentUserQuery: { data: null as CurrentUser | null },
  createMutationMock: vi.fn(() => ({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ proyecto: { id: "proy-99" } }),
  })),
  routerPushMock: vi.fn(),
}));

vi.mock("@/hooks/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/projects")>();
  return {
    ...actual,
    useProjects: () => projectsQuery,
    useCreateProject: createMutationMock,
  };
});

vi.mock("@/hooks/kanban", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/kanban")>();
  return {
    ...actual,
    useCurrentUser: () => currentUserQuery,
  };
});

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>();
  return {
    ...actual,
    useClients: () => ({
      data: { page: 1, limit: 200, total: 1, items: [{ id: "cli-1", nombre: "Alcaldía Demo" }] },
      isLoading: false,
    }),
    useUsers: () => ({ data: [], isLoading: false }),
  };
});

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({ push: routerPushMock }),
  };
});

function makeRow(overrides: Partial<ProjectListRow> = {}): ProjectListRow {
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
    umbrales_override: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectList />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  projectsQuery.data = [];
  projectsQuery.isLoading = false;
  currentUserQuery.data = { id: "u-admin", nombre: "Admin", rol: "ADMINISTRADOR" };
  routerPushMock.mockClear();
  createMutationMock.mockReturnValue({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ proyecto: { id: "proy-99" } }),
  });
});

describe("ProjectList", () => {
  it("renders every project row the hook returns", () => {
    projectsQuery.data = [
      makeRow({ id: "proy-1", codigo: "P-01", nombre: "Proyecto Uno" }),
      makeRow({ id: "proy-2", codigo: "P-02", nombre: "Proyecto Dos" }),
    ];

    renderList();

    expect(screen.getByText("P-01")).toBeInTheDocument();
    expect(screen.getByText("P-02")).toBeInTheDocument();
  });

  it("narrows the list by the search input (client-side, no API params)", async () => {
    projectsQuery.data = [
      makeRow({ id: "proy-1", codigo: "P-01", nombre: "Proyecto Uno" }),
      makeRow({ id: "proy-2", codigo: "P-02", nombre: "Proyecto Dos" }),
    ];
    const user = userEvent.setup();

    renderList();
    await user.type(screen.getByPlaceholderText(/buscar/i), "Dos");

    expect(screen.queryByText("P-01")).not.toBeInTheDocument();
    expect(screen.getByText("P-02")).toBeInTheDocument();
  });

  it("hides write actions on a row when puede_editar_proyecto is false", () => {
    projectsQuery.data = [
      makeRow({ id: "proy-1", codigo: "P-01", puede_editar_proyecto: true }),
      makeRow({ id: "proy-2", codigo: "P-02", puede_editar_proyecto: false }),
    ];

    renderList();

    const rows = screen.getAllByRole("row").slice(1); // drop header row
    const [editableRow, readOnlyRow] = rows;
    expect(editableRow!.querySelector("[data-action='edit']")).not.toBeNull();
    expect(readOnlyRow!.querySelector("[data-action='edit']")).toBeNull();
  });

  it("shows the create button only when the actor can create projects", () => {
    projectsQuery.data = [makeRow()];
    currentUserQuery.data = { id: "u-1", nombre: "Colaborador", rol: "COLABORADOR" };

    renderList();

    expect(screen.queryByRole("button", { name: /nuevo proyecto/i })).not.toBeInTheDocument();
  });

  it("shows the create button for a management role", () => {
    projectsQuery.data = [makeRow()];
    currentUserQuery.data = { id: "u-admin", nombre: "Admin", rol: "ADMINISTRADOR" };

    renderList();

    expect(screen.getByRole("button", { name: /nuevo proyecto/i })).toBeInTheDocument();
  });

  it("opens the create dialog from the Nuevo proyecto button", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: /nuevo proyecto/i }));

    expect(screen.getByRole("heading", { name: /nuevo proyecto/i })).toBeInTheDocument();
  });

  it("redirects to the new project's workspace after a successful create", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ proyecto: { id: "proy-99" } });
    createMutationMock.mockReturnValue({ isPending: false, mutate: vi.fn(), mutateAsync });
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: /nuevo proyecto/i }));
    await user.type(screen.getByLabelText(/código/i), "PRY-2026-099");
    await user.type(screen.getByLabelText(/^nombre/i), "Proyecto de prueba");
    await user.type(screen.getByLabelText(/territorio/i), "Cartagena");
    await user.click(screen.getByRole("combobox", { name: "Cliente" }));
    await user.click(await screen.findByRole("option", { name: "Alcaldía Demo" }));
    await user.click(screen.getByRole("combobox", { name: "Línea estratégica" }));
    await user.click(await screen.findByRole("option", { name: "Social" }));
    await user.type(screen.getByLabelText(/fecha de inicio/i), "2026-02-01");
    await user.type(screen.getByLabelText(/fecha de fin/i), "2026-11-30");

    await user.click(screen.getByRole("button", { name: /^crear proyecto$/i }));

    expect(mutateAsync).toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith("/proyectos/proy-99");
    // Longer timeout: opens a dialog with two Select popups + several typed
    // fields, which comfortably exceeds the 5s default under CPU load.
  }, 20000);
});
