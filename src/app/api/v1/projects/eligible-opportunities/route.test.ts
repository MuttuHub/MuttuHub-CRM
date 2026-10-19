// GET /api/v1/projects/eligible-opportunities (E-04): the GANADA opportunities
// that have no project yet, for the origin step of the project form. Creation
// authority (P05, `canCreateProject`) gates it; everyone else gets a 403.
//
// The "no project" clause must match the create path's 409: `oportunidad_id` is
// uniquely indexed without a partial predicate, so a soft-deleted project still
// occupies the slot and its opportunity must NOT be listed as eligible.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  oportunidadFindMany: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    oportunidad: { findMany: mocks.oportunidadFindMany },
  },
}));

import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

const oportunidadRow = {
  id: "opp-1",
  nombre: "CedeTextil",
  cliente_id: "cli-1",
  valor_estimado_cop: new Prisma.Decimal("245450000.00"),
  cliente: { nombre: "CedeTextil S.A." },
};

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

beforeEach(() => {
  authAs(gerencia);
  mocks.oportunidadFindMany.mockResolvedValue([oportunidadRow]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects/eligible-opportunities", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await GET();

    expect(res.status).toBe(401);
    expect(mocks.oportunidadFindMany).not.toHaveBeenCalled();
  });

  it("lets a COLABORADOR read the eligible opportunities (S1: any role creates)", async () => {
    authAs(colaborador);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(mocks.oportunidadFindMany).toHaveBeenCalled();
  });

  it("lists only GANADA opportunities without a live project", async () => {
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.oportunidadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          estado: "GANADA",
          deleted_at: null,
          proyecto: { is: null },
        },
      }),
    );
    expect(json.oportunidades).toEqual([
      {
        id: "opp-1",
        nombre: "CedeTextil",
        cliente_id: "cli-1",
        cliente_nombre: "CedeTextil S.A.",
        valor_estimado_cop: "245450000",
      },
    ]);
  });

  it("returns the wrapped 500 envelope when the query fails", async () => {
    mocks.oportunidadFindMany.mockRejectedValue(new Error("boom"));

    const res = await GET();

    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("INTERNAL_ERROR");
  });
});
