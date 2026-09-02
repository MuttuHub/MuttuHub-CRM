import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskReportResponse } from "@/hooks/kanban";
import { ReportView } from "./report-view";

// PR 17 (plan §3B): ReportView reutiliza primitivas del dashboard
// (ChipSelector/StatTile/BarRow/DashboardSkeleton). El test de contrato es de
// PRESERVACIÓN DE INFORMACIÓN: reemplazar las tablas/SummaryCards por
// primitivas no puede perder ni un label ni un conteo — todo lo que tenía una
// cifra > 0 tiene que seguir siendo encontrable como texto.

const { reportQuery } = vi.hoisted(() => ({
  reportQuery: {
    data: undefined as TaskReportResponse | undefined,
    isLoading: true,
    isError: false,
    refetch: vi.fn(),
  },
}));

const { meQuery } = vi.hoisted(() => ({
  meQuery: {
    data: undefined as { id: string; nombre: string; rol: string } | undefined,
  },
}));

vi.mock("@/hooks/kanban", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/kanban")>();
  return {
    ...actual,
    useTaskReport: () => reportQuery,
    useCurrentUser: () => meQuery,
  };
});

const reporte: TaskReportResponse = {
  rango: "month",
  resumen: {
    total_asignadas: 10,
    completadas: 6,
    vencidas_activas: 2,
    tasa_cumplimiento: 60,
    a_tiempo: 4,
    tarde: 2,
  },
  por_persona: [
    { id: "u1", nombre: "Ana", asignadas: 6, en_curso: 2, vencidas: 1, completadas: 3, a_tiempo: 2, tarde: 1 },
    { id: "u2", nombre: "Luis", asignadas: 4, en_curso: 2, vencidas: 1, completadas: 3, a_tiempo: 2, tarde: 1 },
  ],
  por_estado: [
    { estado: "POR_HACER", cantidad: 2 },
    { estado: "EN_CURSO", cantidad: 2 },
    { estado: "COMPLETADA", cantidad: 6 },
  ],
  por_cliente: [
    { id: "c1", nombre: "Alcaldía", cantidad: 7 },
    { id: "c2", nombre: "Fundación X", cantidad: 3 },
  ],
  vencimientos_por_antiguedad: [
    { bucket: "menos de 1 semana", cantidad: 1 },
    { bucket: "1 a 4 semanas", cantidad: 1 },
    { bucket: "más de 1 mes", cantidad: 1 },
    { bucket: "sin fecha de entrega", cantidad: 1 },
  ],
  carga_semanal: [
    { semana: "2026-08-03", cantidad: 3 },
    { semana: "2026-08-10", cantidad: 4 },
    { semana: "2026-08-17", cantidad: 2 },
  ],
  tendencia_cierre: [
    { semana: "2026-08-03", cantidad: 1 },
    { semana: "2026-08-10", cantidad: 3 },
    { semana: "2026-08-17", cantidad: 2 },
  ],
  meta: { criterio_rango: "completadas por completed_at, abiertas por updated_at" },
};

beforeEach(() => {
  reportQuery.data = reporte;
  reportQuery.isLoading = false;
  reportQuery.isError = false;
  meQuery.data = { id: "other", nombre: "Otro", rol: "ADMINISTRADOR" };
});

