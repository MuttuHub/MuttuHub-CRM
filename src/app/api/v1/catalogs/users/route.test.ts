import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    usuario: {
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

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/catalogs/users", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await GET();

    expect(res.status).toBe(401);
    expect(db.usuario.findMany).not.toHaveBeenCalled();
  });

  it("returns the minimal id/nombre projection of active users for any authenticated role", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario,
      supabaseUser: {} as never,
    });
    vi.mocked(db.usuario.findMany).mockResolvedValue([
      { id: "u1", nombre: "Ana" },
      { id: "u2", nombre: "Beto" },
    ] as never);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.users).toEqual([
      { id: "u1", nombre: "Ana" },
      { id: "u2", nombre: "Beto" },
    ]);
    expect(db.usuario.findMany).toHaveBeenCalledWith({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    });
  });
});
