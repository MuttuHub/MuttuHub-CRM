// proyecto-legalizacion-tab, Phase 4 (design.md "Component Structure",
// spec.md "Pestaña Legalización con libro y filtros" — RF-06): loading /
// empty / populated states, 3 KPI cards, filter chips (Todos/Sin
// soporte/Observados) and the observed-row visual tint. Mirrors
// `financiero-tab.test.tsx`'s pattern (`vi.hoisted` query mock,
// `toHaveClass`/attribute assertions). `estado_legalizacion` is asserted as
// arriving VERBATIM from the mocked `useExpenses` response — this component
// must never recompute it (design.md D1).
//
// `ExpenseDialog` is mocked out (same convention as
// `project-workspace.test.tsx` mocking its tab components) — its own
// behavior is covered by `expense-dialog.test.tsx`, not here.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExpensesResponse, Gasto, LineaOption } from "@/hooks/projects";
import { LegalizacionTab } from "./legalizacion-tab";

const { expensesQuery } = vi.hoisted(() => ({
  expensesQuery: { data: undefined as ExpensesResponse | undefined, isLoading: false },
}));

vi.mock("@/hooks/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/projects")>();
  return {
    ...actual,
    useExpenses: () => expensesQuery,
  };
});

const expenseDialogSpy = vi.fn();
vi.mock("@/components/proyectos/expense-dialog", () => ({
  ExpenseDialog: (props: { open: boolean; lineas: LineaOption[] }) => {
    expenseDialogSpy(props);
    return props.open ? <div data-testid="expense-dialog-stub" /> : null;
  },
}));

function makeGasto(overrides: Partial<Gasto> = {}): Gasto {
  return {
    id: "gasto-1",
    proyecto_id: "proy-1",
    linea_id: "linea-1",
    concepto: "Nómina 1.ª quincena",
    monto_cop: "1000000",
    fecha_gasto: "2026-02-13T00:00:00.000Z",
    registrado_por_id: "u-1",
    created_at: "2026-02-13T00:00:00.000Z",
    updated_at: "2026-02-13T00:00:00.000Z",
    tercero: "Catalina Vélez",
    numero_comprobante: "301",
    observado: false,
    observacion: null,
    estado_legalizacion: "falta_soporte",
    linea: { rubro_id: "rubro-1", rubro: { nombre: "Personal científico" } },
    ...overrides,
  };
}

function makeResponse(overrides: Partial<ExpensesResponse> = {}): ExpensesResponse {
  return { gastos: [], lineas: [{ id: "linea-1", rubro_id: "rubro-1", rubro_nombre: "Personal científico" }], ...overrides };
}

beforeEach(() => {
  expensesQuery.data = undefined;
  expensesQuery.isLoading = false;
  expenseDialogSpy.mockClear();
});

