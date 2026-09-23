import { afterEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    oportunidad: {
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
const colaboradorSinFlag = {
  id: "colab-2",
  rol: "COLABORADOR",
  gestiona_oportunidades: false,
} as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function oportunidad(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "op-1",
    estado: overrides.estado ?? "PRESENTADA",
    valor_estimado_cop: overrides.valor_estimado_cop ?? 1000,
    cliente: overrides.cliente ?? { id: "cli-1", nombre: "Cliente A" },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/dashboard/pipeline/export", () => {
  it("returns an xlsx attachment", async () => {
    authAs(coordinador);
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/v1/dashboard/pipeline/export"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="pipeline.xlsx"');
  });

  it("returns 400 for a malformed 'desde' filter", async () => {
    authAs(coordinador);

    const res = await GET(
      new Request("http://localhost/api/v1/dashboard/pipeline/export?desde=not-a-date"),
    );

    expect(res.status).toBe(400);
    expect(db.oportunidad.findMany).not.toHaveBeenCalled();
  });

  it("honors the responsable_id filter", async () => {
    authAs(coordinador);
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([]);

    await GET(
      new Request("http://localhost/api/v1/dashboard/pipeline/export?responsable_id=rep-9"),
    );

    const where = vi.mocked(db.oportunidad.findMany).mock.calls[0]![0]!.where as Record<
      string,
      unknown
    >;
    expect(where.cliente).toEqual({ deleted_at: null, responsable_id: "rep-9" });
  });

  it("exports the full ranked client list, not just the top 5 shown on the widget", async () => {
    authAs(coordinador);
    const oportunidades = Array.from({ length: 8 }, (_, i) =>
      oportunidad({
        id: `op-${i}`,
        cliente: { id: `cli-${i}`, nombre: `Cliente ${i}` },
        valor_estimado_cop: 1000 + i,
      }),
    );
    vi.mocked(db.oportunidad.findMany).mockResolvedValue(oportunidades as never);

    const res = await GET(new Request("http://localhost/api/v1/dashboard/pipeline/export"));
    const buffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Pipeline")!;

    expect(sheet.rowCount).toBe(9); // header + 8 clients
  });

  it("returns zeroed/hidden rows for a COLABORADOR without gestiona_oportunidades", async () => {
    authAs(colaboradorSinFlag);

    const res = await GET(new Request("http://localhost/api/v1/dashboard/pipeline/export"));
    const buffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("Pipeline")!;

    expect(res.status).toBe(200);
    expect(db.oportunidad.findMany).not.toHaveBeenCalled();
    expect(sheet.rowCount).toBe(1); // header only
  });

  describe("audited export (PR 6 pattern)", () => {
    it("calls logAudit with entidad='dashboard', accion='exportar', rows and filters", async () => {
      authAs(coordinador);
      vi.mocked(db.oportunidad.findMany).mockResolvedValue([oportunidad()] as never);

      await GET(
        new Request(
          "http://localhost/api/v1/dashboard/pipeline/export?tipo_cliente=EMPRESA_PRIVADA",
        ),
      );

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          entidad: "dashboard",
          accion: "exportar",
          usuario_id: coordinador.id,
          cambios: expect.objectContaining({
            rows: 1,
            cara: "pipeline",
            filters: expect.objectContaining({ tipo_cliente: "EMPRESA_PRIVADA" }),
          }),
        }),
      );
    });

    it("returns 200 even when logAudit throws (audit is best-effort)", async () => {
      authAs(coordinador);
      vi.mocked(db.oportunidad.findMany).mockResolvedValue([]);
      vi.mocked(logAudit).mockRejectedValueOnce(new Error("audit down"));

      const res = await GET(new Request("http://localhost/api/v1/dashboard/pipeline/export"));

      expect(res.status).toBe(200);
    });
  });
});
