// V2.2 (v6 visual alignment): the four table/list caras render their chips
// through the shared StatusChip and their empty blocks through EmptyState.
// Data hooks are mocked; only presentation is asserted.

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Q = { data: unknown; isLoading: boolean; isError: boolean; error: unknown; refetch: () => void };
const q = vi.hoisted(() => ({
  pipeline: { data: null, isLoading: false, isError: false, error: null, refetch: () => {} } as Q,
  tasks: { data: null, isLoading: false, isError: false, error: null, refetch: () => {} } as Q,
  clients: { data: null, isLoading: false, isError: false, error: null, refetch: () => {} } as Q,
  mine: { data: null, isLoading: false, isError: false, error: null, refetch: () => {} } as Q,
}));

vi.mock("@/hooks/dashboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/dashboard")>();
  return {
    ...actual,
    useDashboardPipeline: () => q.pipeline,
    useDashboardTasks: () => q.tasks,
    useDashboardClientsActivity: () => q.clients,
    useDashboardMySummary: () => q.mine,
  };
});

import { CaraPipeline } from "./cara-pipeline";
import { CaraTareas } from "./cara-tasks";
import { CaraClientesActividad } from "./cara-clients-activity";
import { CaraMiResumen } from "./cara-my-summary";

const chips = (c: HTMLElement) => [...c.querySelectorAll('[data-slot="status-chip"]')];
const empties = (c: HTMLElement) => c.querySelectorAll('[data-slot="empty-state"]');

beforeEach(() => {
  for (const k of Object.keys(q) as (keyof typeof q)[]) q[k].data = null;
});

describe("CaraPipeline (V2.2)", () => {
  const base = {
    scope: "all",
    total_activas: 0,
    valor_activo: 0,
    embudo: [],
    top_clientes: [],
    comparativo: { potencial_activo: 0, ganado_historico: 0, ratio: 1.5 },
  };

  it("renders the ratio as a StatusChip toned by its value and empty blocks as EmptyState", () => {
    q.pipeline.data = base;
    const { container } = render(<CaraPipeline filters={{}} />);
    const ratio = chips(container).find((c) => /Ratio/.test(c.textContent ?? ""));
    expect(ratio).toHaveAttribute("data-tone", "exito");
    expect(empties(container).length).toBe(2);
  });

  it("tones a sub-1 ratio as alerta and a zero ratio as neutro", () => {
    q.pipeline.data = { ...base, comparativo: { ...base.comparativo, ratio: 0.4 } };
    const a = render(<CaraPipeline filters={{}} />);
    expect(chips(a.container).find((c) => /Ratio/.test(c.textContent ?? ""))).toHaveAttribute("data-tone", "alerta");
    a.unmount();
    q.pipeline.data = { ...base, comparativo: { ...base.comparativo, ratio: 0 } };
    const b = render(<CaraPipeline filters={{}} />);
    expect(chips(b.container).find((c) => /Ratio/.test(c.textContent ?? ""))).toHaveAttribute("data-tone", "neutro");
  });
});

describe("CaraTareas (V2.2)", () => {
  it("renders board columns as StatusChips with their count and empty blocks as EmptyState", () => {
    q.tasks.data = {
      scope: "all",
      por_columna: [{ estado: "EN_PROGRESO", label: "En progreso", count: 3 }],
      cumplimiento_por_persona: [],
      vencidas: { count: 0, lista: [] },
    };
    const { container } = render(<CaraTareas filters={{}} />);
    const col = chips(container);
    expect(col).toHaveLength(1);
    expect(col[0].textContent).toContain("3");
    expect(empties(container).length).toBe(2);
  });
});

describe("CaraClientesActividad (V2.2)", () => {
  it("renders estado and prioridad as StatusChips in the table", () => {
    q.clients.data = {
      scope: "all",
      sin_gestion: {
        dias: 14,
        clientes: [
          {
            cliente_id: "c1",
            nombre: "Acme",
            estado: "ACTIVO",
            prioridad: "ALTA",
            responsable_nombre: "Ana",
            ultima_gestion: null,
          },
        ],
      },
      distribucion: { por_tipo: [], por_estado: [], por_prioridad: [] },
      actividad_por_responsable: [],
    };
    const { container } = render(<CaraClientesActividad filters={{}} dias={14} onDias={() => {}} />);
    expect(chips(container).length).toBeGreaterThanOrEqual(2);
    expect(empties(container).length).toBe(1);
  });

  it("uses EmptyState for the 'Todo al día' block", () => {
    q.clients.data = {
      scope: "all",
      sin_gestion: { dias: 14, clientes: [] },
      distribucion: { por_tipo: [], por_estado: [], por_prioridad: [] },
      actividad_por_responsable: [],
    };
    const { container } = render(<CaraClientesActividad filters={{}} dias={14} onDias={() => {}} />);
    expect(screen.getByText("Todo al día")).toBeInTheDocument();
    expect(empties(container).length).toBeGreaterThanOrEqual(1);
  });
});

describe("CaraMiResumen (V2.2)", () => {
  it("renders task and client estados as StatusChips and empty lists as EmptyState", () => {
    q.mine.data = {
      scope: "own",
      activas: {
        count: 1,
        items: [{ id: "t1", titulo: "Llamar", estado: "EN_PROGRESO", fecha_entrega: null, origen: "MANUAL" }],
      },
      vencidas: { count: 0, items: [] },
      hoy: { count: 0 },
      compromisos_pendientes: { count: 0, vencidos: 0 },
      clientes_asignados: {
        count: 1,
        items: [{ cliente_id: "c1", nombre: "Acme", estado: "ACTIVO", prioridad: null }],
      },
    };
    const { container } = render(<CaraMiResumen filters={{}} />);
    expect(chips(container).length).toBe(2);
    expect(empties(container).length).toBe(1);
  });

  it("uses EmptyState when there are no assigned clients", () => {
    q.mine.data = {
      scope: "own",
      activas: { count: 0, items: [] },
      vencidas: { count: 0, items: [] },
      hoy: { count: 0 },
      compromisos_pendientes: { count: 0, vencidos: 0 },
      clientes_asignados: { count: 0, items: [] },
    };
    const { container } = render(<CaraMiResumen filters={{}} />);
    expect(screen.getByText("Sin clientes asignados")).toBeInTheDocument();
    expect(empties(container).length).toBeGreaterThanOrEqual(1);
  });
});
