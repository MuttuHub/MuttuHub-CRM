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
    cliente: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/audit", () => ({ logAudit: vi.fn() }));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logAudit } from "@/lib/api/audit";
import { GET } from "./route";

const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

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
    titulo: overrides.titulo ?? "Tarea propia",
    estado: overrides.estado ?? "EN_CURSO",
    fecha_entrega: overrides.fecha_entrega === undefined ? new Date("2020-01-01") : overrides.fecha_entrega,
    origen: overrides.origen ?? "KANBAN",
  };
}

function clienteAsignado(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "cli-1",
    nombre: overrides.nombre ?? "Acme",
    estado: overrides.estado ?? "PROSPECTO",
    prioridad: overrides.prioridad ?? "ALTA",
  };
}

function mockCollections(tareas: unknown[], clientes: unknown[] = []) {
  vi.mocked(db.tarea.findMany).mockResolvedValue(tareas as never);
  vi.mocked(db.cliente.findMany).mockResolvedValue(clientes as never);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/dashboard/my-summary/export", () => {
  it("returns an xlsx attachment with 'Activas', 'Vencidas' and 'Clientes asignados' sheets", async () => {
    authAs(colaborador);
    mockCollections([]);

    const res = await GET(new Request("http://localhost/api/v1/dashboard/my-summary/export"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="mi-resumen.xlsx"',
    );

    const buffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    expect(workbook.getWorksheet("Activas")).toBeDefined();
    expect(workbook.getWorksheet("Vencidas")).toBeDefined();
    expect(workbook.getWorksheet("Clientes asignados")).toBeDefined();
  });

  it("returns 400 for a malformed 'desde' filter", async () => {
    authAs(colaborador);

    const res = await GET(
      new Request("http://localhost/api/v1/dashboard/my-summary/export?desde=not-a-date"),
    );

    expect(res.status).toBe(400);
    expect(db.tarea.findMany).not.toHaveBeenCalled();
  });

  it("always scopes to the caller (own) regardless of role", async () => {
    authAs(colaborador);
    mockCollections([]);

    await GET(new Request("http://localhost/api/v1/dashboard/my-summary/export"));

    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<
      string,
      unknown
    >;
    expect(where.responsable_id).toBe(colaborador.id);
  });

  it("writes activas rows and splits vencidas (fecha_entrega in the past) into its own sheet", async () => {
    authAs(colaborador);
    mockCollections([
      tarea({ id: "t-vencida", titulo: "Tarea vencida", fecha_entrega: new Date("2020-01-01") }),
      tarea({ id: "t-futura", titulo: "Tarea futura", fecha_entrega: new Date("2099-01-01") }),
    ]);

    const res = await GET(new Request("http://localhost/api/v1/dashboard/my-summary/export"));
    const buffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    const activas = workbook.getWorksheet("Activas")!;
    expect(activas.rowCount).toBe(3); // header + 2

    const vencidas = workbook.getWorksheet("Vencidas")!;
    expect(vencidas.rowCount).toBe(2); // header + 1
    expect(vencidas.getRow(2).getCell(1).value).toBe("Tarea vencida");
  });

  it("writes clientes_asignados rows with estado/prioridad labels", async () => {
    authAs(colaborador);
    mockCollections([], [clienteAsignado()]);

    const res = await GET(new Request("http://localhost/api/v1/dashboard/my-summary/export"));
    const buffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Clientes asignados")!;
    const row = sheet.getRow(2);

    expect(row.getCell(1).value).toBe("Acme");
  });

  it("caps each sheet at 500 rows (EXPORT_MAX_ROWS)", async () => {
    authAs(colaborador);
    const tareas = Array.from({ length: 501 }, (_, i) =>
      tarea({ id: `t-${i}`, fecha_entrega: new Date("2020-01-01") }),
    );
    mockCollections(tareas);

    const res = await GET(new Request("http://localhost/api/v1/dashboard/my-summary/export"));
    const buffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    expect(workbook.getWorksheet("Activas")!.rowCount).toBe(501);
    expect(workbook.getWorksheet("Vencidas")!.rowCount).toBe(501);
  });

  describe("audited export (PR 6 pattern)", () => {
    it("calls logAudit with entidad='dashboard', accion='exportar', rows and filters", async () => {
      authAs(colaborador);
      mockCollections([tarea()], [clienteAsignado()]);

      await GET(
        new Request(
          "http://localhost/api/v1/dashboard/my-summary/export?tipo_cliente=EMPRESA_PRIVADA",
        ),
      );

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          entidad: "dashboard",
          accion: "exportar",
          usuario_id: colaborador.id,
          cambios: expect.objectContaining({
            cara: "my-summary",
            filters: expect.objectContaining({ tipo_cliente: "EMPRESA_PRIVADA" }),
          }),
        }),
      );
    });

    it("returns 200 even when logAudit throws (audit is best-effort)", async () => {
      authAs(colaborador);
      mockCollections([]);
      vi.mocked(logAudit).mockRejectedValueOnce(new Error("audit down"));

      const res = await GET(new Request("http://localhost/api/v1/dashboard/my-summary/export"));

      expect(res.status).toBe(200);
    });
  });
});
