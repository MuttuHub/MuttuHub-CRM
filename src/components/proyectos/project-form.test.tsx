// gestion-proyectos-workspace, Phase 3 (design.md file changes: project-form.tsx,
// spec.md "Creación y edición de Proyecto"): create/edit dialog over
// useCreateProject/useUpdateProject. Mocks the hooks module (not fetch), same
// convention as project-list.test.tsx / entity-dialogs.test.tsx.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectDetail } from "@/hooks/projects";
import { ProjectFormDialog } from "./project-form";

const { createMutationMock, updateMutationMock } = vi.hoisted(() => ({
  createMutationMock: vi.fn(() => ({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ proyecto: { id: "proy-99" } }),
  })),
  updateMutationMock: vi.fn(() => ({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ proyecto: { id: "proy-1" } }),
  })),
}));

vi.mock("@/hooks/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/projects")>();
  return {
    ...actual,
    useCreateProject: createMutationMock,
    useUpdateProject: updateMutationMock,
  };
});

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>();
  return {
    ...actual,
    useClients: () => ({
      data: {
        page: 1,
        limit: 200,
        total: 1,
        items: [{ id: "cli-1", nombre: "Alcaldía Demo" }],
      },
      isLoading: false,
    }),
    useUsers: () => ({
      data: [{ id: "u-1", nombre: "Ana Pérez" }],
      isLoading: false,
    }),
  };
});

const BASE_PROJECT: ProjectDetail = {
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
};

function renderDialog(props: Partial<{ project: ProjectDetail | null; onCreated: (id: string) => void }> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <ProjectFormDialog open onOpenChange={onOpenChange} {...props} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

async function fillRequiredCreateFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/código/i), "PRY-2026-099");
  await user.type(screen.getByLabelText(/^nombre/i), "Proyecto de prueba");
  await user.type(screen.getByLabelText(/territorio/i), "Cartagena");

  await user.click(screen.getByRole("combobox", { name: "Cliente" }));
  await user.click(await screen.findByRole("option", { name: "Alcaldía Demo" }));

  await user.click(screen.getByRole("combobox", { name: "Línea estratégica" }));
  await user.click(await screen.findByRole("option", { name: "Social" }));

  const fechaInicio = screen.getByLabelText(/fecha de inicio/i);
  const fechaFin = screen.getByLabelText(/fecha de fin/i);
  await user.type(fechaInicio, "2026-02-01");
  await user.type(fechaFin, "2026-11-30");
}

beforeEach(() => {
  createMutationMock.mockReturnValue({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ proyecto: { id: "proy-99" } }),
  });
  updateMutationMock.mockReturnValue({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ proyecto: { id: "proy-1" } }),
  });
});

describe("ProjectFormDialog — create mode", () => {
  it("blocks submit and shows an error when required fields are missing", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: /crear proyecto/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/obligatorio/i);
    expect(createMutationMock().mutateAsync).not.toHaveBeenCalled();
  });

  it("rejects a fecha_fin earlier than fecha_inicio", async () => {
    // Longer timeout: this exercises two Select popups + several typed
    // fields, which comfortably exceeds the 5s default under CPU load (e.g.
    // running alongside the rest of the suite).
    const user = userEvent.setup();
    renderDialog();
    await fillRequiredCreateFields(user);

    await user.clear(screen.getByLabelText(/fecha de fin/i));
    await user.type(screen.getByLabelText(/fecha de fin/i), "2026-01-01");
    await user.click(screen.getByRole("button", { name: /crear proyecto/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/posterior/i);
  }, 20000);

  it("creates the project on a valid submit and reports the new id", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ proyecto: { id: "proy-99" } });
    createMutationMock.mockReturnValue({ isPending: false, mutate: vi.fn(), mutateAsync });
    const user = userEvent.setup();
    const onCreated = vi.fn();
    renderDialog({ onCreated });

    await fillRequiredCreateFields(user);
    await user.click(screen.getByRole("button", { name: /crear proyecto/i }));

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        codigo: "PRY-2026-099",
        nombre: "Proyecto de prueba",
        cliente_id: "cli-1",
        territorio: "Cartagena",
        linea_estrategica: "SOCIAL",
        fecha_inicio: "2026-02-01",
        fecha_fin: "2026-11-30",
      }),
    );
    expect(onCreated).toHaveBeenCalledWith("proy-99");
  }, 20000);

  it("disables the submit button while the create mutation is pending", () => {
    createMutationMock.mockReturnValue({ isPending: true, mutate: vi.fn(), mutateAsync: vi.fn() });
    renderDialog();

    expect(screen.getByRole("button", { name: /guardando/i })).toBeDisabled();
  });
});

describe("ProjectFormDialog — edit mode", () => {
  it("shows the client read-only instead of a picker", () => {
    renderDialog({ project: BASE_PROJECT });

    expect(screen.getByText("Alcaldía Demo")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Cliente" })).not.toBeInTheDocument();
  });

  it("renders oportunidad_id read-only and never includes it in the update payload", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ proyecto: { id: "proy-1" } });
    updateMutationMock.mockReturnValue({ isPending: false, mutate: vi.fn(), mutateAsync });
    const user = userEvent.setup();
    renderDialog({ project: { ...BASE_PROJECT, oportunidad_id: "op-1" } });

    expect(screen.getByText(/conversión de una oportunidad/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(mutateAsync).toHaveBeenCalled();
    const payload = mutateAsync.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("oportunidad_id");
    expect(payload).not.toHaveProperty("cliente_id");
  });

  it("calls useUpdateProject on a valid submit", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ proyecto: { id: "proy-1" } });
    updateMutationMock.mockReturnValue({ isPending: false, mutate: vi.fn(), mutateAsync });
    const user = userEvent.setup();
    renderDialog({ project: BASE_PROJECT });

    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        codigo: "P-01",
        nombre: "Fortalecimiento Comunitario",
        territorio: "Bogotá",
        linea_estrategica: "SOCIAL",
      }),
    );
  });
});
