// gestion-proyectos-workspace, Phase 5: behavioral coverage for the
// standalone Cronograma tab, adapted from the dead-code `CronogramaTab` in
// `project-sheet.tsx` (see that file's own "Cronograma tab" describe block
// for the assertions this mirrors).

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actividad, Meta } from "@/hooks/projects";
import { CronogramaTab } from "./cronograma-tab";

const { goalsQuery, activitiesQuery } = vi.hoisted(() => ({
  goalsQuery: { data: [] as Meta[], isLoading: false },
  activitiesQuery: { data: [] as Actividad[], isLoading: false },
}));

vi.mock("@/hooks/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/projects")>();
  return {
    ...actual,
    useGoals: () => goalsQuery,
    useActivities: () => activitiesQuery,
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

beforeEach(() => {
  goalsQuery.data = [];
  goalsQuery.isLoading = false;
  activitiesQuery.data = [];
  activitiesQuery.isLoading = false;
});

describe("CronogramaTab", () => {
  it("shows a loading state while activities are being fetched", () => {
    activitiesQuery.isLoading = true;
    render(<CronogramaTab projectId="proy-1" />);
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
  });

  it("shows an empty state when the project has no actividades", () => {
    render(<CronogramaTab projectId="proy-1" />);
    expect(screen.getByText("Este proyecto no tiene actividades todavía.")).toBeInTheDocument();
  });

  it("renders each actividad with its meta, avance, línea base and real dates", () => {
    goalsQuery.data = [makeMeta()];
    activitiesQuery.data = [makeActividad()];

    render(<CronogramaTab projectId="proy-1" />);

    expect(screen.getByText("Taller comunitario")).toBeInTheDocument();
    expect(screen.getByText("Meta: Meta Uno")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText(/Real: —/)).toBeInTheDocument();
  });

  it("colors the real date green when it lands on/before the línea base, red when late", () => {
    activitiesQuery.data = [
      makeActividad({ id: "act-on-time", fecha_real: "2026-02-28T00:00:00.000Z" }),
      makeActividad({ id: "act-late", nombre: "Actividad tardía", fecha_real: "2026-03-05T00:00:00.000Z" }),
    ];

    render(<CronogramaTab projectId="proy-1" />);

    const realSpans = screen.getAllByText(/Real:/);
    expect(realSpans[0]).toHaveClass("text-exito");
    expect(realSpans[1]).toHaveClass("text-destructivo");
  });
});
