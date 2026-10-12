// Curva S (S14 P7): inline SVG, no chart library and no DOM measurement. The
// component is presentational: the server already computed both curves and the
// corte; here we only paint them (D11) and list them month by month.

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProjectCurve } from "@/hooks/projects";
import { CurveSChart } from "./curve-s-chart";

const CURVA: ProjectCurve = {
  base: "vigente",
  corte: "2026-11",
  periodos: [
    { periodo: "2026-08", tecnico: { planeado: 20.7, ejecutado: 10 }, financiero: { planeado: 20, ejecutado: 5 } },
    { periodo: "2026-09", tecnico: { planeado: 42.1, ejecutado: 28 }, financiero: { planeado: 40, ejecutado: 15 } },
    { periodo: "2026-10", tecnico: { planeado: 64.3, ejecutado: 40 }, financiero: { planeado: 60, ejecutado: 30 } },
    { periodo: "2026-11", tecnico: { planeado: 85.7, ejecutado: 48 }, financiero: { planeado: 80, ejecutado: 42.5 } },
    { periodo: "2026-12", tecnico: { planeado: 100, ejecutado: null }, financiero: { planeado: 100, ejecutado: null } },
  ],
};

const puntos = (testId: string) => Number(screen.getByTestId(testId).getAttribute("data-puntos"));

describe("CurveSChart", () => {
  it("shows an empty state without data", () => {
    render(<CurveSChart curva={null} />);
    expect(screen.getByTestId("curve-s-chart")).toHaveTextContent("Sin datos de avance todavía.");
    expect(screen.queryByTestId("curve-s-tecnico")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no periods", () => {
    render(<CurveSChart curva={{ base: "vigente", corte: "2026-11", periodos: [] }} />);
    expect(screen.getByText("Sin datos de avance todavía.")).toBeInTheDocument();
  });

  it("renders a labelled panel per curve, never mixing them", () => {
    render(<CurveSChart curva={CURVA} />);
    expect(screen.getByTestId("curve-s-chart")).toHaveTextContent("Curva S");
    expect(screen.getByTestId("curve-s-tecnico")).toHaveTextContent("Avance técnico");
    expect(screen.getByTestId("curve-s-financiero")).toHaveTextContent("Avance financiero");
  });

  it("paints the planned line across every period and the executed line only up to the corte", () => {
    render(<CurveSChart curva={CURVA} />);
    for (const panel of ["tecnico", "financiero"]) {
      expect(puntos(`curve-s-${panel}-planeado`)).toBe(5);
      // The corte is 2026-11: four executed points, the fifth (2026-12) is future.
      expect(puntos(`curve-s-${panel}-ejecutado`)).toBe(4);
    }
  });

  it("labels the SVG for assistive tech and draws with a shared 0..100 axis", () => {
    render(<CurveSChart curva={CURVA} />);
    expect(screen.getByTestId("curve-s-tecnico-svg")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("técnica"),
    );
    expect(screen.getByTestId("curve-s-financiero-svg")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("financiera"),
    );
    expect(screen.getAllByText("100 %").length).toBeGreaterThan(0);
  });

  it("shows the month labels of every period", () => {
    render(<CurveSChart curva={CURVA} />);
    const tecnico = screen.getByTestId("curve-s-tecnico");
    expect(within(tecnico).getByText("ago")).toBeInTheDocument();
    expect(within(tecnico).getByText("nov")).toBeInTheDocument();
    expect(within(tecnico).getByText("dic")).toBeInTheDocument();
  });

  it("lists the monthly table with planned and executed per curve, and an em dash after the corte", () => {
    render(<CurveSChart curva={CURVA} />);
    const tabla = screen.getByTestId("curve-s-tabla");
    const filas = within(tabla).getAllByRole("row");
    // One header row plus one row per period.
    expect(filas).toHaveLength(6);
    const primera = filas[1];
    expect(primera).toHaveTextContent("ago 2026");
    expect(primera).toHaveTextContent("20,7 %");
    expect(primera).toHaveTextContent("10 %");
    expect(primera).toHaveTextContent("5 %");
    const ultima = filas[5];
    expect(ultima).toHaveTextContent("dic 2026");
    // After the corte there is no execution: the cell is an em dash, never a zero.
    expect(within(ultima).getAllByText("—")).toHaveLength(2);
  });
});
