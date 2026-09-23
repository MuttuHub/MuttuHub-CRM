// gestion-proyectos-workspace, Phase 4 (design.md T6, Risk row "T6 refactors
// components used by the live /tablero-gerencial"): regression guard proving
// the org-wide Tablero Gerencial keeps calling `KpiCards`/`CurveSChartContainer`
// with NO projectId after the container/presentational split — i.e. it still
// gets the org-wide aggregate, not a project-scoped one, and the page's own
// JSX/imports needed zero changes.

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TableroGerencialClient } from "./tablero-gerencial-client";

const kpiCardsSpy = vi.fn();
const curveSChartSpy = vi.fn();

vi.mock("@/components/dashboard/kpi-cards", () => ({
  KpiCards: (props: { projectId?: string | null } = {}) => {
    kpiCardsSpy(props);
    return <div data-testid="kpi-cards" />;
  },
}));

vi.mock("@/components/dashboard/curve-s-chart", () => ({
  default: (props: { projectId?: string | null } = {}) => {
    curveSChartSpy(props);
    return <div data-testid="curve-s-chart" />;
  },
}));

describe("TableroGerencialClient (org-wide regression)", () => {
  it("renders KpiCards and CurveSChartContainer with no projectId — org-wide scope unchanged", () => {
    render(<TableroGerencialClient />);

    expect(screen.getByTestId("kpi-cards")).toBeInTheDocument();
    expect(screen.getByTestId("curve-s-chart")).toBeInTheDocument();
    expect(kpiCardsSpy).toHaveBeenCalledWith({});
    expect(curveSChartSpy).toHaveBeenCalledWith({});
  });
});
