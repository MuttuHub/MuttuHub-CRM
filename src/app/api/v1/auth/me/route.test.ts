import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  getSessionUser: vi.fn(),
}));

import { getSessionUser } from "@/lib/supabase/server";
import { GET } from "./route";

const usuario = {
  id: "user-1",
  nombre: "Ana Admin",
  email: "ana@muttu.co",
  rol: "ADMINISTRADOR",
  activo: true,
  created_at: new Date("2026-01-01"),
  updated_at: new Date("2026-01-01"),
} as Usuario;

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/auth/me", () => {
  it("returns the current session's usuario", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      usuario,
      supabaseUser: {} as never,
    });

    const res = await GET();

    expect(res.status).toBe(200);
    // Dates round-trip through JSON as ISO strings, not Date instances.
    expect(await res.json()).toEqual({
      usuario: { ...usuario, created_at: usuario.created_at.toISOString(), updated_at: usuario.updated_at.toISOString() },
    });
  });

  it("returns 401 when there is no session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "Sesión no válida o expirada.",
      code: "UNAUTHORIZED",
    });
  });
});
