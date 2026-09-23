// gestion-proyectos-workspace, Phase 4 (design.md T6): ResumenTab is pure
// composition — it must pass `projectId` through to the SAME `KpiCards`/
// `CurveSChartContainer` containers the org-wide dashboard uses, never
// re-implement KPI markup or compute avance client-side (spec MUST NOT).

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResumenTab } from "./resumen-tab";

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

beforeEach(() => {
  kpiCardsSpy.mockClear();
  curveSChartSpy.mockClear();
});

describe("ResumenTab", () => {
  it("renders KpiCards and CurveSChartContainer scoped to the given projectId", () => {
    render(<ResumenTab projectId="proy-1" />);

    expect(screen.getByTestId("kpi-cards")).toBeInTheDocument();
    expect(screen.getByTestId("curve-s-chart")).toBeInTheDocument();
    expect(kpiCardsSpy).toHaveBeenCalledWith({ projectId: "proy-1" });
    expect(curveSChartSpy).toHaveBeenCalledWith({ projectId: "proy-1" });
  });
});
