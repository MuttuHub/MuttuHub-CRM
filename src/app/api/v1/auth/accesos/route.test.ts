import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiRole: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    acceso: {
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

function accesosRequest(query = ""): Request {
  return new Request(`http://localhost/api/v1/auth/accesos${query}`);
}

beforeEach(() => {
  vi.mocked(requireApiRole).mockResolvedValue({
    ok: true,
    usuario: admin,
    supabaseUser: {} as never,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/auth/accesos", () => {
  it("is gated to ADMINISTRADOR and propagates the auth failure response", async () => {
    const forbidden = new Response(
      JSON.stringify({ error: "No tienes permisos para realizar esta acción.", code: "FORBIDDEN" }),
      { status: 403 },
    );
    vi.mocked(requireApiRole).mockResolvedValue({ ok: false, response: forbidden });

    const res = await GET(accesosRequest());

    expect(res.status).toBe(403);
    expect(requireApiRole).toHaveBeenCalledWith(["ADMINISTRADOR"]);
    expect(db.acceso.findMany).not.toHaveBeenCalled();
  });

  it("returns the access log with next_before null when there is no next page", async () => {
    const rows = [
      {
        id: "acc-1",
        created_at: new Date("2026-01-02T00:00:00.000Z"),
        ip: "127.0.0.1",
        user_agent: "vitest",
        usuario: { email: "ana@muttu.co", nombre: "Ana" },
      },
    ];
    vi.mocked(db.acceso.findMany).mockResolvedValue(rows as never);

    const res = await GET(accesosRequest());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.next_before).toBeNull();
    expect(json.accesos).toHaveLength(1);
    expect(db.acceso.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined, take: 21 }),
    );
  });

  it("paginates by keyset: returns next_before and trims the extra lookahead row", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `acc-${i}`,
      created_at: new Date(`2026-01-0${3 - i}T00:00:00.000Z`),
      ip: null,
      user_agent: null,
      usuario: { email: `u${i}@muttu.co`, nombre: `U${i}` },
    }));
    vi.mocked(db.acceso.findMany).mockResolvedValue(rows as never);

    const res = await GET(accesosRequest("?limit=2"));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.accesos).toHaveLength(2);
    expect(json.next_before).toBe(rows[1].created_at.toISOString());
    expect(db.acceso.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 }),
    );
  });

  it("applies the 'before' filter when provided", async () => {
    vi.mocked(db.acceso.findMany).mockResolvedValue([]);

    const res = await GET(accesosRequest("?before=2026-01-01T00:00:00.000Z"));

    expect(res.status).toBe(200);
    expect(db.acceso.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { created_at: { lt: new Date("2026-01-01T00:00:00.000Z") } },
      }),
    );
  });

  it("returns 400 for a non-numeric limit", async () => {
    const res = await GET(accesosRequest("?limit=abc"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.acceso.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid 'before' date", async () => {
    const res = await GET(accesosRequest("?before=not-a-date"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.acceso.findMany).not.toHaveBeenCalled();
  });

  it("caps the limit at MAX_LIMIT (100)", async () => {
    vi.mocked(db.acceso.findMany).mockResolvedValue([]);

    const res = await GET(accesosRequest("?limit=1000"));

    expect(res.status).toBe(200);
    expect(db.acceso.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }),
    );
  });
});
