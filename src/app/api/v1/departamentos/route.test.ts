// V5 (S3, decision L8): GET /api/v1/departamentos, the official departamento list the client form
// offers, read from the municipios catalogue.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { municipio: { findMany: vi.fn() } } }));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/departamentos", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), { status: 401 }),
    });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(db.municipio.findMany).not.toHaveBeenCalled();
  });

  it("lists each catalogue departamento once, sorted, for any signed-in user", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: { id: "u1", rol: "COLABORADOR" } as Usuario,
      supabaseUser: {} as never,
    });
    vi.mocked(db.municipio.findMany).mockResolvedValue([
      { departamento: "Caldas", codigo_dane: "17001" },
      { departamento: "Antioquia", codigo_dane: null },
      { departamento: "Caldas", codigo_dane: null },
    ] as never);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      departamentos: [
        { departamento: "Antioquia", codigo: null },
        { departamento: "Caldas", codigo: "17" },
      ],
    });
  });
});
