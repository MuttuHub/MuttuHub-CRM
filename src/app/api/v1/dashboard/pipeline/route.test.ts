import { afterEach, describe, expect, it, vi } from "vitest";
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

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const colaborador = {
  id: "colab-1",
  rol: "COLABORADOR",
} as Usuario;

const coordinador = {
  id: "coord-1",
  rol: "COORDINADOR",
} as Usuario;

function mockAuth(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function get(qs = ""): Request {
  return new Request(`http://localhost/api/v1/dashboard/pipeline${qs}`);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/dashboard/pipeline", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await GET(get());

    expect(res.status).toBe(401);
  });

  it("returns 400 for a malformed 'desde' filter", async () => {
    mockAuth(coordinador);

    const res = await GET(get("?desde=not-a-date"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.oportunidad.findMany).not.toHaveBeenCalled();
  });

  it("scopes to responsable_id for COLABORADOR and ignores the responsable_id query filter", async () => {
    mockAuth(colaborador);
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([]);

    const res = await GET(get("?responsable_id=someone-else"));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ scope: "own" });
    const where = vi.mocked(db.oportunidad.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.cliente).toEqual({ deleted_at: null, responsable_id: "colab-1" });
  });

  it("respects the responsable_id filter for full-access roles (scope all)", async () => {
    mockAuth(coordinador);
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([]);

    const res = await GET(get("?responsable_id=rep-9"));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ scope: "all" });
    const where = vi.mocked(db.oportunidad.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.cliente).toEqual({ deleted_at: null, responsable_id: "rep-9" });
  });

  it("omits the created_at filter when no date range is given (full history)", async () => {
    mockAuth(coordinador);
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([]);

    await GET(get());

    const where = vi.mocked(db.oportunidad.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.created_at).toBeUndefined();
  });

  it("applies desde/hasta as an inclusive created_at range", async () => {
    mockAuth(coordinador);
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([]);

    await GET(get("?desde=2026-01-01&hasta=2026-01-31"));

    const where = vi.mocked(db.oportunidad.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    const createdAt = where.created_at as { gte: Date; lte: Date };
    expect(createdAt.gte).toBeInstanceOf(Date);
    expect(createdAt.lte).toBeInstanceOf(Date);
  });

  it("computes embudo, top_clientes and comparativo from the active/won opportunities", async () => {
    mockAuth(coordinador);
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([
      {
        id: "o1",
        estado: "DISENANDO_PROPUESTA",
        valor_estimado_cop: 1000,
        cliente: { id: "c1", nombre: "Cliente A" },
      },
      {
        id: "o2",
        estado: "PRESENTADA",
        valor_estimado_cop: 2000,
        cliente: { id: "c1", nombre: "Cliente A" },
      },
      {
        id: "o3",
        estado: "GANADA",
        valor_estimado_cop: 5000,
        cliente: { id: "c2", nombre: "Cliente B" },
      },
    ] as never);

    const res = await GET(get());
    const json = await res.json();

    expect(json.total_activas).toBe(2);
    expect(json.valor_activo).toBe(3000);
    expect(json.embudo).toEqual(
      expect.arrayContaining([
        { estado: "DISENANDO_PROPUESTA", count: 1 },
        { estado: "PRESENTADA", count: 1 },
        { estado: "EN_REVISION", count: 0 },
        { estado: "EN_NEGOCIACION", count: 0 },
        { estado: "STANDBY", count: 0 },
      ]),
    );
    expect(json.top_clientes).toEqual([
      { cliente_id: "c1", nombre: "Cliente A", valor_potencial: 3000 },
    ]);
    expect(json.comparativo).toEqual({
      potencial_activo: 3000,
      ganado_historico: 5000,
      ratio: 1.67,
    });
  });

  it("returns a ratio of 0 when there is no active potential", async () => {
    mockAuth(coordinador);
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([
      {
        id: "o1",
        estado: "GANADA",
        valor_estimado_cop: 5000,
        cliente: { id: "c1", nombre: "Cliente A" },
      },
    ] as never);

    const res = await GET(get());
    const json = await res.json();

    expect(json.comparativo.ratio).toBe(0);
  });
});
