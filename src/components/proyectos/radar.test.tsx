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

  it("renders a fixed viewBox svg with an accessible label for 3+ axes", () => {
    const { container } = render(
      <Radar
        axes={[
          { label: "a", value: 50 },
          { label: "b", value: 60 },
          { label: "c", value: 70 },
        ]}
        label="Cumplimiento de indicadores"
      />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("viewBox", "0 0 200 200");
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "Cumplimiento de indicadores");
    expect(container.querySelector('[data-testid="radar-barras"]')).toBeNull();
  });

  describe("fewer than 3 axes: a readable bars fallback instead of a degenerate polygon", () => {
    it("renders one labelled progress bar for a single axis (no svg, no spoke, no polygon)", () => {
      const { container, getByRole, getByText } = render(
        <Radar axes={[{ label: "Educación", value: 32.1 }]} label="Cumplimiento de indicadores" />,
      );
      expect(container.querySelector("svg")).toBeNull();
      expect(container.querySelector('[data-testid="radar-eje"]')).toBeNull();
      expect(container.querySelector('[data-testid="radar-poligono"]')).toBeNull();
      expect(getByText("Educación")).toBeInTheDocument();
      expect(getByText("32,1 %")).toBeInTheDocument();
      expect(getByRole("progressbar", { name: /Educación/ })).toHaveAttribute("aria-valuenow", "32.1");
      expect(getByRole("group", { name: "Cumplimiento de indicadores" })).toBeInTheDocument();
    });

    it("renders one bar per axis for two axes, in order, with clamped values", () => {
      const { container, getAllByRole } = render(
        <Radar
          axes={[
            { label: "alto", value: 250 },
            { label: "bajo", value: -10 },
          ]}
        />,
      );
      expect(container.querySelector("svg")).toBeNull();
      const bars = getAllByRole("progressbar");
      expect(bars.map((b) => b.getAttribute("aria-valuenow"))).toEqual(["100", "0"]);
      expect(container.querySelectorAll('[data-testid="radar-barra"]')).toHaveLength(2);
      expect(container.textContent).toContain("100 %");
      expect(container.textContent).toContain("0 %");
    });

    it("switches to the real radar at exactly 3 axes", () => {
      const tres = render(
        <Radar
          axes={[
            { label: "a", value: 10 },
            { label: "b", value: 20 },
            { label: "c", value: 30 },
          ]}
        />,
      );
      expect(tres.container.querySelector("svg")).toBeInTheDocument();
      expect(tres.container.querySelector('[data-testid="radar-barras"]')).toBeNull();
      expect(tres.container.querySelectorAll('[data-testid="radar-eje"]')).toHaveLength(3);
    });
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

  it("clamps values outside the 0..100 scale to the rim and the centre", () => {
    const { container } = render(
      <Radar
        axes={[
          { label: "alto", value: 250 },
          { label: "bajo", value: -10 },
          { label: "medio", value: 0 },
        ]}
      />,
    );
    // N=3: first axis straight up at R=78; the other two collapse onto the centre.
    expect(container.querySelector('[data-testid="radar-poligono"]')).toHaveAttribute("points", "100,22 100,100 100,100");
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
    render(
      <Radar
        axes={[
          { label: "a", value: 10 },
          { label: "b", value: 20 },
          { label: "c", value: 30 },
        ]}
      />,
    );
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
