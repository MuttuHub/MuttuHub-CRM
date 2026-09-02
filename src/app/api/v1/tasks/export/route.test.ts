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
