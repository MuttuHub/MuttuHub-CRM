// gestion-proyectos-workspace, Phase 6: view-only Gantt visualization.
// Reuses the SAME `useGoals`/`useActivities` reads the Cronograma tab
// already fetches (spec: no new hook needed, no duplicated data fetching).
// Bar color reuses the `ColorSemaforo` palette convention already
// established in `tacometro.tsx`/`kpi-cards.tsx` (verde/amarillo/rojo ->
// exito/alerta/destructivo tokens) — no invented color semantics.

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actividad, Meta } from "@/hooks/projects";
import { GanttTab } from "./gantt-tab";

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

describe("GanttTab", () => {
  it("shows a loading state while activities are being fetched", () => {
    activitiesQuery.isLoading = true;
    render(<GanttTab projectId="proy-1" />);
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
  });

  it("shows an empty state when the project has no actividades", () => {
    render(<GanttTab projectId="proy-1" />);
    expect(screen.getByText("Este proyecto no tiene actividades todavía.")).toBeInTheDocument();
  });

  it("renders one bar per actividad with its nombre and avance", () => {
    goalsQuery.data = [makeMeta()];
    activitiesQuery.data = [
      makeActividad({ id: "act-1", nombre: "Taller comunitario" }),
      makeActividad({
        id: "act-2",
        nombre: "Diagnóstico participativo",
        fecha_planificada: "2026-04-01T00:00:00.000Z",
        porcentaje_avance: 100,
        fecha_real: "2026-03-30T00:00:00.000Z",
      }),
    ];

    render(<GanttTab projectId="proy-1" />);

    expect(screen.getByText("Taller comunitario")).toBeInTheDocument();
    expect(screen.getByText("Diagnóstico participativo")).toBeInTheDocument();
    expect(screen.getAllByTestId("gantt-bar")).toHaveLength(2);
  });

  it("colors a completed actividad's bar green (verde)", () => {
    activitiesQuery.data = [
      makeActividad({ id: "act-done", porcentaje_avance: 100, fecha_real: "2026-02-20T00:00:00.000Z" }),
    ];

    render(<GanttTab projectId="proy-1" />);

    expect(screen.getByTestId("gantt-bar")).toHaveAttribute("data-color", "verde");
  });

  it("colors a late actividad's bar red (rojo) when fecha_real is after fecha_planificada", () => {
    activitiesQuery.data = [
      makeActividad({
        id: "act-late",
        porcentaje_avance: 60,
        fecha_planificada: "2026-03-01T00:00:00.000Z",
        fecha_real: "2026-03-10T00:00:00.000Z",
      }),
    ];

    render(<GanttTab projectId="proy-1" />);

    expect(screen.getByTestId("gantt-bar")).toHaveAttribute("data-color", "rojo");
  });

  it("colors an on-time, still-pending actividad's bar green (verde) when its fecha_real is on/before the línea base", () => {
    activitiesQuery.data = [
      makeActividad({
        id: "act-on-time",
        porcentaje_avance: 60,
        fecha_planificada: "2026-03-10T00:00:00.000Z",
        fecha_real: "2026-03-05T00:00:00.000Z",
      }),
    ];

    render(<GanttTab projectId="proy-1" />);

    expect(screen.getByTestId("gantt-bar")).toHaveAttribute("data-color", "verde");
  });

  // C10 fix (WCAG 1.4.1 Use of Color): bar color alone was the only signal
  // for actividad status. A text legend + a per-bar title/aria-label give
  // the same information without relying on color perception.
  it("shows a text legend for the 3 status colors (WCAG 1.4.1)", () => {
    activitiesQuery.data = [makeActividad()];

    render(<GanttTab projectId="proy-1" />);

    expect(screen.getByText("A tiempo")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText("Atrasado")).toBeInTheDocument();
  });

  it("labels each bar's status in text via title/aria-label, not color alone", () => {
    activitiesQuery.data = [
      makeActividad({ id: "act-done", porcentaje_avance: 100, fecha_real: "2026-02-20T00:00:00.000Z" }),
      makeActividad({
        id: "act-late",
        porcentaje_avance: 60,
        fecha_planificada: "2026-03-01T00:00:00.000Z",
        fecha_real: "2026-03-10T00:00:00.000Z",
      }),
      makeActividad({
        id: "act-pending",
        porcentaje_avance: 40,
        fecha_planificada: "2099-01-01T00:00:00.000Z",
        fecha_real: null,
      }),
    ];

    render(<GanttTab projectId="proy-1" />);

    const bars = screen.getAllByTestId("gantt-bar");
    const [doneBar, lateBar, pendingBar] = bars;
    expect(doneBar).toHaveAttribute("data-color", "verde");
    expect(doneBar.getAttribute("title") ?? doneBar.getAttribute("aria-label")).toBe("A tiempo");
    expect(lateBar).toHaveAttribute("data-color", "rojo");
    expect(lateBar.getAttribute("title") ?? lateBar.getAttribute("aria-label")).toBe("Atrasado");
    expect(pendingBar).toHaveAttribute("data-color", "amarillo");
    expect(pendingBar.getAttribute("title") ?? pendingBar.getAttribute("aria-label")).toBe("Pendiente");
  });

  it("groups actividades under their meta nombre", () => {
    goalsQuery.data = [makeMeta({ id: "meta-1", nombre: "Meta Uno" })];
    activitiesQuery.data = [makeActividad({ meta_id: "meta-1" })];

    render(<GanttTab projectId="proy-1" />);

    expect(screen.getByText("Meta Uno")).toBeInTheDocument();
  });

  // C4 fix (mobile Gantt readability): jsdom never computes real layout/width,
  // so these two tests assert the responsive Tailwind classes that DRIVE the
  // layout (column on mobile, row from `sm:` up) instead of measured pixel
  // widths — a real-viewport check belongs in an e2e/visual tool, not here.
  it("stacks the actividad row into a column on mobile, with the label going full-width and switching to a fixed-width row at sm", () => {
    activitiesQuery.data = [makeActividad({ nombre: "Taller comunitario" })];

    render(<GanttTab projectId="proy-1" />);

    const label = screen.getByText("Taller comunitario");
    const row = label.parentElement;
    expect(row).toHaveClass("flex", "flex-col", "sm:flex-row", "sm:items-center");
    expect(label).toHaveClass("w-full", "truncate", "sm:w-40", "sm:shrink-0");
  });

  it("keeps the bar and the porcentaje together as one unit on mobile, which collapses back into the row at sm so desktop layout is unchanged", () => {
    activitiesQuery.data = [makeActividad()];

    render(<GanttTab projectId="proy-1" />);

    const barTrack = screen.getByTestId("gantt-bar").parentElement;
    const barPercentGroup = barTrack?.parentElement;
    expect(barPercentGroup).toHaveClass("flex", "items-center", "sm:contents");
    expect(screen.getByText(`${makeActividad().porcentaje_avance}%`)).toBeInTheDocument();
  });
});
