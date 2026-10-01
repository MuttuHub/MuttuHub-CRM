import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  txRubroUpdate: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  requireApiRole: vi.fn(),
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChanges: vi.fn() };
});

vi.mock("@/lib/db", () => ({
  db: {
    rubro: {
      findUnique: vi.fn(),
    },
    // Interactive-form $transaction: the route reads/writes through the tx
    // client, so the fake forwards to the hoisted tx mock.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ rubro: { update: mocks.txRubroUpdate } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiRole, requireApiUser } from "@/lib/supabase/server";
import { logChanges } from "@/lib/api/audit-cambios";
import { DELETE, PATCH } from "./route";

const admin = {
  id: "admin-1",
  rol: "ADMINISTRADOR",
} as Usuario;

const existing = {
  id: "rubro-1",
  codigo: "R01",
  nombre: "Personal",
  activo: true,
  orden: 1,
  created_at: new Date("2026-01-01"),
  updated_at: new Date("2026-01-01"),
};

const routeContext = { params: Promise.resolve({ id: "rubro-1" }) };

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/rubros/rubro-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(requireApiRole).mockResolvedValue({
    ok: true,
    usuario: admin,
    supabaseUser: {} as never,
  });
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario: admin,
    supabaseUser: {} as never,
  });
  vi.mocked(db.rubro.findUnique).mockResolvedValue(existing as never);
  mocks.txRubroUpdate.mockResolvedValue({ ...existing, nombre: "Renombrado" } as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/rubros/:id", () => {
  it("returns 403 when the caller is not an administrador", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "FORBIDDEN" }), {
        status: 403,
      }),
    });

    const res = await PATCH(patchRequest({ nombre: "Talento" }), routeContext);

    expect(res.status).toBe(403);
    expect(db.rubro.findUnique).not.toHaveBeenCalled();
  });

  it("PATCH /rubros/:id allows renaming a rubro", async () => {
    const res = await PATCH(patchRequest({ nombre: "Talento" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.rubro.nombre).toBe("Renombrado");
    expect(mocks.txRubroUpdate).toHaveBeenCalledWith({
      where: { id: "rubro-1" },
      data: { nombre: "Talento" },
      select: expect.objectContaining({ codigo: true, nombre: true, activo: true }),
    });
    expect(vi.mocked(logChanges)).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.objectContaining({
          entidad: "rubro",
          entidad_id: "rubro-1",
          accion: "EDITAR",
          campo: "nombre",
          valor_anterior: "Personal",
          valor_nuevo: "Talento",
        }),
      ],
    );
  });

  it("PATCH /rubros/:id never changes codigo", async () => {
    const res = await PATCH(patchRequest({ codigo: "R99" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toMatch(/inmutable/i);
    expect(db.rubro.findUnique).not.toHaveBeenCalled();
    expect(mocks.txRubroUpdate).not.toHaveBeenCalled();
  });

  it("PATCH /rubros/:id suspends a rubro without deleting it", async () => {
    mocks.txRubroUpdate.mockResolvedValue({ ...existing, activo: false } as never);

    const res = await PATCH(patchRequest({ activo: false }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.rubro.codigo).toBe("R01");
    expect(json.rubro.activo).toBe(false);
    expect(mocks.txRubroUpdate).toHaveBeenCalledWith({
      where: { id: "rubro-1" },
      data: { activo: false },
      select: expect.objectContaining({ codigo: true }),
    });
    expect(vi.mocked(logChanges)).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.objectContaining({
          entidad: "rubro",
          accion: "SUSPENDER",
          campo: "activo",
          valor_anterior: true,
          valor_nuevo: false,
        }),
      ],
    );
  });

  it("returns 404 for an unknown rubro", async () => {
    vi.mocked(db.rubro.findUnique).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ nombre: "Talento" }), routeContext);

    expect(res.status).toBe(404);
    expect(mocks.txRubroUpdate).not.toHaveBeenCalled();
  });

  it("requires at least one changeable field", async () => {
    const res = await PATCH(patchRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
    expect(mocks.txRubroUpdate).not.toHaveBeenCalled();
  });

  it("rejects a blank nombre", async () => {
    const res = await PATCH(patchRequest({ nombre: "   " }), routeContext);

    expect(res.status).toBe(400);
    expect(mocks.txRubroUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/rubros/:id", () => {
  it("DELETE /rubros/:id answers 409 and never deletes", async () => {
    const res = await DELETE(new Request("http://localhost/api/v1/rubros/rubro-1", { method: "DELETE" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
    expect(json.error).toMatch(/suspender/i);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(mocks.txRubroUpdate).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await DELETE(new Request("http://localhost/api/v1/rubros/rubro-1", { method: "DELETE" }), routeContext);

    expect(res.status).toBe(401);
  });
});
