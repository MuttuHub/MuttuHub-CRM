import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    carpeta: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    documento: {
      count: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { DELETE, PATCH } from "./route";

const admin = { id: "admin-1", nombre: "Admin", rol: "ADMINISTRADOR" } as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

const routeContext = { params: Promise.resolve({ id: "f-1" }) };

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/folders/f-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/folders/:id", () => {
  beforeEach(() => {
    authAs(admin);
    vi.mocked(db.carpeta.findFirst).mockResolvedValue({ id: "f-1", parent_id: null } as never);
    vi.mocked(db.carpeta.findMany).mockResolvedValue([
      { id: "f-1", parent_id: null },
      { id: "f-2", parent_id: "f-1" },
      { id: "f-3", parent_id: "f-2" },
    ] as never);
  });

  it("renames a folder", async () => {
    vi.mocked(db.carpeta.update).mockResolvedValue({
      id: "f-1",
      nombre: "Contratos",
      parent_id: null,
      created_at: new Date("2026-01-01"),
    } as never);

    const res = await PATCH(patchRequest({ nombre: "Contratos" }), routeContext);

    expect(res.status).toBe(200);
    expect(db.carpeta.update).toHaveBeenCalledWith({
      where: { id: "f-1" },
      data: { nombre: "Contratos" },
      select: { id: true, nombre: true, parent_id: true, created_at: true },
    });
  });

  it("rejects moving a folder under its own descendant (cycle)", async () => {
    // f-2 is a child of f-1; moving f-1 under f-2 must be rejected.
    const res = await PATCH(patchRequest({ parent_id: "f-2" }), routeContext);

    expect(res.status).toBe(400);
    expect(db.carpeta.update).not.toHaveBeenCalled();
  });

  it("accepts moving a folder sideways to an unrelated branch", async () => {
    // f-3 is under f-2 under f-1 — unrelated to a new root "f-4".
    vi.mocked(db.carpeta.findFirst).mockResolvedValueOnce({ id: "f-1", parent_id: null } as never);
    vi.mocked(db.carpeta.findFirst).mockResolvedValueOnce({ id: "f-4", parent_id: null } as never);
    vi.mocked(db.carpeta.findMany).mockResolvedValue([
      { id: "f-1", parent_id: null },
      { id: "f-2", parent_id: "f-1" },
      { id: "f-3", parent_id: "f-2" },
      { id: "f-4", parent_id: null },
    ] as never);
    vi.mocked(db.carpeta.update).mockResolvedValue({
      id: "f-1",
      nombre: "Raíz",
      parent_id: "f-4",
      created_at: new Date("2026-01-01"),
    } as never);

    const res = await PATCH(patchRequest({ parent_id: "f-4" }), routeContext);

    expect(res.status).toBe(200);
    expect(db.carpeta.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { parent_id: "f-4" } }),
    );
  });

  it("rejects a nonexistent parent (404)", async () => {
    vi.mocked(db.carpeta.findFirst).mockResolvedValueOnce({ id: "f-1", parent_id: null } as never);
    vi.mocked(db.carpeta.findFirst).mockResolvedValueOnce(null as never);

    const res = await PATCH(patchRequest({ parent_id: "ghost" }), routeContext);

    expect(res.status).toBe(404);
    expect(db.carpeta.update).not.toHaveBeenCalled();
  });

  it("rejects an empty body", async () => {
    const res = await PATCH(patchRequest({}), routeContext);

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/v1/folders/:id", () => {
  beforeEach(() => {
    authAs(admin);
    vi.mocked(db.carpeta.findFirst).mockResolvedValue({ id: "f-1" } as never);
  });

  it("soft-deletes an empty folder (204)", async () => {
    vi.mocked(db.carpeta.count).mockResolvedValue(0);
    vi.mocked(db.documento.count).mockResolvedValue(0);

    const res = await DELETE(new Request("http://localhost/api/v1/folders/f-1"), routeContext);

    expect(res.status).toBe(204);
    expect(db.carpeta.update).toHaveBeenCalledWith({
      where: { id: "f-1" },
      data: { deleted_at: expect.any(Date) },
    });
  });

  it("blocks deletion with subfolders (409)", async () => {
    vi.mocked(db.carpeta.count).mockResolvedValue(2);
    vi.mocked(db.documento.count).mockResolvedValue(0);

    const res = await DELETE(new Request("http://localhost/api/v1/folders/f-1"), routeContext);

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "CONFLICT" });
    expect(db.carpeta.update).not.toHaveBeenCalled();
  });

  it("blocks deletion with documents (409)", async () => {
    vi.mocked(db.carpeta.count).mockResolvedValue(0);
    vi.mocked(db.documento.count).mockResolvedValue(3);

    const res = await DELETE(new Request("http://localhost/api/v1/folders/f-1"), routeContext);

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "CONFLICT" });
    expect(db.carpeta.update).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing folder", async () => {
    vi.mocked(db.carpeta.findFirst).mockResolvedValue(null);

    const res = await DELETE(new Request("http://localhost/api/v1/folders/f-1"), routeContext);

    expect(res.status).toBe(404);
  });
});