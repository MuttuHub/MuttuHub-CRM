import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiRole: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    setting: { findUnique: vi.fn() },
    documento: { findMany: vi.fn(), count: vi.fn() },
    documentoVersion: { groupBy: vi.fn(), findMany: vi.fn() },
    documentoCliente: { findMany: vi.fn() },
    usuario: { findMany: vi.fn() },
    auditoria: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { requireApiRole } from "@/lib/supabase/server";
import { GET } from "./route";

const coordinador = { id: "coord-1", nombre: "Coord Uno", rol: "COORDINADOR" } as Usuario;

function trashedRow(overrides: Partial<{ id: string; categoria: string; deleted_at: Date }> = {}) {
  return {
    id: overrides.id ?? "doc-1",
    titulo: "Informe final",
    categoria: overrides.categoria ?? "Comercial",
    etiquetas: [],
    autor_id: "user-1",
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    deleted_at: overrides.deleted_at ?? new Date("2026-11-10T12:00:00.000Z"),
  };
}

function trashRequest(query = ""): Request {
  return new Request(`http://localhost/api/v1/documents/trash${query}`);
}

beforeEach(() => {
  vi.mocked(requireApiRole).mockResolvedValue({
    ok: true,
    usuario: coordinador,
    supabaseUser: {} as never,
  });
  // No settings row -> factory catalog (Legal / Administrativo-financiero restricted).
  vi.mocked(db.setting.findUnique).mockResolvedValue(null);
  vi.mocked(db.documento.findMany).mockResolvedValue([]);
  vi.mocked(db.documento.count).mockResolvedValue(0);
  vi.mocked(db.documentoVersion.groupBy).mockResolvedValue([]);
  vi.mocked(db.documentoVersion.findMany).mockResolvedValue([]);
  vi.mocked(db.documentoCliente.findMany).mockResolvedValue([]);
  vi.mocked(db.usuario.findMany).mockResolvedValue([]);
  vi.mocked(db.auditoria.findMany).mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/documents/trash", () => {
  it("is gated to ADMINISTRADOR, GERENCIA and COORDINADOR (403 for a COLABORADOR)", async () => {
    const forbidden = new Response(
      JSON.stringify({ error: "No tienes permisos para realizar esta acción.", code: "FORBIDDEN" }),
      { status: 403 },
    );
    vi.mocked(requireApiRole).mockResolvedValue({ ok: false, response: forbidden });

    const res = await GET(trashRequest());

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(requireApiRole).toHaveBeenCalledWith(["ADMINISTRADOR", "GERENCIA", "COORDINADOR"]);
    expect(db.documento.findMany).not.toHaveBeenCalled();
  });

  it("lists only deleted documents, newest deletion first, with who deleted them", async () => {
    vi.mocked(db.documento.findMany).mockResolvedValue([
      trashedRow({ id: "doc-1" }),
      trashedRow({ id: "doc-2", deleted_at: new Date("2026-11-01T08:00:00.000Z") }),
    ] as never);
    vi.mocked(db.documento.count).mockResolvedValue(2);
    vi.mocked(db.auditoria.findMany).mockResolvedValue([
      { entidad_id: "doc-1", usuario: { nombre: "Gerente Dos" } },
      { entidad_id: "doc-1", usuario: { nombre: "Alguien Antes" } },
    ] as never);
    vi.mocked(db.usuario.findMany).mockResolvedValue([{ id: "user-1", nombre: "Ana" }] as never);

    const res = await GET(trashRequest("?page=1&limit=10"));

    expect(res.status).toBe(200);
    const args = vi.mocked(db.documento.findMany).mock.calls[0]![0]!;
    expect((args.where as { deleted_at?: unknown }).deleted_at).toEqual({ not: null });
    expect(args.orderBy).toEqual({ deleted_at: "desc" });
    expect(args.skip).toBe(0);
    expect(args.take).toBe(10);
    const countWhere = vi.mocked(db.documento.count).mock.calls[0]![0]!.where as { deleted_at?: unknown };
    expect(countWhere.deleted_at).toEqual({ not: null });
    expect(db.auditoria.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entidad: "documento", accion: "eliminar", entidad_id: { in: ["doc-1", "doc-2"] } },
      }),
    );

    const body = await res.json();
    expect(body).toMatchObject({ page: 1, limit: 10, total: 2 });
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      id: "doc-1",
      titulo: "Informe final",
      autor_nombre: "Ana",
      deleted_at: "2026-11-10T12:00:00.000Z",
      eliminado_por_nombre: "Gerente Dos",
    });
    expect(body.items[1]).toMatchObject({ id: "doc-2", eliminado_por_nombre: null });
  });

  it("does not restrict categories for a role that can read restricted documents", async () => {
    await GET(trashRequest());

    const where = vi.mocked(db.documento.findMany).mock.calls[0]![0]!.where as { categoria?: unknown };
    expect(where.categoria).toBeUndefined();
  });

  it("applies the list's restricted-category rule to an actor that cannot read them", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({
      ok: true,
      usuario: { id: "colab-1", nombre: "Colab", rol: "COLABORADOR" } as Usuario,
      supabaseUser: {} as never,
    });

    await GET(trashRequest());

    const where = vi.mocked(db.documento.findMany).mock.calls[0]![0]!.where as {
      categoria?: { notIn?: string[] };
      deleted_at?: unknown;
    };
    expect(where.categoria?.notIn).toEqual(["Legal", "Administrativo-financiero"]);
    expect(where.deleted_at).toEqual({ not: null });
  });

  it("returns 400 for an invalid page", async () => {
    const res = await GET(trashRequest("?page=0"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
