// v7 alignment, unit C7b: the "Seguimiento automático" section. These tests pin
// the four behaviours the admin-only settings form owes: (1) it renders the
// stored `Automatizaciones` values (resumen diario, ventana de días y las tres
// categorías), (2) an ADMINISTRADOR can change them and save a PARTIAL payload
// (only the fields that actually changed), (3) any other role sees the same
// values read-only — controls disabled, no save action, an explicit note — and
// (4) loading / error states stay consistent with the sibling sections. The
// `GET/PUT /api/v1/settings/automatizaciones` hooks are mocked; C7a owns the
// contract, C7b only reads and writes through them.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Automatizaciones } from "@/hooks/crm";
import { AutomatizacionesVista } from "./automatizaciones-vista";

const { useAutomatizacionesMock, useUpdateAutomatizacionesMock, mutateAsyncMock, useCurrentUserMock } =
  vi.hoisted(() => {
    const mutateAsyncMock = vi.fn();
    return {
      useAutomatizacionesMock: vi.fn(),
      useUpdateAutomatizacionesMock: vi.fn(() => ({ mutateAsync: mutateAsyncMock, isPending: false })),
      mutateAsyncMock,
      useCurrentUserMock: vi.fn(),
    };
  });

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>();
  return {
    ...actual,
    useAutomatizaciones: useAutomatizacionesMock,
    useUpdateAutomatizaciones: useUpdateAutomatizacionesMock,
  };
});

vi.mock("@/hooks/kanban", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/kanban")>();
  return { ...actual, useCurrentUser: useCurrentUserMock };
});

const STORED: Automatizaciones = {
  resumen_diario: true,
  dias_por_vencer: 5,
  categorias: { vencidos: true, hoy: false, proximos: true },
};

const ADMIN = { id: "u-1", nombre: "Ana Pérez", rol: "ADMINISTRADOR" as const };
const COORDINADOR = { id: "u-2", nombre: "Carla Ruiz", rol: "COORDINADOR" as const };

beforeEach(() => {
  useAutomatizacionesMock.mockReset();
  useAutomatizacionesMock.mockReturnValue({ data: STORED, isLoading: false, isError: false });
  mutateAsyncMock.mockReset();
  mutateAsyncMock.mockResolvedValue({ automatizaciones: STORED });
  useUpdateAutomatizacionesMock.mockClear();
  useUpdateAutomatizacionesMock.mockReturnValue({ mutateAsync: mutateAsyncMock, isPending: false });
  useCurrentUserMock.mockReset();
  useCurrentUserMock.mockReturnValue({ data: ADMIN });
});

function renderVista() {
  return render(<AutomatizacionesVista />);
}

describe("AutomatizacionesVista — valores guardados", () => {
  it("renders the stored resumen diario, ventana de días y categorías", () => {
    renderVista();

    expect(screen.getByRole("switch", { name: "Resumen diario" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    const dias = screen.getByRole("spinbutton", { name: "Días por vencer" });
    expect(dias).toHaveValue(5);
    expect(dias).toHaveAttribute("min", "1");
    expect(dias).toHaveAttribute("max", "30");

    expect(screen.getByRole("switch", { name: "Vencidos" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Hoy" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Próximos" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("AutomatizacionesVista — administrador", () => {
  it("saves only the changed fields as a partial payload", async () => {
    const user = userEvent.setup();
    renderVista();

    await user.click(screen.getByRole("switch", { name: "Resumen diario" }));

    const dias = screen.getByRole("spinbutton", { name: "Días por vencer" });
    await user.clear(dias);
    await user.type(dias, "7");

    await user.click(screen.getByRole("switch", { name: "Hoy" }));

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      resumen_diario: false,
      dias_por_vencer: 7,
      categorias: { hoy: true },
    });
  });

  it("blocks an out-of-range ventana de días without writing", async () => {
    const user = userEvent.setup();
    renderVista();

    const dias = screen.getByRole("spinbutton", { name: "Días por vencer" });
    await user.clear(dias);
    await user.type(dias, "0");

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(mutateAsyncMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/entre 1 y 30/i);
  });

  it("shows a success confirmation after saving", async () => {
    const user = userEvent.setup();
    renderVista();

    await user.click(screen.getByRole("switch", { name: "Resumen diario" }));
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText(/cambios guardados/i)).toBeInTheDocument();
  });
});

describe("AutomatizacionesVista — solo lectura para el resto de roles", () => {
  it("disables the controls, hides the save action and explains why", () => {
    useCurrentUserMock.mockReturnValue({ data: COORDINADOR });
    renderVista();

    expect(screen.getByRole("switch", { name: "Resumen diario" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Días por vencer" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Vencidos" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Hoy" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Próximos" })).toBeDisabled();

    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/solo un administrador/i)).toBeInTheDocument();
  });
});

describe("AutomatizacionesVista — estados", () => {
  it("announces loading with a status region", () => {
    useAutomatizacionesMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderVista();

    expect(screen.getByRole("status", { name: "Cargando automatizaciones" })).toBeInTheDocument();
  });

  it("shows an alert when the settings fail to load", () => {
    useAutomatizacionesMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderVista();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos cargar las automatizaciones. Inténtalo de nuevo.",
    );
  });
});
