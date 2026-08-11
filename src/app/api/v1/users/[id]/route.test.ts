import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiRole: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    usuario: {
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiRole } from "@/lib/supabase/server";
import { PATCH } from "./route";

const admin = {
  id: "admin-1",
  nombre: "Admin Uno",
  email: "admin1@muttu.co",
  rol: "ADMINISTRADOR",
  activo: true,
  created_at: new Date("2026-01-01"),
  updated_at: new Date("2026-01-01"),
} as Usuario;

const other = {
  id: "user-2",
  nombre: "Colab Dos",
  email: "colab2@muttu.co",
  rol: "COLABORADOR",
  activo: true,
  created_at: new Date("2026-01-02"),
  updated_at: new Date("2026-01-02"),
} as Usuario;

// A second admin acting on admin-1 (avoids Guard A self-demotion triggers).
const otherAdmin = {
  id: "admin-2",
  nombre: "Admin Dos",
  email: "admin2@muttu.co",
  rol: "ADMINISTRADOR",
  activo: true,
  created_at: new Date("2026-01-02"),
  updated_at: new Date("2026-01-02"),
} as Usuario;

const routeContext = { params: Promise.resolve({ id: "user-2" }) };

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/users/user-2", {
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
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/users/:id", () => {
  it("returns 400 when an admin demotes their own role (self-demotion)", async () => {
    vi.mocked(db.usuario.findUnique).mockResolvedValue(admin);

    const res = await PATCH(patchRequest({ rol: "COLABORADOR" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      error:
        "No puedes cambiar tu propio rol ni desactivarte. Pide a otro administrador que lo haga.",
    });
    expect(db.usuario.update).not.toHaveBeenCalled();
  });

  it("returns 400 when an admin deactivates themselves", async () => {
    vi.mocked(db.usuario.findUnique).mockResolvedValue(admin);

    const res = await PATCH(patchRequest({ activo: false }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.usuario.update).not.toHaveBeenCalled();
  });

  it("returns 400 when deactivating the last active admin", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({
      ok: true,
      usuario: otherAdmin,
      supabaseUser: {} as never,
    });
    vi.mocked(db.usuario.findUnique).mockResolvedValue(admin);
    vi.mocked(db.usuario.count).mockResolvedValue(1);

    const res = await PATCH(
      patchRequest({ activo: false }),
      { params: Promise.resolve({ id: "admin-1" }) },
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      error: "Debe quedar al menos un administrador activo en el Hub.",
    });
    expect(db.usuario.update).not.toHaveBeenCalled();
  });

  it("returns 400 when demoting the last active admin", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({
      ok: true,
      usuario: otherAdmin,
      supabaseUser: {} as never,
    });
    vi.mocked(db.usuario.findUnique).mockResolvedValue(admin);
    vi.mocked(db.usuario.count).mockResolvedValue(1);

    const res = await PATCH(
      patchRequest({ rol: "COLABORADOR" }),
      { params: Promise.resolve({ id: "admin-1" }) },
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.usuario.update).not.toHaveBeenCalled();
  });

  it("returns 200 when deactivating an admin with 2+ active admins", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({
      ok: true,
      usuario: otherAdmin,
      supabaseUser: {} as never,
    });
    vi.mocked(db.usuario.findUnique).mockResolvedValue(admin);
    vi.mocked(db.usuario.count).mockResolvedValue(2);
    vi.mocked(db.usuario.update).mockResolvedValue({ ...admin, activo: false });

    const res = await PATCH(
      patchRequest({ activo: false }),
      { params: Promise.resolve({ id: "admin-1" }) },
    );

    expect(res.status).toBe(200);
    expect(db.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "admin-1" },
        data: { activo: false },
      }),
    );
  });

  it("allows an admin to change their own nombre", async () => {
    vi.mocked(db.usuario.findUnique).mockResolvedValue(admin);
    vi.mocked(db.usuario.update).mockResolvedValue({
      ...admin,
      nombre: "Admin Renombrado",
    });

    const res = await PATCH(patchRequest({ nombre: "Admin Renombrado" }), {
      params: Promise.resolve({ id: "admin-1" }),
    });

    expect(res.status).toBe(200);
    expect(db.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "admin-1" },
        data: { nombre: "Admin Renombrado" },
      }),
    );
  });

  it("does not run admin guards when updating a non-admin user", async () => {
    vi.mocked(db.usuario.findUnique).mockResolvedValue(other);
    vi.mocked(db.usuario.update).mockResolvedValue({
      ...other,
      rol: "COORDINADOR",
    });

    const res = await PATCH(patchRequest({ rol: "COORDINADOR" }), routeContext);

    expect(res.status).toBe(200);
    expect(db.usuario.count).not.toHaveBeenCalled();
  });
});
