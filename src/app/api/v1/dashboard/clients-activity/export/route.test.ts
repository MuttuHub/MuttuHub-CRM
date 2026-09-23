import { afterEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    cliente: {
      findMany: vi.fn(),
    },
    bitacoraEntrada: {
      findMany: vi.fn(),
    },
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

function cliente(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "cli-1",
    nombre: overrides.nombre ?? "Acme",
    tipo_cliente: overrides.tipo_cliente ?? "EMPRESA_PRIVADA",
    estado: overrides.estado ?? "PROSPECTO",
    prioridad: overrides.prioridad ?? "ALTA",
    responsable_id: overrides.responsable_id ?? "resp-1",
    responsable: overrides.responsable ?? { nombre: "Responsable Uno" },
    bitacora: overrides.bitacora ?? [],
  };
}

function mockCollections(clientes: unknown[], gestiones: unknown[] = [], tareas: unknown[] = []) {
  vi.mocked(db.cliente.findMany).mockResolvedValue(clientes as never);
  vi.mocked(db.bitacoraEntrada.findMany).mockResolvedValue(gestiones as never);
  vi.mocked(db.tarea.findMany).mockResolvedValue(tareas as never);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/dashboard/clients-activity/export", () => {
  it("returns an xlsx attachment with 'Sin gestión' and 'Actividad por responsable' sheets", async () => {
    authAs(coordinador);
    mockCollections([]);

    const res = await GET(
      new Request("http://localhost/api/v1/dashboard/clients-activity/export"),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="actividad-clientes.xlsx"',
    );

    const buffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    expect(workbook.getWorksheet("Sin gestión")).toBeDefined();
    expect(workbook.getWorksheet("Actividad por responsable")).toBeDefined();
  });

  it("returns 400 for an invalid dias_sin_gestion", async () => {
    authAs(coordinador);

    const res = await GET(
      new Request(
        "http://localhost/api/v1/dashboard/clients-activity/export?dias_sin_gestion=999",
      ),
    );

    expect(res.status).toBe(400);
    expect(db.cliente.findMany).not.toHaveBeenCalled();
  });

  it("writes 'sin gestión' rows with estado/prioridad labels", async () => {
    authAs(coordinador);
    mockCollections([cliente({ ultima_gestion: null })]);

    const res = await GET(
      new Request("http://localhost/api/v1/dashboard/clients-activity/export"),
    );
    const buffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Sin gestión")!;
    const row = sheet.getRow(2);

    expect(row.getCell(1).value).toBe("Acme");
    expect(row.getCell(4).value).toBe("Responsable Uno");
  });

  it("writes actividad_por_responsable rows with gestiones and tareas_count", async () => {
    authAs(coordinador);
    mockCollections(
      [cliente({ id: "cli-1", responsable_id: "resp-1" })],
      [{ cliente_id: "cli-1" }],
      [{ cliente_id: "cli-1" }],
    );

    const res = await GET(
      new Request("http://localhost/api/v1/dashboard/clients-activity/export"),
    );
    const buffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Actividad por responsable")!;
    const row = sheet.getRow(2);

    expect(row.getCell(1).value).toBe("Responsable Uno");
    expect(row.getCell(2).value).toBe(1); // gestiones
    expect(row.getCell(3).value).toBe(1); // tareas_count
  });

  it("caps the 'sin gestión' sheet at 500 rows (EXPORT_MAX_ROWS), beyond the 25-row widget preview", async () => {
    authAs(coordinador);
    const clientes = Array.from({ length: 501 }, (_, i) =>
      cliente({ id: `cli-${i}`, responsable_id: `resp-${i}` }),
    );
    mockCollections(clientes);

    const res = await GET(
      new Request("http://localhost/api/v1/dashboard/clients-activity/export"),
    );
    const buffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Sin gestión")!;

    expect(sheet.rowCount).toBe(501); // header + 500 rows
  });

  describe("audited export (PR 6 pattern)", () => {
    it("calls logAudit with entidad='dashboard', accion='exportar', rows and filters", async () => {
      authAs(coordinador);
      mockCollections([cliente()]);

      await GET(
        new Request(
          "http://localhost/api/v1/dashboard/clients-activity/export?tipo_cliente=EMPRESA_PRIVADA",
        ),
      );

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          entidad: "dashboard",
          accion: "exportar",
          usuario_id: coordinador.id,
          cambios: expect.objectContaining({
            cara: "clients-activity",
            filters: expect.objectContaining({ tipo_cliente: "EMPRESA_PRIVADA" }),
          }),
        }),
      );
    });

    it("returns 200 even when logAudit throws (audit is best-effort)", async () => {
      authAs(coordinador);
      mockCollections([]);
      vi.mocked(logAudit).mockRejectedValueOnce(new Error("audit down"));

      const res = await GET(
        new Request("http://localhost/api/v1/dashboard/clients-activity/export"),
      );

      expect(res.status).toBe(200);
    });
  });
});
