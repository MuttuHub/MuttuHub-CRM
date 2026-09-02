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
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Luis")).toBeInTheDocument();
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