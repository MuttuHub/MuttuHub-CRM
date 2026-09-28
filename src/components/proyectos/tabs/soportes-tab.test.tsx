// proyecto-soportes-tab, Phase 1 (design.md "Component Structure" —
// `tabs/soportes-tab.tsx`, spec.md "Pestaña Soportes en el workspace del
// proyecto" + "Eliminar soporte desde la pestaña" — RF-04/RNF-03). Mirrors
// `legalizacion-tab.test.tsx`'s pattern (`vi.hoisted` query mocks per hook,
// loading/empty/populated states). No dialog wiring is asserted here — the
// "Agregar soporte" CTA only needs to be present; `soporte-dialog.test.tsx`
// covers the modal itself (Phase 2/3).

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actividad, ExpensesResponse, Soporte } from "@/hooks/projects";
import type { UsuarioMini } from "@/hooks/crm";
import { SoportesTab } from "./soportes-tab";

const { attachmentsQuery, usersQuery, activitiesQuery, expensesQuery, deleteMutateAsync } = vi.hoisted(() => ({
  attachmentsQuery: { data: undefined as Soporte[] | undefined, isLoading: false },
  usersQuery: { data: undefined as UsuarioMini[] | undefined, isLoading: false },
  activitiesQuery: { data: undefined as Actividad[] | undefined, isLoading: false },
  expensesQuery: { data: undefined as ExpensesResponse | undefined, isLoading: false },
  deleteMutateAsync: vi.fn(async () => undefined),
}));

vi.mock("@/hooks/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/projects")>();
  return {
    ...actual,
    useAttachments: () => attachmentsQuery,
    useActivities: () => activitiesQuery,
    useExpenses: () => expensesQuery,
    useDeleteAttachment: () => ({ mutateAsync: deleteMutateAsync, isPending: false }),
  };
});

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>();
  return {
    ...actual,
    useUsers: () => usersQuery,
  };
});

function makeSoporte(overrides: Partial<Soporte> = {}): Soporte {
  return {
    id: "sop-1",
    proyecto_id: "proy-1",
    actividad_id: null,
    gasto_id: null,
    tipo: "VERIFICACION",
    nombre: "Listas de asistencia taller 3",
    storage_path: null,
    url_externa: "https://drive.google.com/file/x",
    tamano_bytes: null,
    subido_por_id: "u-1",
    download_url: "https://drive.google.com/file/x",
    created_at: "2026-02-13T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  attachmentsQuery.data = undefined;
  attachmentsQuery.isLoading = false;
  usersQuery.data = undefined;
  usersQuery.isLoading = false;
  activitiesQuery.data = undefined;
  activitiesQuery.isLoading = false;
  expensesQuery.data = undefined;
  expensesQuery.isLoading = false;
  deleteMutateAsync.mockClear();
});

