import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/http";
import { CatalogosV2Section } from "./catalogos-v2-section";

const h = vi.hoisted(() => {
  const q = (data: unknown[]) => ({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  return {
    rubros: q([
      { id: "r1", codigo: "R01", nombre: "Logística", activo: true, orden: 1 },
      { id: "r2", codigo: "R02", nombre: "Alimentación", activo: false, orden: 2 },
    ]),
    lineas: q([
      { id: "l1", codigo: "LE01", nombre: "Innovación", activo: true, orden: 1 },
    ]),
    municipios: q([
      {
        id: "m1",
        nombre: "Medellín",
        departamento: "Antioquia",
        codigo_dane: "05001",
        activo: true,
        orden: 1,
      },
    ]),
    update: vi.fn(),
    createLinea: vi.fn(),
    createMunicipio: vi.fn(),
  };
});

vi.mock("@/hooks/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/admin")>();
  return {
    ...actual,
    useAdminRubros: () => h.rubros,
    useAdminLineas: () => h.lineas,
    useAdminMunicipios: () => h.municipios,
    useUpdateCatalogo: () => ({ mutateAsync: h.update, isPending: false }),
    useCreateLinea: () => ({ mutateAsync: h.createLinea, isPending: false }),
    useCreateMunicipio: () => ({ mutateAsync: h.createMunicipio, isPending: false }),
  };
});

function table(name: RegExp) {
  return screen.getByRole("region", { name });
}

describe("CatalogosV2Section", () => {
  beforeEach(() => {
    h.update.mockReset().mockResolvedValue({});
    h.createLinea.mockReset().mockResolvedValue({});
    h.createMunicipio.mockReset().mockResolvedValue({});
  });

  it("renders the three sub-tables with read-only codes and a badge on suspended rows", () => {
    render(<CatalogosV2Section />);

    const rubros = within(table(/rubros/i));
    expect(rubros.getByText("R01")).toBeInTheDocument();
    expect(rubros.getByText("Logística")).toBeInTheDocument();
    expect(rubros.getAllByText("Suspendido")).toHaveLength(1);
    expect(rubros.getByRole("button", { name: /restaurar alimentación/i })).toBeInTheDocument();
    expect(rubros.getByRole("button", { name: /suspender logística/i })).toBeInTheDocument();
    expect(within(table(/líneas estratégicas/i)).getByText("LE01")).toBeInTheDocument();
    expect(within(table(/municipios/i)).getByText("05001")).toBeInTheDocument();
  });

  it("has no add form for rubros but has one for lines and municipios", () => {
    render(<CatalogosV2Section />);

    expect(within(table(/rubros/i)).queryByRole("button", { name: /agregar/i })).toBeNull();
    expect(within(table(/líneas estratégicas/i)).getByRole("button", { name: /agregar/i })).toBeInTheDocument();
    expect(within(table(/municipios/i)).getByRole("button", { name: /agregar/i })).toBeInTheDocument();
  });

  it("suspends and restores through PATCH activo", async () => {
    const user = userEvent.setup();
    render(<CatalogosV2Section />);
    const rubros = within(table(/rubros/i));

    await user.click(rubros.getByRole("button", { name: /suspender logística/i }));
    expect(h.update).toHaveBeenCalledWith({ kind: "rubros", id: "r1", data: { activo: false } });

    await user.click(rubros.getByRole("button", { name: /restaurar alimentación/i }));
    expect(h.update).toHaveBeenCalledWith({ kind: "rubros", id: "r2", data: { activo: true } });
  });

  it("renames a row sending only nombre (never codigo)", async () => {
    const user = userEvent.setup();
    render(<CatalogosV2Section />);
    const lineas = within(table(/líneas estratégicas/i));

    await user.click(lineas.getByRole("button", { name: /renombrar innovación/i }));
    const input = lineas.getByRole("textbox", { name: /nombre de LE01/i });
    await user.clear(input);
    await user.type(input, "Innovación social");
    await user.click(lineas.getByRole("button", { name: /guardar/i }));

    expect(h.update).toHaveBeenCalledWith({
      kind: "strategic-lines",
      id: "l1",
      data: { nombre: "Innovación social" },
    });
  });

  it("creates a line and shows the Spanish conflict message on 409", async () => {
    const user = userEvent.setup();
    h.createLinea.mockRejectedValueOnce(
      new ApiError("Ya existe una línea estratégica con ese código.", 409, "CONFLICT"),
    );
    render(<CatalogosV2Section />);
    const lineas = within(table(/líneas estratégicas/i));

    await user.type(lineas.getByLabelText(/^código/i), "LE09");
    await user.type(lineas.getByLabelText(/^nombre/i), "Nueva");
    await user.click(lineas.getByRole("button", { name: /agregar/i }));

    expect(h.createLinea).toHaveBeenCalledWith({ codigo: "LE09", nombre: "Nueva" });
    expect(await lineas.findByRole("alert")).toHaveTextContent(
      "Ya existe una línea estratégica con ese código.",
    );
  });

  it("validates the 5-digit DANE code before creating a municipio", async () => {
    const user = userEvent.setup();
    render(<CatalogosV2Section />);
    const muni = within(table(/municipios/i));

    await user.type(muni.getByLabelText(/^nombre/i), "Envigado");
    await user.type(muni.getByLabelText(/^departamento/i), "Antioquia");
    await user.type(muni.getByLabelText(/dane/i), "123");
    await user.click(muni.getByRole("button", { name: /agregar/i }));

    expect(h.createMunicipio).not.toHaveBeenCalled();
    expect(muni.getByRole("alert")).toHaveTextContent("El código DANE debe tener 5 dígitos.");

    await user.clear(muni.getByLabelText(/dane/i));
    await user.type(muni.getByLabelText(/dane/i), "05266");
    await user.click(muni.getByRole("button", { name: /agregar/i }));

    expect(h.createMunicipio).toHaveBeenCalledWith({
      nombre: "Envigado",
      departamento: "Antioquia",
      codigo_dane: "05266",
    });
  });
});
