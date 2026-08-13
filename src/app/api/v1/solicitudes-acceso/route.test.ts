import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiRole: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    solicitudAcceso: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiRole } from "@/lib/supabase/server";
import { GET } from "./route";

const admin = {
  id: "admin-1",
  rol: "ADMINISTRADOR",
} as Usuario;

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/solicitudes-acceso", () => {
  it("returns 403 for a non-admin role", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "FORBIDDEN" }), { status: 403 }),
    });

    const res = await GET();

    expect(res.status).toBe(403);
    expect(db.solicitudAcceso.findMany).not.toHaveBeenCalled();
  });

  it("returns the queue ordered newest-first for an admin", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({
      ok: true,
      usuario: admin,
      supabaseUser: {} as never,
    });
    vi.mocked(db.solicitudAcceso.findMany).mockResolvedValue([
      { id: "s1", nombre: "Ana", email: "ana@x.com", estado: "PENDIENTE" },
    ] as never);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.solicitudes).toHaveLength(1);
    expect(db.solicitudAcceso.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { created_at: "desc" } }),
    );
  });
});
