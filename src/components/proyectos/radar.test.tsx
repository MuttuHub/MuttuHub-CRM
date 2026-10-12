// S14 P9: `Radar` is a pure SVG primitive (fixed viewBox, no DOM measurement) that plots
// one axis per strategic line at `θ = -π/2 + 2πi/N`, `r = clamp(valor/100, 0, 1) · R`.
// Ported from feat/dashboard-management-csv-export and adapted to this branch's tokens.

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Radar } from "./radar";

describe("Radar", () => {
  it("renders the empty state with no axes", () => {
    const { container, getByText } = render(<Radar axes={[]} />);
    expect(getByText("Sin datos disponibles")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders a fixed viewBox svg with an accessible label", () => {
    const { container } = render(
      <Radar axes={[{ label: "Indicadores", value: 50 }]} label="Cumplimiento de indicadores" />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("viewBox", "0 0 200 200");
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "Cumplimiento de indicadores");
  });

  it("renders one spoke and a single-point polygon for a one-axis series", () => {
    const { container } = render(<Radar axes={[{ label: "Indicadores", value: 50 }]} />);
    expect(container.querySelectorAll('[data-testid="radar-eje"]')).toHaveLength(1);
    // θ = -π/2 (arriba), r = 0.5 · 78 = 39 -> (100, 61)
    expect(container.querySelector('[data-testid="radar-poligono"]')).toHaveAttribute("points", "100,61");
  });

  it("renders N spokes and an N-point polygon for N axes", () => {
    const axes = [
      { label: "a", value: 100 },
      { label: "b", value: 50 },
      { label: "c", value: 0 },
      { label: "d", value: 100 },
    ];
    const { container } = render(<Radar axes={axes} />);
    expect(container.querySelectorAll('[data-testid="radar-eje"]')).toHaveLength(4);
    // R = 78: (100,22) (139,100) (100,100) (22,100)
    expect(container.querySelector('[data-testid="radar-poligono"]')).toHaveAttribute("points", "100,22 139,100 100,100 22,100");
  });

  it("clamps values outside the 0..100 scale", () => {
    const { container } = render(
      <Radar
        axes={[
          { label: "alto", value: 250 },
          { label: "bajo", value: -10 },
        ]}
      />,
    );
    // N=2: θ = -90° y +90°; el alto llega al radio R=78 y el bajo al centro.
    expect(container.querySelector('[data-testid="radar-poligono"]')).toHaveAttribute("points", "100,22 100,100");
  });

  it("draws the reference rings only for 3+ axes and paints with theme tokens", () => {
    const { container } = render(<Radar axes={[{ label: "a", value: 10 }, { label: "b", value: 20 }]} />);
    expect(container.querySelectorAll('[data-testid="radar-anillo"]')).toHaveLength(0);
    const tres = render(<Radar axes={[{ label: "a", value: 10 }, { label: "b", value: 20 }, { label: "c", value: 30 }]} />);
    expect(tres.container.querySelectorAll('[data-testid="radar-anillo"]')).toHaveLength(4);
    // The series paints with a token-backed class that flips in dark mode, never a raw colour.
    const poligono = tres.container.querySelector('[data-testid="radar-poligono"]')!;
    expect(poligono.getAttribute("class")).toMatch(/stroke-rose-500/);
    expect(poligono.getAttribute("class")).toMatch(/dark:stroke-rose-400/);
  });

  it("does not depend on runtime DOM measurement (no getBoundingClientRect)", () => {
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect");
    render(<Radar axes={[{ label: "a", value: 10 }]} />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
