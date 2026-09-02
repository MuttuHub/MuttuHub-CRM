import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    tarea: {
      findMany: vi.fn(),
    },
    usuario: {
      findMany: vi.fn(),
    },
    cliente: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "gerencia-1", nombre: "Gerente Uno", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", nombre: "Colab Uno", rol: "COLABORADOR" } as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/tasks/report", () => {
  it("returns 400 for an invalid rango", async () => {
    authAs(gerencia);

    const res = await GET(new Request("http://localhost/api/v1/tasks/report?rango=NOT_REAL"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.tarea.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid estado filter (shared parseTaskFilters)", async () => {
    authAs(gerencia);

    const res = await GET(new Request("http://localhost/api/v1/tasks/report?estado=NOT_REAL"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("does not scope a COLABORADOR — reading is global, no forced responsable_id", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    vi.mocked(db.usuario.findMany).mockResolvedValue([
      { id: "colab-1", nombre: "Colab Uno" },
    ] as never);

    const res = await GET(new Request("http://localhost/api/v1/tasks/report?rango=all"));

    expect(res.status).toBe(200);
    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.responsable_id).toBeUndefined();
    expect(db.usuario.findMany).toHaveBeenCalled();
  });

  it("lists every active user, for any role (COLABORADOR included)", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    vi.mocked(db.usuario.findMany).mockResolvedValue([
      { id: "r1", nombre: "Responsable Uno" },
      { id: "r2", nombre: "Responsable Dos" },
    ] as never);

    const res = await GET(new Request("http://localhost/api/v1/tasks/report?rango=all"));

    const json = await res.json();
    expect(json.por_persona).toHaveLength(2);
  });

  it("lists every active user for a full-access role", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    vi.mocked(db.usuario.findMany).mockResolvedValue([
      { id: "r1", nombre: "Responsable Uno" },
      { id: "r2", nombre: "Responsable Dos" },
    ] as never);

    const res = await GET(new Request("http://localhost/api/v1/tasks/report?rango=all"));

    const json = await res.json();
    expect(json.por_persona).toHaveLength(2);
  });

  it("aggregates resumen, por_persona, por_estado and por_cliente correctly", async () => {
    authAs(gerencia);
    vi.mocked(db.usuario.findMany).mockResolvedValue([
      { id: "r1", nombre: "Responsable Uno" },
      { id: "r2", nombre: "Responsable Dos" },
    ] as never);
    vi.mocked(db.tarea.findMany).mockResolvedValue([
      // r1 / c1 — completada a tiempo (updated_at <= fecha_entrega)
      {
        id: "t1",
        responsable_id: "r1",
        cliente_id: "c1",
        estado: "COMPLETADA",
        fecha_entrega: new Date("2026-01-10"),
        updated_at: new Date("2026-01-05"),
      },
      // r1 / c1 — completada tarde (updated_at > fecha_entrega)
      {
        id: "t2",
        responsable_id: "r1",
        cliente_id: "c1",
        estado: "COMPLETADA",
        fecha_entrega: new Date("2026-01-01"),
        updated_at: new Date("2026-01-05"),
      },
      // r2 / c2 — abierta y vencida (fecha_entrega in the past)
      {
        id: "t3",
        responsable_id: "r2",
        cliente_id: "c2",
        estado: "EN_CURSO",
        fecha_entrega: new Date("2000-01-01"),
        updated_at: new Date("2026-01-01"),
      },
    ] as never);
    vi.mocked(db.cliente.findMany).mockResolvedValue([
      { id: "c1", nombre: "Cliente Uno" },
      { id: "c2", nombre: "Cliente Dos" },
    ] as never);

    const res = await GET(new Request("http://localhost/api/v1/tasks/report?rango=all"));

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.resumen).toEqual({
      total_asignadas: 3,
      vencidas_activas: 1,
      completadas: 2,
      tasa_cumplimiento: 67,
      a_tiempo: 1,
      tarde: 1,
    });

    expect(json.por_persona).toEqual([
      expect.objectContaining({
        id: "r1",
        asignadas: 2,
        en_curso: 0,
        vencidas: 0,
        completadas: 2,
        a_tiempo: 1,
        tarde: 1,
      }),
      expect.objectContaining({
        id: "r2",
        asignadas: 1,
        en_curso: 1,
        vencidas: 1,
        completadas: 0,
        a_tiempo: 0,
        tarde: 0,
      }),
    ]);

    const estadoCompletada = json.por_estado.find((e: { estado: string }) => e.estado === "COMPLETADA");
    const estadoEnCurso = json.por_estado.find((e: { estado: string }) => e.estado === "EN_CURSO");
    const estadoCancelada = json.por_estado.find((e: { estado: string }) => e.estado === "CANCELADA");
    expect(estadoCompletada.cantidad).toBe(2);
    expect(estadoEnCurso.cantidad).toBe(1);
    expect(estadoCancelada.cantidad).toBe(0); // full catalog is present, zeros included

    expect(json.por_cliente).toEqual([
      { id: "c1", nombre: "Cliente Uno", cantidad: 2 },
      { id: "c2", nombre: "Cliente Dos", cantidad: 1 },
    ]);

    // PR 20: la única vencida (t3, 2000-01-01) es "más de 1 mes"; t1/t2
    // completadas no cuentan; sin abiertas sin fecha en este fixture.
    expect(json.vencimientos_por_antiguedad).toEqual([
      { bucket: "menos de 1 semana", cantidad: 0 },
      { bucket: "1 a 4 semanas", cantidad: 0 },
      { bucket: "más de 1 mes", cantidad: 1 },
      { bucket: "sin fecha de entrega", cantidad: 0 },
    ]);
    // Carga semanal: solo t3 tiene fecha_entrega (2000-01-01, sábado → lunes
    // de esa semana = 1999-12-27, cálculo UTC determinista).
    expect(json.carga_semanal).toEqual([
      { semana: "1999-12-27", cantidad: 1 },
    ]);
  });

  it("applies the range filter (rango=week -> updated_at >= 7 days ago) to the query", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    vi.mocked(db.usuario.findMany).mockResolvedValue([]);

    await GET(new Request("http://localhost/api/v1/tasks/report?rango=week"));

    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.updated_at).toEqual({ gte: expect.any(Date) });
  });

  it("does not filter by date for rango=all", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    vi.mocked(db.usuario.findMany).mockResolvedValue([]);

    await GET(new Request("http://localhost/api/v1/tasks/report?rango=all"));

    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.updated_at).toBeUndefined();
  });
});
