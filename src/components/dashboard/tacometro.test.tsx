// tablero-seguimiento-social, Fase 4c (4c.1 RED, design.md D7): `Tacometro`
// is a pure SVG primitive (fixed viewBox, no DOM measurement) that renders the
// "Avance Técnico (%)" KPI. The three threshold bands are DERIVED from the
// resolved `umbrales.tecnico` (never inlined as constants) and the needle is a
// `line` rotated by `transform`.
//
// Ubicación: `src/components/dashboard/tacometro.tsx` — NO en
// `charts/` como decía tasks.md 4c.2. El patrón real ya establecido del módulo
// es `curve-s-chart.tsx` en `src/components/dashboard/` (mismo directorio que
// `sparkline.tsx`/`shared.tsx`), así que la consistencia con lo implementado
// manda sobre la ruta literal de tasks.md. Ver el comentario de cabecera de
// `tacometro.tsx`.

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UMBRALES_SEMAFORO_DEFAULT } from "@/lib/catalogs";
import { Tacometro } from "./tacometro";

/** Mismo redondeo que el componente: los umbrales ratio (0.6) no deben
 * arrastrar el ruido binario de `0.6 * 100 = 60.00000000000001`. */
const pct = (ratio: number) => Math.round(ratio * 1000) / 10;

function bandRanges(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-testid="tacometro-banda"]')].map(
    (b) => `${b.getAttribute("data-desde")}-${b.getAttribute("data-hasta")}`,
  );
}

describe("Tacometro", () => {
  it("renders the empty state when there is no value", () => {
    const { container, getByText } = render(<Tacometro value={null} />);
    expect(getByText("Sin datos disponibles")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders a fixed viewBox svg with an accessible label and the rounded value", () => {
    const { container } = render(<Tacometro value={72.4} color="amarillo" label="Avance técnico" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("viewBox", "0 0 200 120");
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "Avance técnico: 72%");
    expect(container.querySelector('[data-testid="tacometro-valor"]')?.textContent).toBe("72%");
  });

  it("draws exactly three threshold bands", () => {
    const { container } = render(<Tacometro value={50} color="rojo" />);
    expect(container.querySelectorAll('[data-testid="tacometro-banda"]')).toHaveLength(3);
  });

  it("derives the band boundaries from the umbrales parameter, not constants", () => {
    const { container } = render(
      <Tacometro value={50} color="amarillo" umbrales={{ verde: 0.9, rojo: 0.5 }} />,
    );
    expect(bandRanges(container)).toEqual(["0-50", "50-90", "90-100"]);
  });

  it("falls back to the factory umbrales when none are passed", () => {
    const { container } = render(<Tacometro value={50} color="amarillo" />);
    const rojo = pct(UMBRALES_SEMAFORO_DEFAULT.tecnico.rojo);
    const verde = pct(UMBRALES_SEMAFORO_DEFAULT.tecnico.verde);
    expect(bandRanges(container)).toEqual([`0-${rojo}`, `${rojo}-${verde}`, `${verde}-100`]);
  });

  it("rotates the needle proportionally to the value (0 -> -90deg, 100 -> 90deg)", () => {
    const needle = (value: number) => {
      const { container } = render(<Tacometro value={value} color="verde" />);
      return container.querySelector('[data-testid="tacometro-aguja"]');
    };
    expect(needle(0)).toHaveAttribute("transform", "rotate(-90 100 100)");
    expect(needle(50)).toHaveAttribute("transform", "rotate(0 100 100)");
    expect(needle(100)).toHaveAttribute("transform", "rotate(90 100 100)");
    expect(needle(72.4)).toHaveAttribute("transform", "rotate(40.3 100 100)");
  });

  it("clamps out-of-range values to the 0..100 scale", () => {
    const alto = render(<Tacometro value={140} color="verde" />);
    expect(alto.container.querySelector('[data-testid="tacometro-valor"]')?.textContent).toBe("100%");
    expect(alto.container.querySelector('[data-testid="tacometro-aguja"]')).toHaveAttribute(
      "transform",
      "rotate(90 100 100)",
    );

    const bajo = render(<Tacometro value={-20} color="rojo" />);
    expect(bajo.container.querySelector('[data-testid="tacometro-valor"]')?.textContent).toBe("0%");
  });

  it("does not depend on runtime DOM measurement (no getBoundingClientRect)", () => {
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect");
    render(<Tacometro value={50} color="verde" />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
