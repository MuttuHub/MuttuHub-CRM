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
  },
}));

vi.mock("@/lib/api/audit", () => ({ logAudit: vi.fn() }));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logAudit } from "@/lib/api/audit";
import { GET } from "./route";

const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function tarea(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "t-1",
    estado: overrides.estado ?? "COMPLETADA",
    fecha_entrega: overrides.fecha_entrega ?? new Date("2026-01-10"),
    updated_at: overrides.updated_at ?? new Date("2026-01-05"),
    completed_at: overrides.completed_at ?? new Date("2026-01-05"),
    responsable_id: overrides.responsable_id ?? "resp-1",
    responsable: overrides.responsable ?? { nombre: "Responsable Uno" },
  };
}

function vencidaTarea(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "v-1",
    titulo: overrides.titulo ?? "Tarea vencida",
    fecha_entrega: overrides.fecha_entrega ?? new Date("2026-01-01"),
    responsable: overrides.responsable ?? { nombre: "Responsable Uno" },
    cliente: overrides.cliente ?? { nombre: "Cliente Uno" },
  };
}

function mockQueries(tareas: unknown[], vencidas: unknown[]) {
  vi.mocked(db.tarea.findMany)
    .mockResolvedValueOnce(tareas as never) // enRango
    .mockResolvedValueOnce(vencidas as never); // vencidas
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/dashboard/tasks/export", () => {
  it("returns an xlsx attachment with 'Cumplimiento' and 'Vencidas' sheets", async () => {
    authAs(coordinador);
    mockQueries([], []);

    const res = await GET(new Request("http://localhost/api/v1/dashboard/tasks/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="tareas-dashboard.xlsx"',
    );

    const buffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    expect(workbook.getWorksheet("Cumplimiento")).toBeDefined();
    expect(workbook.getWorksheet("Vencidas")).toBeDefined();
  });

  it("returns 400 for a malformed 'desde' filter", async () => {
    authAs(coordinador);

    const res = await GET(
      new Request("http://localhost/api/v1/dashboard/tasks/export?desde=not-a-date"),
    );

    expect(res.status).toBe(400);
    expect(db.tarea.findMany).not.toHaveBeenCalled();
  });

  it("does not scope a COLABORADOR — reading is global, no forced responsable_id", async () => {
    authAs({ id: "colab-1", rol: "COLABORADOR" } as Usuario);
    mockQueries([], []);

    await GET(new Request("http://localhost/api/v1/dashboard/tasks/export"));

    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<
      string,
      unknown
    >;
    expect(where.responsable_id).toBeUndefined();
  });

  it("writes cumplimiento rows with total/completadas/cumplidas/porc", async () => {
    authAs(coordinador);
    mockQueries([tarea({ id: "t-1" })], []);

    const res = await GET(new Request("http://localhost/api/v1/dashboard/tasks/export"));
    const buffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Cumplimiento")!;
    const row = sheet.getRow(2);

    expect(row.getCell(1).value).toBe("Responsable Uno");
    expect(row.getCell(2).value).toBe(1); // total
    expect(row.getCell(3).value).toBe(1); // completadas
    expect(row.getCell(4).value).toBe(1); // cumplidas
    expect(row.getCell(5).value).toBe(100); // porc
  });

  it("writes vencidas rows with titulo/responsable/cliente/fecha_entrega", async () => {
    authAs(coordinador);
    mockQueries([], [vencidaTarea()]);

    const res = await GET(new Request("http://localhost/api/v1/dashboard/tasks/export"));
    const buffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Vencidas")!;
    const row = sheet.getRow(2);

    expect(row.getCell(1).value).toBe("Tarea vencida");
    expect(row.getCell(2).value).toBe("Responsable Uno");
    expect(row.getCell(3).value).toBe("Cliente Uno");
  });

  it("caps the vencidas sheet at 500 rows (EXPORT_MAX_ROWS), beyond the 20-row widget preview", async () => {
    authAs(coordinador);
    const vencidas = Array.from({ length: 501 }, (_, i) => vencidaTarea({ id: `v-${i}` }));
    mockQueries([], vencidas);

    const res = await GET(new Request("http://localhost/api/v1/dashboard/tasks/export"));
    const buffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Vencidas")!;

    expect(sheet.rowCount).toBe(501); // header + 500 rows
  });

  describe("audited export (PR 6 pattern)", () => {
    it("calls logAudit with entidad='dashboard', accion='exportar', rows and filters", async () => {
      authAs(coordinador);
      mockQueries([tarea({ id: "t-1" })], [vencidaTarea()]);

      await GET(
        new Request("http://localhost/api/v1/dashboard/tasks/export?responsable_id=rep-1"),
      );

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          entidad: "dashboard",
          accion: "exportar",
          usuario_id: coordinador.id,
          cambios: expect.objectContaining({
            rows: 2,
            cara: "tasks",
            filters: expect.objectContaining({ responsable_id: "rep-1" }),
          }),
        }),
      );
    });

    it("returns 200 even when logAudit throws (audit is best-effort)", async () => {
      authAs(coordinador);
      mockQueries([], []);
      vi.mocked(logAudit).mockRejectedValueOnce(new Error("audit down"));

      const res = await GET(new Request("http://localhost/api/v1/dashboard/tasks/export"));

      expect(res.status).toBe(200);
    });
  });
});
