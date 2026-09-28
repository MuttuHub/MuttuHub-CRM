// proyecto-metas-tab, Slice B (design.md "Component Structure" —
// `tabs/metas-tab.tsx`, read-only): one card per Meta with its linked
// Actividad chips (project-wide sequential A{n} code, D7) and Indicador
// rows (progress bar colored from the server-provided `color_indicador`,
// D4 — never recomputed here). "Editar avance" wiring is Slice C, not
// asserted in this file yet.

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actividad, Indicador, Meta } from "@/hooks/projects";
import { MetasTab } from "./metas-tab";

const { goalsQuery, activitiesQuery, indicatorsQuery } = vi.hoisted(() => ({
  goalsQuery: { data: [] as Meta[], isLoading: false },
  activitiesQuery: { data: [] as Actividad[], isLoading: false },
  indicatorsQuery: { data: [] as Indicador[], isLoading: false },
}));

vi.mock("@/hooks/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/projects")>();
  return {
    ...actual,
    useGoals: () => goalsQuery,
    useActivities: () => activitiesQuery,
    useIndicators: () => indicatorsQuery,
  };
});

function makeMeta(overrides: Partial<Meta> = {}): Meta {
  return {
    id: "meta-1",
    proyecto_id: "proy-1",
    nombre: "Meta Uno",
    descripcion: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeActividad(overrides: Partial<Actividad> = {}): Actividad {
  return {
    id: "act-1",
    proyecto_id: "proy-1",
    meta_id: "meta-1",
    nombre: "Taller comunitario",
    descripcion: null,
    peso: 1,
    fecha_planificada: "2026-03-01T00:00:00.000Z",
    fecha_real: null,
    porcentaje_avance: 40,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeIndicador(overrides: Partial<Indicador> = {}): Indicador {
  return {
    id: "ind-1",
    proyecto_id: "proy-1",
    meta_id: "meta-1",
    nombre: "Familias capacitadas",
    unidad: "familias",
    meta_valor: 100,
    valor_actual: 40,
    cuenta_beneficiarios: false,
    created_at: "",
    updated_at: "",
    color_indicador: "amarillo",
    ...overrides,
  };
}

beforeEach(() => {
  goalsQuery.data = [];
  goalsQuery.isLoading = false;
  activitiesQuery.data = [];
  activitiesQuery.isLoading = false;
  indicatorsQuery.data = [];
  indicatorsQuery.isLoading = false;
});

describe("MetasTab", () => {
  it("shows a loading state while metas are pending", () => {
    goalsQuery.isLoading = true;
    render(<MetasTab projectId="proy-1" />);
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
  });

  it("shows an empty state when the project has no metas", () => {
    render(<MetasTab projectId="proy-1" />);
    expect(
      screen.getByText("Este proyecto no tiene metas registradas todavía."),
    ).toBeInTheDocument();
  });

  it("renders one card per meta with its title", () => {
    goalsQuery.data = [makeMeta({ id: "meta-1", nombre: "Meta Uno" }), makeMeta({ id: "meta-2", nombre: "Meta Dos" })];
    render(<MetasTab projectId="proy-1" />);
    expect(screen.getByText("Meta Uno")).toBeInTheDocument();
    expect(screen.getByText("Meta Dos")).toBeInTheDocument();
  });

  it("shows the per-card empty state when a meta has no linked activities", () => {
    goalsQuery.data = [makeMeta()];
    render(<MetasTab projectId="proy-1" />);
    expect(screen.getByText("Sin actividades vinculadas.")).toBeInTheDocument();
  });

  it("shows the per-card empty state when a meta has no linked indicators", () => {
    goalsQuery.data = [makeMeta()];
    render(<MetasTab projectId="proy-1" />);
    expect(screen.getByText("Sin indicadores vinculados.")).toBeInTheDocument();
  });

  describe("activity chips — project-wide sequential A{n} (D7)", () => {
    it("numbers activities sequentially across the whole project, never repeating a code between metas", () => {
      goalsQuery.data = [makeMeta({ id: "meta-1" }), makeMeta({ id: "meta-2", nombre: "Meta Dos" })];
      activitiesQuery.data = [
        makeActividad({ id: "act-1", meta_id: "meta-1", nombre: "Actividad Uno", porcentaje_avance: 100 }),
        makeActividad({ id: "act-2", meta_id: "meta-1", nombre: "Actividad Dos", porcentaje_avance: 20 }),
        makeActividad({ id: "act-3", meta_id: "meta-2", nombre: "Actividad Tres", porcentaje_avance: 20 }),
      ];
      render(<MetasTab projectId="proy-1" />);

      expect(screen.getByText("A1 · 100%")).toBeInTheDocument();
      expect(screen.getByText("A2 · 20%")).toBeInTheDocument();
      // meta-2's own activity continues the sequence at A3, not reset to A1.
      expect(screen.getByText("A3 · 20%")).toBeInTheDocument();
    });

    it("colors a chip verde when porcentaje_avance is 100", () => {
      goalsQuery.data = [makeMeta()];
      activitiesQuery.data = [makeActividad({ porcentaje_avance: 100 })];
      render(<MetasTab projectId="proy-1" />);
      expect(screen.getByTestId("meta-actividad-chip")).toHaveAttribute("data-color", "verde");
    });

    it("colors a chip verde when fecha_real is on time", () => {
      goalsQuery.data = [makeMeta()];
      activitiesQuery.data = [
        makeActividad({
          porcentaje_avance: 60,
          fecha_planificada: "2026-03-10T00:00:00.000Z",
          fecha_real: "2026-03-05T00:00:00.000Z",
        }),
      ];
      render(<MetasTab projectId="proy-1" />);
      expect(screen.getByTestId("meta-actividad-chip")).toHaveAttribute("data-color", "verde");
    });

    it("colors a chip rojo when fecha_real is late", () => {
      goalsQuery.data = [makeMeta()];
      activitiesQuery.data = [
        makeActividad({
          porcentaje_avance: 60,
          fecha_planificada: "2026-03-01T00:00:00.000Z",
          fecha_real: "2026-03-10T00:00:00.000Z",
        }),
      ];
      render(<MetasTab projectId="proy-1" />);
      expect(screen.getByTestId("meta-actividad-chip")).toHaveAttribute("data-color", "rojo");
    });

    it("colors a chip rojo when still pending past its línea base", () => {
      goalsQuery.data = [makeMeta()];
      activitiesQuery.data = [
        makeActividad({ porcentaje_avance: 30, fecha_planificada: "2020-01-01T00:00:00.000Z", fecha_real: null }),
      ];
      render(<MetasTab projectId="proy-1" />);
      expect(screen.getByTestId("meta-actividad-chip")).toHaveAttribute("data-color", "rojo");
    });

    it("colors a chip amarillo when still pending before its línea base", () => {
      goalsQuery.data = [makeMeta()];
      activitiesQuery.data = [
        makeActividad({ porcentaje_avance: 30, fecha_planificada: "2099-01-01T00:00:00.000Z", fecha_real: null }),
      ];
      render(<MetasTab projectId="proy-1" />);
      expect(screen.getByTestId("meta-actividad-chip")).toHaveAttribute("data-color", "amarillo");
    });
  });

  describe("indicator rows — color_indicador rendered verbatim (D4)", () => {
    it("shows the value/target/unit and falls back to Sin medir when valor_actual is null", () => {
      goalsQuery.data = [makeMeta()];
      indicatorsQuery.data = [makeIndicador({ valor_actual: null, meta_valor: 100, unidad: "familias" })];
      render(<MetasTab projectId="proy-1" />);
      expect(screen.getByText(/Sin medir/)).toBeInTheDocument();
    });

    it("shows the numeric value/target/unit when valor_actual is set", () => {
      goalsQuery.data = [makeMeta()];
      indicatorsQuery.data = [makeIndicador({ valor_actual: 40, meta_valor: 100, unidad: "familias" })];
      render(<MetasTab projectId="proy-1" />);
      expect(screen.getByText(/40.*100.*familias/)).toBeInTheDocument();
    });

    it("renders the progress bar color exactly as the server sent it, never recomputed", () => {
      goalsQuery.data = [makeMeta()];
      indicatorsQuery.data = [
        makeIndicador({ valor_actual: 10, meta_valor: 100, color_indicador: "verde" }),
      ];
      render(<MetasTab projectId="proy-1" />);
      // 10/100 = 10% would be "rojo" under the real threshold — asserting
      // "verde" here proves the component trusts the server field, not a
      // local recomputation.
      expect(screen.getByTestId("indicador-progreso")).toHaveAttribute("data-color", "verde");
    });
  });
});
