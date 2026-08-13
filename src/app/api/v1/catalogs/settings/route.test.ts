import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    setting: {
      findUnique: vi.fn(),
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

describe("GET /api/v1/catalogs/settings", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("falls back to the factory defaults when no settings rows exist", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario,
      supabaseUser: {} as never,
    });
    vi.mocked(db.setting.findUnique).mockResolvedValue(null);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.task_tags).toEqual(["Comercial", "Administrativo", "Proyecto", "Interno"]);
    expect(json.doc_categories).toEqual(
      expect.arrayContaining([{ nombre: "Legal", restringida: true }]),
    );
  });

  it("returns the live settings values for any authenticated role", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario,
      supabaseUser: {} as never,
    });
    vi.mocked(db.setting.findUnique)
      .mockResolvedValueOnce({ value: ["Custom"] } as never)
      .mockResolvedValueOnce({ value: [{ nombre: "Custom", restringida: false }] } as never);

    const res = await GET();
    const json = await res.json();

    expect(json.task_tags).toEqual(["Custom"]);
    expect(json.doc_categories).toEqual([{ nombre: "Custom", restringida: false }]);
  });
});
