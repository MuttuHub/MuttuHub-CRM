// DELETE /api/v1/projects/:id/members/:userId (contract E-07, P07).
//
// Soft removal only: the row keeps `removed_at` and `removido_por_id` and is
// never hard-deleted. A mocked `@/lib/db` covers the authorization order (404
// before 403), the manager-only gate and the write payload; the revocation of
// read access and the survival of the row are asserted against the live
// database in prisma/proyecto-miembros-routes.invariant.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  txUpdate: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});

vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    proyectoMiembro: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ proyectoMiembro: { update: mocks.txUpdate } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChanges } from "@/lib/api/audit-cambios";
import { DELETE } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

const membresia = { id: "mem-1" };
const miembroRow = {
  id: "mem-1",
  created_at: new Date("2026-10-07T12:00:00.000Z"),
  removed_at: new Date("2026-10-08T09:30:00.000Z"),
  agregado_por_id: "ger-1",
  usuario: { id: "coord-9", nombre: "Ana Gómez", rol: "COORDINADOR" },
};

const routeContext = { params: Promise.resolve({ id: "pry-1", userId: "coord-9" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function deleteRequest(): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/members/coord-9", {
    method: "DELETE",
  });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1" } as never);
  vi.mocked(db.proyectoMiembro.findFirst).mockResolvedValue(membresia as never);
  mocks.txUpdate.mockResolvedValue(miembroRow as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/v1/projects/:id/members/:userId", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), { status: 401 }),
    });

    const res = await DELETE(deleteRequest(), routeContext);

    expect(res.status).toBe(401);
    expect(db.proyecto.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing or soft-deleted project before deciding permissions", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await DELETE(deleteRequest(), routeContext);

    expect(res.status).toBe(404);
    expect(db.proyectoMiembro.findFirst).not.toHaveBeenCalled();
  });

  it("returns 403 for a COORDINADOR and never touches the membership", async () => {
    authAs(coordinador);

    const res = await DELETE(deleteRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
    expect(db.proyectoMiembro.findFirst).not.toHaveBeenCalled();
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when the user has no active membership", async () => {
    vi.mocked(db.proyectoMiembro.findFirst).mockResolvedValue(null);

    const res = await DELETE(deleteRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("soft-removes the member with removed_at and removido_por_id and audits EDITAR", async () => {
    const res = await DELETE(deleteRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.miembro.removed_at).toBe("2026-10-08T09:30:00.000Z");
    expect(db.proyectoMiembro.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { proyecto_id: "pry-1", usuario_id: "coord-9", removed_at: null },
      }),
    );
    expect(mocks.txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "mem-1" },
        data: expect.objectContaining({ removed_at: expect.any(Date), removido_por_id: "ger-1" }),
      }),
    );
    expect(logChanges).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          usuario_id: "ger-1",
          accion: "EDITAR",
          entidad: "proyecto_miembro",
          entidad_id: "mem-1",
          campo: "removed_at",
        }),
        expect.objectContaining({ campo: "removido_por_id" }),
      ]),
    );
  });
});
