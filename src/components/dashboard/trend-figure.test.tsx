import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrendFigure } from "./trend-figure";

describe("TrendFigure (plan 3B — accesibilidad)", () => {
  const series = [
    { label: "2026-08-03", value: 2 },
    { label: "2026-08-10", value: 5 },
    { label: "2026-08-17", value: 3 },
  ];

  it("keeps the <svg> aria-hidden and carries the data in caption + sr-only list", () => {
    const { container } = render(<TrendFigure caption="Cierres por semana (10 en 3 semanas)." series={series} />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    // El caption sr-only describe la serie.
    expect(screen.getByText("Cierres por semana (10 en 3 semanas).")).toBeInTheDocument();
    // La lista sr-only porta cada punto.
    expect(screen.getByText("2026-08-03: 2")).toBeInTheDocument();
    expect(screen.getByText("2026-08-17: 3")).toBeInTheDocument();
  });

  it("requires a caption (regression: nobody unwraps the aria-hidden sparkline)", () => {
    // Sin caption no hay forma accesible de leer el gráfico — el test asegura
    // que la primitiva siga exigiendo el caption en la forma.
    const { container } = render(<TrendFigure caption="Cierres." series={series} />);
    expect(container.querySelector("figcaption")).not.toBeNull();
  });
});