// proyecto-financiero-tab, Phase 3 (design.md "Component Structure"): loading
// / empty / populated states + semáforo colors, mirroring the
// `cronograma-tab.test.tsx` pattern (`vi.mock`+`vi.hoisted`, `toHaveClass`
// assertions). D1 (design.md): every color assertion here checks the value
// comes VERBATIM from the mocked `useBudget` response — this component must
// never recompute `colorFinanciero` itself.

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatCOP } from "@/hooks/crm";
import type { Budget, RubroBudget } from "@/hooks/projects";
import { FinancieroTab } from "./financiero-tab";

const { budgetQuery } = vi.hoisted(() => ({
  budgetQuery: { data: undefined as Budget | undefined, isLoading: false },
}));

vi.mock("@/hooks/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/projects")>();
  return {
    ...actual,
    useBudget: () => budgetQuery,
  };
});

function makeRubro(overrides: Partial<RubroBudget> = {}): RubroBudget {
  return {
    rubro_id: "rubro-1",
    rubro_nombre: "Personal",
    rubro_activo: true,
    monto_proyectado_cop: 1000,
    monto_ejecutado_cop: 200,
    color_financiero: "verde",
    ...overrides,
  };
}

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    rubros: [],
    proyectado_total: 0,
    ejecutado_total: 0,
    color_financiero_total: "verde",
    ...overrides,
  };
}

beforeEach(() => {
  budgetQuery.data = undefined;
  budgetQuery.isLoading = false;
});

describe("FinancieroTab", () => {
  it("shows a loading state while the budget is being fetched", () => {
    budgetQuery.isLoading = true;
    render(<FinancieroTab projectId="proy-1" />);
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
  });

  it("shows an empty state when the project has no líneas presupuestales", () => {
    budgetQuery.data = makeBudget({ rubros: [] });
    render(<FinancieroTab projectId="proy-1" />);
    expect(
      screen.getByText("Este proyecto no tiene líneas presupuestales todavía."),
    ).toBeInTheDocument();
  });

  it("renders one row per rubro with asignado/ejecutado/diferencia and the semáforo chip color taken verbatim from the API", () => {
    budgetQuery.data = makeBudget({
      rubros: [
        makeRubro({
          rubro_id: "r1",
          rubro_nombre: "Personal",
          monto_proyectado_cop: 1000,
          monto_ejecutado_cop: 200,
          color_financiero: "rojo",
        }),
        makeRubro({
          rubro_id: "r2",
          rubro_nombre: "Transporte",
          monto_proyectado_cop: 500,
          monto_ejecutado_cop: 480,
          color_financiero: "verde",
        }),
      ],
      proyectado_total: 1500,
      ejecutado_total: 680,
      color_financiero_total: "amarillo",
    });

    render(<FinancieroTab projectId="proy-1" />);

    const table = within(screen.getByRole("table"));
    expect(table.getByText("Personal")).toBeInTheDocument();
    expect(table.getByText("Transporte")).toBeInTheDocument();

    const chips = screen.getAllByTestId("rubro-semaforo-chip");
    expect(chips).toHaveLength(2);
    expect(chips[0]).toHaveClass("bg-destructivo");
    expect(chips[1]).toHaveClass("bg-exito");
  });

  it("computes diferencia as proyectado - ejecutado, display-only (not returned by the API)", () => {
    budgetQuery.data = makeBudget({
      rubros: [makeRubro({ monto_proyectado_cop: 1000, monto_ejecutado_cop: 200 })],
    });

    render(<FinancieroTab projectId="proy-1" />);

    expect(screen.getByTestId("rubro-diferencia").textContent).toBe(formatCOP(800));
  });

  it("reflects color_financiero_total on the total gauge/chip, never recomputing it client-side", () => {
    budgetQuery.data = makeBudget({
      rubros: [makeRubro()],
      color_financiero_total: "rojo",
    });

    render(<FinancieroTab projectId="proy-1" />);

    expect(screen.getByTestId("financiero-total-chip")).toHaveClass("bg-destructivo");
  });

  it("shows an alert card entry for each rubro not in verde, with a suggested action, and skips rubros in verde", () => {
    budgetQuery.data = makeBudget({
      rubros: [
        makeRubro({ rubro_id: "r1", rubro_nombre: "Personal", color_financiero: "rojo" }),
        makeRubro({ rubro_id: "r2", rubro_nombre: "Transporte", color_financiero: "amarillo" }),
        makeRubro({ rubro_id: "r3", rubro_nombre: "Insumos", color_financiero: "verde" }),
      ],
    });

    render(<FinancieroTab projectId="proy-1" />);

    const alertas = screen.getAllByTestId("financiero-alerta-item");
    expect(alertas).toHaveLength(2);
    expect(alertas[0]).toHaveTextContent("Personal");
    expect(alertas[1]).toHaveTextContent("Transporte");
    expect(screen.queryByText("Insumos", { selector: "[data-testid='financiero-alerta-item'] *" })).not.toBeInTheDocument();
  });

  it("shows no alert card when every rubro is in verde", () => {
    budgetQuery.data = makeBudget({
      rubros: [makeRubro({ color_financiero: "verde" })],
    });

    render(<FinancieroTab projectId="proy-1" />);

    expect(screen.queryByTestId("financiero-alerta-item")).not.toBeInTheDocument();
  });

  it("wraps the rubro table in a horizontal-scroll container (repo convention for narrow viewports)", () => {
    budgetQuery.data = makeBudget({ rubros: [makeRubro()] });

    render(<FinancieroTab projectId="proy-1" />);

    expect(screen.getByTestId("financiero-tabla-scroll")).toHaveClass("overflow-x-auto");
  });
});
