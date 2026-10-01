import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    rubro: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const usuario = {
  id: "user-1",
  rol: "COLABORADOR",
} as Usuario;

const RUBRO_CODES = [
  "R01",
  "R02",
  "R03",
  "R04",
  "R05",
  "R06",
  "R07",
  "R08",
  "R09",
  "R10",
  "R11",
  "R12",
  "R13",
  "R14",
  "R15",
];

function rubroRow(codigo: string, index: number) {
  return {
    id: `rubro-${index}`,
    codigo,
    nombre: `Nombre ${codigo}`,
    activo: true,
    orden: index + 1,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"),
  };
}

function mockAuthenticated() {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/rubros", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await GET();

    expect(res.status).toBe(401);
    expect(db.rubro.findMany).not.toHaveBeenCalled();
  });

  it("GET /rubros returns the 15 active rubros ordered by codigo", async () => {
    mockAuthenticated();
    const rows = RUBRO_CODES.map((codigo, index) => rubroRow(codigo, index));
    vi.mocked(db.rubro.findMany).mockResolvedValue(rows as never);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.rubros.map((rubro: { codigo: string }) => rubro.codigo)).toEqual(RUBRO_CODES);
    expect(db.rubro.findMany).toHaveBeenCalledWith({
      where: { activo: true, codigo: { not: null } },
      orderBy: { codigo: "asc" },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        activo: true,
        orden: true,
        created_at: true,
        updated_at: true,
      },
    });
  });
});
