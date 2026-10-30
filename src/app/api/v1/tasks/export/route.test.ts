import { afterEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    tarea: {
      findMany: vi.fn(),
    },
    subtarea: {
      groupBy: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/audit", () => ({ logAudit: vi.fn() }));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logAudit } from "@/lib/api/audit";
import { GET } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

function exportRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "task-1",
    titulo: overrides.titulo ?? "Tarea uno",
    descripcion: overrides.descripcion ?? null,
    estado: overrides.estado ?? "EN_CURSO",
    origen: overrides.origen ?? "KANBAN",
    prioridad: overrides.prioridad ?? null,
    fecha_entrega: overrides.fecha_entrega ?? null,
    etiquetas: overrides.etiquetas ?? [],
    motivo_bloqueo: overrides.motivo_bloqueo ?? null,
    created_at: new Date("2026-01-01"),
    responsable: { nombre: "Colab Uno" },
    cliente: overrides.cliente_id ? { nombre: "Cliente Uno" } : null,
  };
}

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

describe("GET /api/v1/tasks/export", () => {
  it("returns an xlsx file with the expected headers", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    vi.mocked(db.subtarea.groupBy).mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/v1/tasks/export"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("Content-Disposition")).toContain("tareas.xlsx");
  });

  it("does not scope a COLABORADOR — reading is global, no forced responsable_id", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    vi.mocked(db.subtarea.groupBy).mockResolvedValue([]);

    await GET(new Request("http://localhost/api/v1/tasks/export"));

    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.responsable_id).toBeUndefined();
  });

  it("caps the export at 500 rows (EXPORT_MAX_ROWS)", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    vi.mocked(db.subtarea.groupBy).mockResolvedValue([]);

    await GET(new Request("http://localhost/api/v1/tasks/export"));

    expect(db.tarea.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
  });

  it("returns 400 for an invalid estado filter", async () => {
    authAs(gerencia);

    const res = await GET(new Request("http://localhost/api/v1/tasks/export?estado=NOT_REAL"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.tarea.findMany).not.toHaveBeenCalled();
  });

  it("applies the vencidas filter (estado open + fecha_entrega in the past) to the query", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    vi.mocked(db.subtarea.groupBy).mockResolvedValue([]);

    await GET(new Request("http://localhost/api/v1/tasks/export?vencidas=true"));

    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.fecha_entrega).toEqual({ lt: expect.any(Date) });
    expect(where.estado).toEqual({ notIn: ["COMPLETADA", "CANCELADA"] });
  });

  it("writes rows with translated labels and the completed/total subtareas format", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findMany).mockResolvedValue([
      exportRow({ id: "task-1", estado: "BLOQUEADA", motivo_bloqueo: "Esperando insumos" }),
    ] as never);
    vi.mocked(db.subtarea.groupBy)
      .mockResolvedValueOnce([{ tarea_id: "task-1", _count: { _all: 4 } }] as never) // totales
      .mockResolvedValueOnce([{ tarea_id: "task-1", _count: { _all: 1 } }] as never); // completadas

    const res = await GET(new Request("http://localhost/api/v1/tasks/export"));
    const buffer = await res.arrayBuffer();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Tareas")!;
    const row = sheet.getRow(2);
    expect(row.getCell(1).value).toBe("Tarea uno");
    expect(row.getCell(5).value).toBe("Bloqueada");
    expect(row.getCell(10).value).toBe("Esperando insumos");
    expect(row.getCell(11).value).toBe("1/4");
  });

  // Jefe 2026-10-28, lane 2 task 2.4b (S5): the Reportes › Tareas Excel must
  // export the period the report shows. `rango` has the same semantics as
  // GET /tasks/report (completadas by completed_at, open ones by updated_at);
  // without `rango` the export keeps exporting every task, as before.
  describe("period filter (rango, S5)", () => {
    it("filters by the same period as the report when rango is given", async () => {
      authAs(gerencia);
      vi.mocked(db.tarea.findMany).mockResolvedValue([]);
      vi.mocked(db.subtarea.groupBy).mockResolvedValue([]);
      const antes = Date.now();

      const res = await GET(new Request("http://localhost/api/v1/tasks/export?rango=week"));

      expect(res.status).toBe(200);
      const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
      const or = where.OR as { updated_at?: { gte: Date }; completed_at?: { gte: Date } }[];
      expect(or).toEqual([
        { estado: { not: "COMPLETADA" }, updated_at: { gte: expect.any(Date) } },
        { estado: "COMPLETADA", completed_at: { gte: expect.any(Date) } },
      ]);
      const desde = or[1].completed_at!.gte.getTime();
      const sieteDias = 7 * 24 * 60 * 60 * 1000;
      expect(desde).toBeGreaterThanOrEqual(antes - sieteDias);
      expect(desde).toBeLessThanOrEqual(Date.now() - sieteDias);
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          cambios: expect.objectContaining({ filters: expect.objectContaining({ rango: "week" }) }),
        }),
      );
    });

    it("keeps exporting every task (no date filter) when rango is absent", async () => {
      authAs(gerencia);
      vi.mocked(db.tarea.findMany).mockResolvedValue([]);
      vi.mocked(db.subtarea.groupBy).mockResolvedValue([]);

      const res = await GET(new Request("http://localhost/api/v1/tasks/export"));

      expect(res.status).toBe(200);
      const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
      expect(where).toEqual({ deleted_at: null });
      const cambios = vi.mocked(logAudit).mock.calls[0]![0]!.cambios as { filters: Record<string, unknown> };
      expect(cambios.filters).not.toHaveProperty("rango");
    });

    it("does not filter by date for rango=all", async () => {
      authAs(gerencia);
      vi.mocked(db.tarea.findMany).mockResolvedValue([]);
      vi.mocked(db.subtarea.groupBy).mockResolvedValue([]);

      await GET(new Request("http://localhost/api/v1/tasks/export?rango=all"));

      const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
      expect(where.OR).toBeUndefined();
      expect(where.AND).toBeUndefined();
    });

    it("returns 400 for an invalid rango, without querying", async () => {
      authAs(gerencia);

      const res = await GET(new Request("http://localhost/api/v1/tasks/export?rango=NOT_REAL"));

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
      expect(db.tarea.findMany).not.toHaveBeenCalled();
    });
  });

  // PR 6: exports are audited (global-task-board spec §"Exports are audited").
  // The audit row carries quien/cuando/cuantas filas/filtros. logAudit is
  // best-effort (it swallows its own errors), so a throw in the audit path
  // must NOT fail the export — the file is still the user's primary deliverable.
  describe("audited export (PR 6)", () => {
    it("calls logAudit with accion='exportar', rows and applied filters", async () => {
      authAs(gerencia);
      vi.mocked(db.tarea.findMany).mockResolvedValue([
        exportRow({ id: "task-1" }),
        exportRow({ id: "task-2" }),
        exportRow({ id: "task-3" }),
      ] as never);
      vi.mocked(db.subtarea.groupBy).mockResolvedValue([]);

      await GET(
        new Request(
          "http://localhost/api/v1/tasks/export?prioridad=ALTA&etiqueta=legal&estado=EN_CURSO",
        ),
      );

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          entidad: "tarea",
          accion: "exportar",
          usuario_id: gerencia.id,
          cambios: expect.objectContaining({
            rows: 3,
            filters: expect.objectContaining({
              prioridad: "ALTA",
              etiqueta: "legal",
              estado: "EN_CURSO",
            }),
          }),
        }),
      );
    });

    it("records zero rows when the export comes back empty", async () => {
      authAs(gerencia);
      vi.mocked(db.tarea.findMany).mockResolvedValue([]);
      vi.mocked(db.subtarea.groupBy).mockResolvedValue([]);

      await GET(new Request("http://localhost/api/v1/tasks/export"));

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: "exportar",
          cambios: expect.objectContaining({ rows: 0 }),
        }),
      );
    });

    it("returns 200 even when logAudit throws (audit is best-effort)", async () => {
      authAs(gerencia);
      vi.mocked(db.tarea.findMany).mockResolvedValue([]);
      vi.mocked(db.subtarea.groupBy).mockResolvedValue([]);
      vi.mocked(logAudit).mockRejectedValueOnce(new Error("audit down"));

      const res = await GET(new Request("http://localhost/api/v1/tasks/export"));

      expect(res.status).toBe(200);
    });
  });
});
