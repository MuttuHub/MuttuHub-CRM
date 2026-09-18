// PATCH/DELETE /api/v1/rubros/:id — D5: an Administrador toggles `activo`
// (or edits `nombre`/`orden`) without a deployment. Write is
// requireApiRole(["ADMINISTRADOR"]) only — no `canManageProject`/`canViewProject`
// axis here, this is a global catalog, not a project-scoped resource.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiRole: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    rubro: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiRole } from "@/lib/supabase/server";
import { PATCH, DELETE } from "./route";

const admin = { id: "admin-1", rol: "ADMINISTRADOR" } as Usuario;

function roleAs(usuario: Usuario) {
  vi.mocked(requireApiRole).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

function roleForbidden() {
  vi.mocked(requireApiRole).mockResolvedValue({
    ok: false,
    response: new Response(JSON.stringify({ error: "x", code: "FORBIDDEN" }), { status: 403 }),
  });
}

function rubroRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "rubro-1",
    nombre: overrides.nombre ?? "Personal",
    activo: overrides.activo ?? true,
    orden: overrides.orden ?? 1,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"),
  };
}

const routeContext = { params: Promise.resolve({ id: "rubro-1" }) };

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/rubros/rubro-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/rubros/:id", () => {
  it("returns 403 for a non-admin role", async () => {
    roleForbidden();

    const res = await PATCH(patchRequest({ activo: false }), routeContext);

    expect(res.status).toBe(403);
    expect(db.rubro.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the rubro does not exist", async () => {
    roleAs(admin);
    vi.mocked(db.rubro.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ activo: false }), routeContext);

    expect(res.status).toBe(404);
  });

  it("deactivates the rubro without deleting historic lines (activo=false)", async () => {
    roleAs(admin);
    vi.mocked(db.rubro.findFirst).mockResolvedValue(rubroRow() as never);
    vi.mocked(db.rubro.update).mockResolvedValue(rubroRow({ activo: false }) as never);

    const res = await PATCH(patchRequest({ activo: false }), routeContext);

    expect(res.status).toBe(200);
    expect(db.rubro.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rubro-1" }, data: { activo: false } }),
    );
    const json = await res.json();
    expect(json.rubro.activo).toBe(false);
  });
});

describe("DELETE /api/v1/rubros/:id", () => {
  it("returns 403 for a non-admin role", async () => {
    roleForbidden();

    const res = await DELETE(new Request("http://localhost/api/v1/rubros/rubro-1"), routeContext);

    expect(res.status).toBe(403);
    expect(db.rubro.update).not.toHaveBeenCalled();
  });

  it("soft-deletes the rubro for an admin", async () => {
    roleAs(admin);
    vi.mocked(db.rubro.findFirst).mockResolvedValue(rubroRow() as never);
    vi.mocked(db.rubro.update).mockResolvedValue(rubroRow() as never);

    const res = await DELETE(new Request("http://localhost/api/v1/rubros/rubro-1"), routeContext);

    expect(res.status).toBe(204);
    expect(db.rubro.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rubro-1" }, data: { deleted_at: expect.any(Date) } }),
    );
  });
});
