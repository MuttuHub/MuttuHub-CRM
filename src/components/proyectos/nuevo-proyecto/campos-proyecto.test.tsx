import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CampoMunicipios } from "./campos-proyecto";

// Production had an empty `municipios` catalog, so the creation step rendered a
// dead fieldset with no options and no explanation: the project could not be
// created and nothing said why. The empty state now names the cause and where
// to fix it.
describe("CampoMunicipios", () => {
  it("explains an empty catalog instead of rendering a dead fieldset", () => {
    render(<CampoMunicipios municipios={[]} municipioIds={[]} onToggle={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/No hay municipios activos/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/Administración → Catálogos/i);
  });

  it("renders one checkbox per active municipio", () => {
    render(
      <CampoMunicipios
        municipios={[
          { id: "m1", nombre: "Medellín" },
          { id: "m2", nombre: "Cali" },
        ]}
        municipioIds={["m1"]}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Municipio Medellín" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Municipio Cali" })).not.toBeChecked();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