describe("ReportView — preservación de información (PR 17)", () => {
  it("renders the 4 KPIs as readable text", () => {
    render(<ReportView responsable={undefined} cliente={undefined} />);
    expect(screen.getAllByText("10").length).toBeGreaterThan(0); // total asignadas
    expect(screen.getAllByText("6").length).toBeGreaterThan(0); // completadas
    expect(screen.getAllByText("2").length).toBeGreaterThan(0); // vencidas activas
    expect(screen.getAllByText("60%").length).toBeGreaterThan(0); // tasa
  });

  it("renders a_tiempo/tarde at the foot of Completadas", () => {
    render(<ReportView responsable={undefined} cliente={undefined} />);
    expect(screen.getByText(/4 a tiempo · 2 tarde/)).toBeInTheDocument();
  });

  it("shows the tasa de cumplimiento as a BarRow with label, count and % as text", () => {
    render(<ReportView responsable={undefined} cliente={undefined} />);
    // BarRow imprime label + count + pct como texto real (CSS apagado).
    expect(screen.getByText("completadas")).toBeInTheDocument();
    expect(screen.getAllByText("6").length).toBeGreaterThan(0);
    expect(screen.getAllByText("60%").length).toBeGreaterThan(0);
  });

  it("keeps every estado label and count findable as text", () => {
    render(<ReportView responsable={undefined} cliente={undefined} />);
    for (const e of reporte.por_estado) {
      if (e.cantidad > 0) {
        expect(screen.getAllByText(e.cantidad).length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every cliente label and count findable as text", () => {
    render(<ReportView responsable={undefined} cliente={undefined} />);
    expect(screen.getByText("Alcaldía")).toBeInTheDocument();
    expect(screen.getAllByText("7").length).toBeGreaterThan(0);
    expect(screen.getByText("Fundación X")).toBeInTheDocument();
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("keeps every persona label and count findable as text", () => {
    render(<ReportView responsable={undefined} cliente={undefined} />);
    expect(screen.getAllByText("Ana").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Luis").length).toBeGreaterThan(0);
  });

  it("titles the report 'del equipo' when not filtering by self", () => {
    render(<ReportView responsable={undefined} cliente={undefined} />);
    expect(screen.getByText("Reporte de tareas del equipo")).toBeInTheDocument();
  });

  it("titles the report 'Mi reporte' when filtering by the current user", () => {
    meQuery.data = { id: "u1", nombre: "Ana", rol: "COLABORADOR" };
    render(<ReportView responsable="u1" cliente={undefined} />);
    expect(screen.getByText("Mi reporte de tareas")).toBeInTheDocument();
  });
});

describe("ReportView — estado/cliente como barras (PR 18)", () => {
  it("lists zero-count estados as text instead of empty bars", () => {
    const conCeros: TaskReportResponse = {
      ...reporte,
      por_estado: [
        { estado: "POR_HACER", cantidad: 2 },
        { estado: "COMPLETADA", cantidad: 6 },
        { estado: "EN_CURSO", cantidad: 0 },
        { estado: "BLOQUEADA", cantidad: 0 },
      ],
    };
    reportQuery.data = conCeros;
    render(<ReportView responsable={undefined} cliente={undefined} />);

    expect(screen.getByText("Sin tareas en: En curso, Bloqueada.")).toBeInTheDocument();
    expect(screen.getByText("Por hacer")).toBeInTheDocument();
  });

  it("renders the cliente ranking as bars with top-8 + '+N clientes más'", () => {
    const muchos: TaskReportResponse = {
      ...reporte,
      por_cliente: Array.from({ length: 10 }, (_, i) => ({
        id: `c${i}`,
        nombre: `Cliente ${i}`,
        cantidad: 10 - i,
      })),
    };
    reportQuery.data = muchos;
    render(<ReportView responsable={undefined} cliente={undefined} />);

    expect(screen.getByText("Cliente 0")).toBeInTheDocument();
    expect(screen.getByText("Cliente 7")).toBeInTheDocument();
    expect(screen.queryByText("Cliente 8")).not.toBeInTheDocument();
    expect(screen.getByText("+2 clientes más.")).toBeInTheDocument();
  });
});

describe("ReportView — vencimientos y carga semanal (PR 20)", () => {
  it("renders the vencimientos buckets with counts as text", () => {
    render(<ReportView responsable={undefined} cliente={undefined} />);
    expect(screen.getByText("Vencimientos por antigüedad")).toBeInTheDocument();
    expect(screen.getByText("menos de 1 semana")).toBeInTheDocument();
    expect(screen.getByText("más de 1 mes")).toBeInTheDocument();
    expect(screen.getByText("sin fecha de entrega")).toBeInTheDocument();
    // Los buckets tienen conteo > 0 en el fixture.
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
  });

  it("makes the weekly load readable with the CSS off (caption + sr-only list)", () => {
    render(<ReportView responsable={undefined} cliente={undefined} />);
    expect(screen.getByText("Carga por semana de entrega")).toBeInTheDocument();
    // El caption sr-only y la lista sr-only portan el dato (el Sparkline es
    // aria-hidden y nunca puede ser el único portador).
    expect(screen.getByText(/Carga por semana de entrega \(3 semanas, 9 tareas\)/)).toBeInTheDocument();
  });
});

describe("ReportView — tendencia de cierre (PR 22)", () => {
  it("renders the cierre trend with its sr-only caption and series", () => {
    render(<ReportView responsable={undefined} cliente={undefined} />);
    expect(screen.getByText("Tendencia de cierre")).toBeInTheDocument();
    expect(screen.getAllByText(/6 tareas completadas/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Tendencia de cierre: 6 tareas completadas en 3 semanas/)).toBeInTheDocument();
    expect(screen.getByText("2026-08-03: 1")).toBeInTheDocument();
    expect(screen.getByText("2026-08-10: 3")).toBeInTheDocument();
  });
});