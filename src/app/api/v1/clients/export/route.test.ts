import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    cliente: {
      findMany: vi.fn(),
    },
    oportunidad: {
      groupBy: vi.fn(),
    },
    tarea: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
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

const baseClientRow = {
  id: "cli-1",
  nombre: "Acme",
  empresa: "Acme Corp",
  tipo_cliente: "EMPRESA_PRIVADA",
  estado: "PROSPECTO",
  prioridad: "ALTA",
  ubicacion: "Bogotá",
  responsable_id: "colab-1",
  updated_at: new Date("2026-01-01"),
  responsable: { nombre: "Colab Uno" },
};

function mockEnrichmentEmpty() {
  vi.mocked(db.oportunidad.groupBy).mockResolvedValue([]);
  vi.mocked(db.tarea.groupBy).mockResolvedValue([]);
  vi.mocked(db.tarea.findMany).mockResolvedValue([]);
}

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

beforeEach(() => {
  mockEnrichmentEmpty();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/clients/export", () => {
  it("returns an xlsx attachment for a full-access role", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findMany).mockResolvedValue([baseClientRow] as never);

    const res = await GET(new Request("http://localhost/api/v1/clients/export"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="clientes.xlsx"');
    const buffer = await res.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("scopes a COLABORADOR to their own clients (forces responsable_id in the where clause)", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findMany).mockResolvedValue([baseClientRow] as never);

    await GET(new Request("http://localhost/api/v1/clients/export?responsable=other-user"));

    expect(db.cliente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ responsable_id: "colab-1" }),
      }),
    );
  });

  it("does not force responsable_id for a full-access role", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findMany).mockResolvedValue([]);

    await GET(new Request("http://localhost/api/v1/clients/export?responsable=other-user"));

    expect(db.cliente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ responsable_id: "other-user" }),
      }),
    );
  });

  it("returns 400 for an invalid tipo filter", async () => {
    authAs(gerencia);

    const res = await GET(new Request("http://localhost/api/v1/clients/export?tipo=NOT_REAL"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.cliente.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 when 'desde' is after 'hasta'", async () => {
    authAs(gerencia);

    const res = await GET(
      new Request("http://localhost/api/v1/clients/export?desde=2026-02-01&hasta=2026-01-01"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      error: "La fecha final no puede ser anterior a la inicial.",
    });
  });

  // PR 6 (close-phase-1): same audit contract as tasks/export. The auditoria
  // row carries quien/cuando/cuantas filas/filtros — best-effort.
  describe("audited export (PR 6)", () => {
    it("calls logAudit with accion='exportar', rows and applied filters", async () => {
      authAs(gerencia);
      vi.mocked(db.cliente.findMany).mockResolvedValue([baseClientRow] as never);
      vi.mocked(db.tarea.groupBy).mockResolvedValue([] as never);
      vi.mocked(db.oportunidad.groupBy).mockResolvedValue([] as never);

      await GET(
        new Request(
          "http://localhost/api/v1/clients/export?tipo=EMPRESA_PRIVADA&estado=PROSPECTO",
        ),
      );

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          entidad: "cliente",
          accion: "exportar",
          usuario_id: gerencia.id,
          cambios: expect.objectContaining({
            rows: expect.any(Number),
            filters: expect.objectContaining({
              tipo: "EMPRESA_PRIVADA",
              estado: "PROSPECTO",
            }),
          }),
        }),
      );
    });

    it("returns 200 even when logAudit throws (audit is best-effort)", async () => {
      authAs(gerencia);
      vi.mocked(db.cliente.findMany).mockResolvedValue([]);
      vi.mocked(db.tarea.groupBy).mockResolvedValue([] as never);
      vi.mocked(db.oportunidad.groupBy).mockResolvedValue([] as never);
      vi.mocked(logAudit).mockRejectedValueOnce(new Error("audit down"));

      const res = await GET(new Request("http://localhost/api/v1/clients/export"));

      expect(res.status).toBe(200);
    });
  });
});
