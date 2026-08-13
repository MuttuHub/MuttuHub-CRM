import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiRole: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    solicitudAcceso: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiRole } from "@/lib/supabase/server";
import { POST } from "./route";

const admin = {
  id: "admin-1",
  rol: "ADMINISTRADOR",
} as Usuario;

const ctx = { params: Promise.resolve({ id: "sol-1" }) };

function request(): Request {
  return new Request("http://localhost/api/v1/solicitudes-acceso/sol-1/rechazar", {
    method: "POST",
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/solicitudes-acceso/:id/rechazar", () => {
  it("returns 403 for a non-admin role", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "FORBIDDEN" }), { status: 403 }),
    });

    const res = await POST(request(), ctx);

    expect(res.status).toBe(403);
    expect(db.solicitudAcceso.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the solicitud does not exist", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({
      ok: true,
      usuario: admin,
      supabaseUser: {} as never,
    });
    vi.mocked(db.solicitudAcceso.findUnique).mockResolvedValue(null);

    const res = await POST(request(), ctx);

    expect(res.status).toBe(404);
  });

  it("returns 409 when the solicitud was already reviewed", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({
      ok: true,
      usuario: admin,
      supabaseUser: {} as never,
    });
    vi.mocked(db.solicitudAcceso.findUnique).mockResolvedValue({ estado: "APROBADA" } as never);

    const res = await POST(request(), ctx);

    expect(res.status).toBe(409);
    expect(db.solicitudAcceso.update).not.toHaveBeenCalled();
  });

  it("marks a pending solicitud as RECHAZADA with the reviewer id", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({
      ok: true,
      usuario: admin,
      supabaseUser: {} as never,
    });
    vi.mocked(db.solicitudAcceso.findUnique).mockResolvedValue({ estado: "PENDIENTE" } as never);
    vi.mocked(db.solicitudAcceso.update).mockResolvedValue({} as never);

    const res = await POST(request(), ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.solicitud).toMatchObject({ id: "sol-1", estado: "RECHAZADA", revisado_por: "admin-1" });
    expect(db.solicitudAcceso.update).toHaveBeenCalledWith({
      where: { id: "sol-1" },
      data: expect.objectContaining({ estado: "RECHAZADA", revisado_por: "admin-1" }),
    });
  });
});
