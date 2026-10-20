import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampoMunicipios } from "./campos-proyecto";

const MUNICIPIOS = [
  { id: "m1", nombre: "Medellín", departamento: "Antioquia" },
  { id: "m2", nombre: "Cali", departamento: "Valle del Cauca" },
  { id: "m3", nombre: "Bogotá, D.C.", departamento: "Bogotá, D.C." },
];

// Production shipped with an empty `municipios` catalog, so the fieldset had no options and no
// explanation: nobody could create a project. It now guards the empty case and searches the full
// Colombian catalog (1122 rows) instead of rendering one checkbox per municipality.
describe("CampoMunicipios", () => {
  it("explains an empty catalog instead of rendering a dead fieldset", () => {
    render(<CampoMunicipios municipios={[]} municipioIds={[]} onToggle={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/No hay municipios activos/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/Administración → Catálogos/i);
  });

  it("selects a municipality after choosing its department", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<CampoMunicipios municipios={MUNICIPIOS} municipioIds={[]} onToggle={onToggle} />);

    await user.click(screen.getByRole("combobox", { name: "Departamento" }));
    await user.click(await screen.findByRole("option", { name: "Antioquia" }));
    await user.click(screen.getByRole("combobox", { name: "Municipio" }));
    await user.click(await screen.findByRole("option", { name: "Medellín" }));

    expect(onToggle).toHaveBeenCalledWith("m1", true);
  });

  it("offers only the municipalities of the chosen department", async () => {
    const user = userEvent.setup();
    render(<CampoMunicipios municipios={MUNICIPIOS} municipioIds={[]} onToggle={vi.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Departamento" }));
    await user.click(await screen.findByRole("option", { name: "Antioquia" }));
    await user.click(screen.getByRole("combobox", { name: "Municipio" }));

    expect(await screen.findByRole("option", { name: "Medellín" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Cali" })).not.toBeInTheDocument();
  });

  it("lists the selection as removable chips", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<CampoMunicipios municipios={MUNICIPIOS} municipioIds={["m1"]} onToggle={onToggle} />);

    await user.click(screen.getByRole("button", { name: "Quitar Medellín" }));

    expect(onToggle).toHaveBeenCalledWith("m1", false);
  });

});