describe("LegalizacionTab", () => {
  it("shows a loading state while expenses are being fetched", () => {
    expensesQuery.isLoading = true;
    render(<LegalizacionTab projectId="proy-1" />);
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
  });

  it("shows an empty state when the project has no gastos", () => {
    expensesQuery.data = makeResponse({ gastos: [] });
    render(<LegalizacionTab projectId="proy-1" />);
    expect(
      screen.getByText("Este proyecto no tiene gastos registrados todavía."),
    ).toBeInTheDocument();
  });

  it("renders 3 KPI cards with legalizado total, con-soporte ratio and observados count", () => {
    expensesQuery.data = makeResponse({
      gastos: [
        makeGasto({ id: "g1", monto_cop: "1000000", estado_legalizacion: "con_soporte", observado: false }),
        makeGasto({ id: "g2", monto_cop: "500000", estado_legalizacion: "falta_soporte", observado: false }),
        makeGasto({ id: "g3", monto_cop: "300000", estado_legalizacion: "observado", observado: true }),
      ],
    });

    render(<LegalizacionTab projectId="proy-1" />);

    const cards = screen.getAllByTestId("legalizacion-kpi-card");
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText(/1\.800\.000|1,800,000/)).toBeInTheDocument();
    expect(within(cards[1]).getByText("1 de 3")).toBeInTheDocument();
    expect(within(cards[2]).getByText("1")).toBeInTheDocument();
  });

  it("renders one row per gasto with the estado chip taken verbatim from the API", () => {
    expensesQuery.data = makeResponse({
      gastos: [
        makeGasto({ id: "g1", concepto: "Nómina", estado_legalizacion: "con_soporte" }),
        makeGasto({ id: "g2", concepto: "Transporte", estado_legalizacion: "falta_soporte" }),
      ],
    });

    render(<LegalizacionTab projectId="proy-1" />);

    expect(screen.getByText("Nómina")).toBeInTheDocument();
    expect(screen.getByText("Transporte")).toBeInTheDocument();
    expect(screen.getByText("Con soporte")).toBeInTheDocument();
    expect(screen.getByText("Falta soporte")).toBeInTheDocument();
  });

  it("filters rows to 'Falta soporte' when the Sin soporte chip is clicked", async () => {
    const user = userEvent.setup();
    expensesQuery.data = makeResponse({
      gastos: [
        makeGasto({ id: "g1", concepto: "Nómina", estado_legalizacion: "con_soporte" }),
        makeGasto({ id: "g2", concepto: "Transporte", estado_legalizacion: "falta_soporte" }),
        makeGasto({ id: "g3", concepto: "Insumos", estado_legalizacion: "observado", observado: true }),
      ],
    });

    render(<LegalizacionTab projectId="proy-1" />);
    await user.click(screen.getByRole("button", { name: "Sin soporte" }));

    expect(screen.queryByText("Nómina")).not.toBeInTheDocument();
    expect(screen.getByText("Transporte")).toBeInTheDocument();
    expect(screen.queryByText("Insumos")).not.toBeInTheDocument();
  });

  it("filters rows to 'Observados' when the Observados chip is clicked", async () => {
    const user = userEvent.setup();
    expensesQuery.data = makeResponse({
      gastos: [
        makeGasto({ id: "g1", concepto: "Nómina", estado_legalizacion: "con_soporte" }),
        makeGasto({ id: "g2", concepto: "Insumos", estado_legalizacion: "observado", observado: true }),
      ],
    });

    render(<LegalizacionTab projectId="proy-1" />);
    await user.click(screen.getByRole("button", { name: "Observados" }));

    expect(screen.queryByText("Nómina")).not.toBeInTheDocument();
    expect(screen.getByText("Insumos")).toBeInTheDocument();
  });

  it("shows all rows again when Todos is clicked after filtering", async () => {
    const user = userEvent.setup();
    expensesQuery.data = makeResponse({
      gastos: [
        makeGasto({ id: "g1", concepto: "Nómina", estado_legalizacion: "con_soporte" }),
        makeGasto({ id: "g2", concepto: "Transporte", estado_legalizacion: "falta_soporte" }),
      ],
    });

    render(<LegalizacionTab projectId="proy-1" />);
    await user.click(screen.getByRole("button", { name: "Sin soporte" }));
    await user.click(screen.getByRole("button", { name: "Todos" }));

    expect(screen.getByText("Nómina")).toBeInTheDocument();
    expect(screen.getByText("Transporte")).toBeInTheDocument();
  });

  it("marks observed rows with a distinct, assertable visual tint", () => {
    expensesQuery.data = makeResponse({
      gastos: [
        makeGasto({ id: "g1", concepto: "Nómina", observado: false, estado_legalizacion: "con_soporte" }),
        makeGasto({ id: "g2", concepto: "Insumos", observado: true, estado_legalizacion: "observado" }),
      ],
    });

    render(<LegalizacionTab projectId="proy-1" />);

    const rows = screen.getAllByTestId("legalizacion-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("data-observado", "false");
    expect(rows[1]).toHaveAttribute("data-observado", "true");
    expect(rows[1].className).not.toBe(rows[0].className);
  });

  it("wraps the ledger table in a horizontal-scroll container (repo convention)", () => {
    expensesQuery.data = makeResponse({ gastos: [makeGasto()] });
    render(<LegalizacionTab projectId="proy-1" />);
    expect(screen.getByTestId("legalizacion-tabla-scroll")).toHaveClass("overflow-x-auto");
  });

  it("opens the Registrar gasto dialog with the fetched líneas when the CTA is clicked", async () => {
    const user = userEvent.setup();
    expensesQuery.data = makeResponse({
      gastos: [makeGasto()],
      lineas: [{ id: "linea-9", rubro_id: "rubro-9", rubro_nombre: "Transporte" }],
    });

    render(<LegalizacionTab projectId="proy-1" />);
    await user.click(screen.getByRole("button", { name: /registrar gasto/i }));

    expect(screen.getByTestId("expense-dialog-stub")).toBeInTheDocument();
    const lastCall = expenseDialogSpy.mock.calls[expenseDialogSpy.mock.calls.length - 1][0];
    expect(lastCall.lineas).toEqual([{ id: "linea-9", rubro_id: "rubro-9", rubro_nombre: "Transporte" }]);
  });
});
