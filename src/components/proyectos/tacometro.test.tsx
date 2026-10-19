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

  describe("arc geometry (semicircle: the large-arc flag is always 0)", () => {
    const CX = 100;
    const CY = 100;
    const VIEWBOX_W = 200;

    /** Parses `M x0 y0 A rx ry rot large sweep x1 y1` from a path `d` attribute. */
    function parseArc(d: string) {
      const m = d.match(
        /^M (-?[\d.]+) (-?[\d.]+) A (-?[\d.]+) (-?[\d.]+) (\d+) ([01]) ([01]) (-?[\d.]+) (-?[\d.]+)$/,
      );
      expect(m, `unparseable arc: ${d}`).not.toBeNull();
      const n = (i: number) => Number(m![i]);
      return { x0: n(1), y0: n(2), rx: n(3), ry: n(4), large: n(6), sweep: n(7), x1: n(8), y1: n(9) };
    }

    const BANDAS_EXTREMAS = [
      { hasta: 25, color: "verde" as const },
      { hasta: 27.5, color: "amarillo" as const },
      { hasta: 100, color: "rojo" as const },
    ];

    it("draws every band and the track with large-arc-flag 0 and endpoints on the upper semicircle", () => {
      const { container } = render(<Tacometro value={11.6} color="verde" bandas={BANDAS_EXTREMAS} />);
      const paths = [
        container.querySelector('[data-testid="tacometro-track"]')!,
        ...container.querySelectorAll('[data-testid="tacometro-banda"]'),
      ];
      expect(paths).toHaveLength(4);
      for (const path of paths) {
        const arc = parseArc(path.getAttribute("d")!);
        expect(arc.large).toBe(0);
        expect(arc.sweep).toBe(1);
        for (const [x, y] of [
          [arc.x0, arc.y0],
          [arc.x1, arc.y1],
        ]) {
          expect(y).toBeLessThanOrEqual(CY);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(VIEWBOX_W);
          // Both endpoints lie on the circle of radius R around the hub.
          expect(Math.hypot(x - CX, y - CY)).toBeCloseTo(arc.rx, 0);
        }
      }
    });

    it("goes left to right: the 27.5-100 band starts left of its end point and never leaves the semicircle", () => {
      const { container } = render(<Tacometro value={50} color="rojo" bandas={BANDAS_EXTREMAS} />);
      const rojo = container.querySelector('[data-color="rojo"][data-testid="tacometro-banda"]')!;
      const arc = parseArc(rojo.getAttribute("d")!);
      expect(arc.x0).toBeLessThan(arc.x1);
      // 100 sits at the far right of the semicircle, on the baseline.
      expect(arc.x1).toBe(CX + arc.rx);
      expect(arc.y1).toBe(CY);
      // The 27.5 start point is above the baseline, on the left half.
      expect(arc.y0).toBeLessThan(CY);
      expect(arc.x0).toBeLessThan(CX);
    });

    it("keeps the full 0-100 track as the exact half circle", () => {
      const { container } = render(<Tacometro value={50} color="verde" />);
      const arc = parseArc(container.querySelector('[data-testid="tacometro-track"]')!.getAttribute("d")!);
      expect(arc).toMatchObject({ x0: CX - arc.rx, y0: CY, x1: CX + arc.rx, y1: CY, large: 0, sweep: 1 });
    });
  });

  it("places the value below the needle hub so the needle never overlaps it", () => {
    const { container } = render(<Tacometro value={32.1} color="verde" />);
    const valor = container.querySelector('[data-testid="tacometro-valor"]')!;
    const y = Number(valor.getAttribute("y"));
    const size = Number(valor.getAttribute("font-size"));
    // The needle only ever points into the upper half (y <= hub), the hub radius is 5:
    // the glyph tops (~0.7 em above the baseline) must sit under the hub, inside the viewBox.
    expect(y - 0.7 * size).toBeGreaterThanOrEqual(100 + 5);
    expect(y).toBeLessThanOrEqual(120);
  });
});
