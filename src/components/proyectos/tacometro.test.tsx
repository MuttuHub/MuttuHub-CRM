// Tacómetro (S14 P8): portado del `Tacometro` de
// feat/dashboard-management-csv-export y adaptado a esta rama. SVG en línea con
// viewBox fijo y CERO medición del DOM (D12), sin librería de gráficas. La aguja
// usa el color que devuelve el servidor; las bandas se dibujan desde los límites
// que el llamador ya derivó de los montos del servidor (el cliente no recalcula
// ningún semáforo, D11). La animación de entrada respeta `prefers-reduced-motion`.

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Tacometro } from "./tacometro";

function bandas(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-testid="tacometro-banda"]')].map(
    (b) => `${b.getAttribute("data-desde")}-${b.getAttribute("data-hasta")}:${b.getAttribute("data-color")}`,
  );
}

describe("Tacometro", () => {
  it("renders the empty state when there is no value", () => {
    const { container, getByText } = render(<Tacometro value={null} />);
    expect(getByText("Sin datos disponibles")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders the empty state for a non-finite value", () => {
    const { container } = render(<Tacometro value={Number.NaN} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders a fixed-viewBox svg with an accessible label and the formatted value", () => {
    const { container } = render(<Tacometro value={72.4} color="amarillo" label="Ejecución financiera" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("viewBox", "0 0 200 120");
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "Ejecución financiera: 72,4 %");
    expect(container.querySelector('[data-testid="tacometro-valor"]')?.textContent).toBe("72,4 %");
  });

  it("draws one coloured band per boundary and a neutral track", () => {
    const { container } = render(
      <Tacometro
        value={48.5}
        color="verde"
        bandas={[
          { hasta: 50, color: "verde" },
          { hasta: 55, color: "amarillo" },
          { hasta: 100, color: "rojo" },
        ]}
      />,
    );
    expect(container.querySelector('[data-testid="tacometro-track"]')).toBeInTheDocument();
    expect(bandas(container)).toEqual(["0-50:verde", "50-55:amarillo", "55-100:rojo"]);
  });

  it("draws no coloured band when no boundaries are given (neutral gauge)", () => {
    const { container } = render(<Tacometro value={40} color="verde" />);
    expect(container.querySelector('[data-testid="tacometro-track"]')).toBeInTheDocument();
    expect(bandas(container)).toEqual([]);
  });

  it("clamps degenerate boundaries so the arc is never drawn backwards", () => {
    const { container } = render(
      <Tacometro
        value={40}
        color="verde"
        bandas={[
          { hasta: 120, color: "verde" },
          { hasta: -10, color: "rojo" },
          { hasta: 100, color: "amarillo" },
        ]}
      />,
    );
    expect(bandas(container)).toEqual(["0-100:verde"]);
  });

  it("rotates the needle proportionally to the value (0 -> -90deg, 100 -> 90deg)", () => {
    const needle = (value: number) => {
      const { container } = render(<Tacometro value={value} color="verde" />);
      return container.querySelector('[data-testid="tacometro-aguja"]');
    };
    expect(needle(0)).toHaveAttribute("transform", "rotate(-90 100 100)");
    expect(needle(50)).toHaveAttribute("transform", "rotate(0 100 100)");
    expect(needle(100)).toHaveAttribute("transform", "rotate(90 100 100)");
    expect(needle(48.5)).toHaveAttribute("transform", "rotate(-2.7 100 100)");
  });

  it("paints the needle with the colour the server sent", () => {
    const { container } = render(<Tacometro value={50} color="rojo" />);
    expect(container.querySelector('[data-testid="tacometro-aguja"]')).toHaveAttribute("data-color", "rojo");
  });

  it("clamps out-of-range values to the 0..100 scale", () => {
    const alto = render(<Tacometro value={140} color="verde" />);
    expect(alto.container.querySelector('[data-testid="tacometro-valor"]')?.textContent).toBe("100 %");
    expect(alto.container.querySelector('[data-testid="tacometro-aguja"]')).toHaveAttribute(
      "transform",
      "rotate(90 100 100)",
    );

    const bajo = render(<Tacometro value={-20} color="rojo" />);
    expect(bajo.container.querySelector('[data-testid="tacometro-valor"]')?.textContent).toBe("0 %");
  });

  it("gates the entrance animation behind prefers-reduced-motion: no-preference", () => {
    const { container } = render(<Tacometro value={50} color="verde" />);
    expect(container.querySelector(".tacometro-aguja")).toBeInTheDocument();
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(css).toContain("animation: tacometro-entrar");
  });

  it("does not depend on runtime DOM measurement (no getBoundingClientRect)", () => {
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect");
    render(<Tacometro value={50} color="verde" />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
