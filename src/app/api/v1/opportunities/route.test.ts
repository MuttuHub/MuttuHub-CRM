// V1 (S1/S2/S3): cross-client opportunity list. These tests pin the contract
// the kanban consumes: the read is gated by the same commercial access as the
// per-client route (403 FORBIDDEN, no query), rows carry their client name and
// the server-authoritative move flag, and `totales` always has the seven S1
// columns in the S1 order with their COP sum.

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

const gerencia = { id: "gerencia-1", rol: "GERENCIA", gestiona_oportunidades: false } as Usuario;
const colaboradorConFlag = {
  id: "colab-1",
  rol: "COLABORADOR",
  gestiona_oportunidades: true,
} as Usuario;
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

function get(): Request {
  return new Request("http://localhost/api/v1/opportunities");
}

/** One row as Prisma returns it; Decimal values arrive here already numeric. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "op-1",
    cliente_id: "cli-a",
    nombre: "Consultoría línea base 2026",
    estado: "EN_REVISION",
    valor_estimado_cop: 1250000,
    cliente: { nombre: "Alcaldía de Barranquilla", responsable_id: "colab-1" },
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/opportunities", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await GET(get());

    expect(res.status).toBe(401);
    expect(db.oportunidad.findMany).not.toHaveBeenCalled();
  });

  // RNF-C02: the global read uses the same commercial gate as the per-client
  // route. A COLABORADOR without the flag gets the same 403 envelope and no
  // query is issued, even though the client catalog itself is globally readable.
  it("returns 403 FORBIDDEN for a COLABORADOR without commercial access and queries nothing", async () => {
    authAs(colaboradorSinFlag);

    const res = await GET(get());

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "No tienes permisos para ver las oportunidades.",
      code: "FORBIDDEN",
    });
    expect(db.oportunidad.findMany).not.toHaveBeenCalled();
  });

  it("lists every client's opportunities newest-first, with client name and value as numbers", async () => {
    authAs(gerencia);
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([
      row(),
      row({
        id: "op-2",
        cliente_id: "cli-b",
        nombre: "Tablero de seguimiento",
        estado: "GANADA",
        valor_estimado_cop: 800000.5,
        cliente: { nombre: "Fundación Tejiendo Caribe", responsable_id: "otro-1" },
      }),
    ] as never);

    const res = await GET(get());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.oportunidades).toEqual([
      {
        id: "op-1",
        cliente_id: "cli-a",
        cliente_nombre: "Alcaldía de Barranquilla",
        nombre: "Consultoría línea base 2026",
        estado: "EN_REVISION",
        valor_estimado_cop: 1250000,
        puede_gestionar: true,
      },
      {
        id: "op-2",
        cliente_id: "cli-b",
        cliente_nombre: "Fundación Tejiendo Caribe",
        nombre: "Tablero de seguimiento",
        estado: "GANADA",
        valor_estimado_cop: 800000.5,
        puede_gestionar: true,
      },
    ]);
    // Cross-client read (no responsable filter, matching the S8 client scope)
    // and the S1 decision: order by created_at desc because Oportunidad has no
    // index on cliente_id/estado. Soft-deleted clients are hidden like in the
    // per-client route (its client load keeps `deleted_at: null`).
    expect(db.oportunidad.findMany).toHaveBeenCalledWith({
      where: { deleted_at: null, cliente: { deleted_at: null } },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        cliente_id: true,
        nombre: true,
        estado: true,
        valor_estimado_cop: true,
        cliente: { select: { nombre: true, responsable_id: true } },
      },
    });
  });

  it("marks each row manageable only when canManageOpportunity allows that client", async () => {
    authAs(colaboradorConFlag);
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([
      row(),
      row({
        id: "op-2",
        cliente_id: "cli-b",
        cliente: { nombre: "Fundación Tejiendo Caribe", responsable_id: "otro-1" },
      }),
    ] as never);

    const res = await GET(get());

    const json = await res.json();
    expect(json.oportunidades.map((o: { puede_gestionar: boolean }) => o.puede_gestionar)).toEqual([
      true,
      false,
    ]);
  });

  it("returns one COP total per estado for the seven S1 columns, in the S1 order", async () => {
    authAs(gerencia);
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([
      row(),
      row({ id: "op-2", estado: "EN_REVISION", valor_estimado_cop: null }),
      row({ id: "op-3", estado: "GANADA", valor_estimado_cop: 800000.5 }),
      row({ id: "op-4", estado: "STANDBY", valor_estimado_cop: 1500000 }),
      row({ id: "op-5", estado: "PERDIDA", valor_estimado_cop: 250000 }),
    ] as never);

    const res = await GET(get());

    const json = await res.json();
    expect(json.totales).toEqual([
      { estado: "EN_REVISION", count: 2, total_cop: 1250000 },
      { estado: "DISENANDO_PROPUESTA", count: 0, total_cop: 0 },
      { estado: "PRESENTADA", count: 0, total_cop: 0 },
      { estado: "EN_NEGOCIACION", count: 0, total_cop: 0 },
      { estado: "GANADA", count: 1, total_cop: 800000.5 },
      { estado: "PERDIDA", count: 1, total_cop: 250000 },
      { estado: "STANDBY", count: 1, total_cop: 1500000 },
    ]);
  });
});
