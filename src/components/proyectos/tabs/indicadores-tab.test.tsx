// gestion-proyectos-workspace, Phase 7: Indicadores tab — list with progress
// (valor_actual vs. meta_valor) plus a create/edit dialog. The dialog
// mirrors `ContactoFormDialog`'s conventions in
// `src/components/crm/entity-dialogs.tsx` (reset-on-open via a `formKey`,
// inline `role="alert"` validation, `ConfirmDialog` reuse for delete) — the
// closest existing form pattern in this codebase (`entity-dialogs.tsx` is
// explicitly reused cross-module already: `saved-views.tsx`,
// `document-dialog.tsx`).

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Indicador, Meta } from "@/hooks/projects";
import { IndicadoresTab } from "./indicadores-tab";

const {
  indicatorsQuery,
  goalsQuery,
  createMutation,
  updateMutation,
  deleteMutation,
} = vi.hoisted(() => ({
  indicatorsQuery: { data: [] as Indicador[], isLoading: false },
  goalsQuery: { data: [] as Meta[], isLoading: false },
  createMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) },
  updateMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) },
  deleteMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) },
}));

vi.mock("@/hooks/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/projects")>();
  return {
    ...actual,
    useIndicators: () => indicatorsQuery,
    useGoals: () => goalsQuery,
    useCreateIndicator: () => createMutation,
    useUpdateIndicator: () => updateMutation,
    useDeleteIndicator: () => deleteMutation,
  };
});

function makeIndicador(overrides: Partial<Indicador> = {}): Indicador {
  return {
    id: "ind-1",
    proyecto_id: "proy-1",
    meta_id: null,
    nombre: "Familias capacitadas",
    unidad: "familias",
    meta_valor: 100,
    valor_actual: 40,
    cuenta_beneficiarios: false,
    created_at: "",
    updated_at: "",
    // proyecto-metas-tab (D4): server-derived field, present on every real
    // response; this tab never reads it (its own progress bar predates this
    // change, see indicadores-tab.tsx), the fixture just needs to satisfy
    // the `Indicador` type.
    color_indicador: "amarillo",
    ...overrides,
  };
}

beforeEach(() => {
  indicatorsQuery.data = [];
  indicatorsQuery.isLoading = false;
  goalsQuery.data = [];
  createMutation.mutateAsync.mockClear();
  updateMutation.mutateAsync.mockClear();
  deleteMutation.mutateAsync.mockClear();
});

describe("IndicadoresTab", () => {
  it("shows a loading state while indicadores are being fetched", () => {
    indicatorsQuery.isLoading = true;
    render(<IndicadoresTab projectId="proy-1" />);
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
  });

  it("shows an empty state when the project has no indicadores", () => {
    render(<IndicadoresTab projectId="proy-1" />);
    expect(screen.getByText("Este proyecto no tiene indicadores todavía.")).toBeInTheDocument();
  });

  it("lists each indicador with its nombre, unidad and valor_actual vs. meta_valor", () => {
    indicatorsQuery.data = [makeIndicador()];

    render(<IndicadoresTab projectId="proy-1" />);

    expect(screen.getByText("Familias capacitadas")).toBeInTheDocument();
    expect(screen.getByText(/40/)).toBeInTheDocument();
    expect(screen.getByText(/100 familias/)).toBeInTheDocument();
  });

  it("shows 'Sin medir' when valor_actual is null", () => {
    indicatorsQuery.data = [makeIndicador({ valor_actual: null })];

    render(<IndicadoresTab projectId="proy-1" />);

    expect(screen.getByText(/sin medir/i)).toBeInTheDocument();
  });

  it("opens the create dialog and submits a new indicador", async () => {
    const user = userEvent.setup();
    render(<IndicadoresTab projectId="proy-1" />);

    await user.click(screen.getByRole("button", { name: /nuevo indicador/i }));
    expect(screen.getByRole("heading", { name: "Agregar indicador" })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^nombre/i), "Personas atendidas");
    await user.type(screen.getByLabelText(/^unidad/i), "personas");
    await user.type(screen.getByLabelText(/valor meta/i), "200");

    await user.click(screen.getByRole("button", { name: /^agregar indicador$/i }));

    await waitFor(() => expect(createMutation.mutateAsync).toHaveBeenCalled());
    const payload = createMutation.mutateAsync.mock.calls[0][0];
    expect(payload.nombre).toBe("Personas atendidas");
    expect(payload.unidad).toBe("personas");
    expect(payload.meta_valor).toBe(200);
  });

  it("opens the edit dialog pre-filled and submits an update", async () => {
    indicatorsQuery.data = [makeIndicador()];
    const user = userEvent.setup();
    render(<IndicadoresTab projectId="proy-1" />);

    await user.click(screen.getByRole("button", { name: /editar familias capacitadas/i }));

    const nombreInput = screen.getByLabelText(/nombre/i) as HTMLInputElement;
    expect(nombreInput.value).toBe("Familias capacitadas");

    await user.clear(screen.getByLabelText(/valor actual/i));
    await user.type(screen.getByLabelText(/valor actual/i), "55");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => expect(updateMutation.mutateAsync).toHaveBeenCalled());
    expect(updateMutation.mutateAsync.mock.calls[0][0].valor_actual).toBe(55);
  });

  it("keeps enough gap between action buttons to prevent tap overlap on the destructive action", () => {
    // jsdom does not compute real layout or `::after` pseudo-element hit-areas, so
    // this asserts the Tailwind gap class directly: each icon-sm button expands its
    // tap target 8px per side via `after:-inset-2` (see button.tsx), so the buttons'
    // visual gap must be >= 16px (gap-4) or their expanded hit-areas overlap near
    // the destructive "Eliminar" button.
    indicatorsQuery.data = [makeIndicador()];
    render(<IndicadoresTab projectId="proy-1" />);

    const editButton = screen.getByRole("button", { name: /editar familias capacitadas/i });
    const actionsContainer = editButton.parentElement;

    expect(actionsContainer).not.toHaveClass("gap-1");
    expect(actionsContainer).toHaveClass("gap-4");
  });

  it("deletes an indicador after confirming", async () => {
    indicatorsQuery.data = [makeIndicador()];
    const user = userEvent.setup();
    render(<IndicadoresTab projectId="proy-1" />);

    await user.click(screen.getByRole("button", { name: /eliminar familias capacitadas/i }));
    await user.click(screen.getByRole("button", { name: /^eliminar$/i }));

    await waitFor(() => expect(deleteMutation.mutateAsync).toHaveBeenCalledWith("ind-1"));
  });
});