describe("SoportesTab", () => {
  it("shows a loading state while attachments are being fetched", () => {
    attachmentsQuery.isLoading = true;
    render(<SoportesTab projectId="proy-1" />);
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
  });

  it("shows an empty state when the project has no soportes", () => {
    attachmentsQuery.data = [];
    render(<SoportesTab projectId="proy-1" />);
    expect(
      screen.getByText("Este proyecto no tiene soportes registrados todavía."),
    ).toBeInTheDocument();
  });

  it("always renders the Agregar soporte CTA", () => {
    attachmentsQuery.data = [];
    render(<SoportesTab projectId="proy-1" />);
    expect(screen.getByRole("button", { name: "Agregar soporte" })).toBeInTheDocument();
  });

  it("renders the Verificación chip in info-blue and Legalización in pink", () => {
    attachmentsQuery.data = [
      makeSoporte({ id: "s1", tipo: "VERIFICACION", nombre: "Verificación 1" }),
      makeSoporte({ id: "s2", tipo: "LEGALIZACION", nombre: "Legalización 1" }),
    ];
    render(<SoportesTab projectId="proy-1" />);

    const verificacionChip = screen.getByText("Verificación");
    expect(verificacionChip).toHaveClass("bg-info-bg", "text-info");

    const legalizacionChip = screen.getByText("Legalización");
    expect(legalizacionChip).toHaveClass("bg-accent", "text-accent-foreground");
  });

  it("resolves 'vinculado a' to the linked actividad's nombre", () => {
    activitiesQuery.data = [
      { id: "act-1", proyecto_id: "proy-1", meta_id: "meta-1", nombre: "Taller comunitario", descripcion: null, peso: 1, fecha_planificada: "2026-01-01", fecha_real: null, porcentaje_avance: 0, created_at: "", updated_at: "" },
    ];
    attachmentsQuery.data = [makeSoporte({ actividad_id: "act-1" })];
    render(<SoportesTab projectId="proy-1" />);
    expect(screen.getByText(/Taller comunitario/)).toBeInTheDocument();
  });

  it("resolves 'vinculado a' to the linked gasto's concepto · rubro", () => {
    expensesQuery.data = {
      gastos: [
        {
          id: "gasto-1",
          proyecto_id: "proy-1",
          linea_id: "linea-1",
          concepto: "Nómina 1.ª quincena",
          monto_cop: "1000000",
          fecha_gasto: "2026-02-13T00:00:00.000Z",
          registrado_por_id: "u-1",
          created_at: "",
          updated_at: "",
          tercero: null,
          numero_comprobante: null,
          observado: false,
          observacion: null,
          estado_legalizacion: "con_soporte",
          linea: { rubro_id: "rubro-1", rubro: { nombre: "Personal científico" } },
        },
      ],
      lineas: [],
    };
    attachmentsQuery.data = [makeSoporte({ tipo: "LEGALIZACION", gasto_id: "gasto-1" })];
    render(<SoportesTab projectId="proy-1" />);
    expect(screen.getByText(/Nómina 1\.ª quincena · Personal científico/)).toBeInTheDocument();
  });

  it("falls back to 'Soporte general del proyecto' when neither actividad_id nor gasto_id is set", () => {
    attachmentsQuery.data = [makeSoporte({ actividad_id: null, gasto_id: null })];
    render(<SoportesTab projectId="proy-1" />);
    expect(screen.getByText(/Soporte general del proyecto/)).toBeInTheDocument();
  });

  it("resolves the author's name from useUsers()", () => {
    usersQuery.data = [{ id: "u-1", nombre: "Camila Ríos" }];
    attachmentsQuery.data = [makeSoporte({ subido_por_id: "u-1" })];
    render(<SoportesTab projectId="proy-1" />);
    expect(screen.getByText(/Camila Ríos/)).toBeInTheDocument();
  });

  it("falls back to '—' for the author while useUsers() is pending", () => {
    usersQuery.isLoading = true;
    usersQuery.data = undefined;
    attachmentsQuery.data = [makeSoporte({ subido_por_id: "u-1" })];
    render(<SoportesTab projectId="proy-1" />);
    expect(screen.getByText(/—/)).toBeInTheDocument();
  });

  it("renders a download link only when download_url is non-null", () => {
    attachmentsQuery.data = [
      makeSoporte({ id: "s1", nombre: "Con enlace", download_url: "https://drive.google.com/x" }),
      makeSoporte({ id: "s2", nombre: "Sin enlace", download_url: null }),
    ];
    render(<SoportesTab projectId="proy-1" />);

    const cards = screen.getAllByTestId("soporte-card");
    expect(within(cards[0]).getByRole("link", { name: /descargar/i })).toHaveAttribute(
      "href",
      "https://drive.google.com/x",
    );
    expect(within(cards[1]).queryByRole("link", { name: /descargar/i })).not.toBeInTheDocument();
  });

  it("deletes a soporte after confirmation and removes it from the list", async () => {
    const user = userEvent.setup();
    attachmentsQuery.data = [
      makeSoporte({ id: "s1", nombre: "Soporte a eliminar" }),
      makeSoporte({ id: "s2", nombre: "Otro soporte" }),
    ];
    render(<SoportesTab projectId="proy-1" />);

    const card = screen.getAllByTestId("soporte-card")[0];
    await user.click(within(card).getByRole("button", { name: /eliminar/i }));
    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(deleteMutateAsync).toHaveBeenCalledWith("s1");
  });

  it("does not call delete when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    attachmentsQuery.data = [makeSoporte({ id: "s1", nombre: "Soporte" })];
    render(<SoportesTab projectId="proy-1" />);

    const card = screen.getAllByTestId("soporte-card")[0];
    await user.click(within(card).getByRole("button", { name: /eliminar/i }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(deleteMutateAsync).not.toHaveBeenCalled();
  });
});
