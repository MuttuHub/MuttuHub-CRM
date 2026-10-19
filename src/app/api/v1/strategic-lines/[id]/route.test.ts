import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  txLineaUpdate: vi.fn(),
  txLineaDelete: vi.fn(),
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
    lineaEstrategicaCatalogo: {
      findUnique: vi.fn(),
      // Present so the tests can prove DELETE never reaches a hard delete.
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    // Interactive-form $transaction: the route reads/writes through the tx
    // client, so the fake forwards to the hoisted tx mocks.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        lineaEstrategicaCatalogo: {
          update: mocks.txLineaUpdate,
          delete: mocks.txLineaDelete,
        },
      }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiRole } from "@/lib/supabase/server";
import { logChanges } from "@/lib/api/audit-cambios";
import { DELETE, PATCH } from "./route";

const admin = {
  id: "admin-1",
  rol: "ADMINISTRADOR",
} as Usuario;

const existing = {
  id: "linea-1",
  codigo: "LE01",
  nombre: "Empleabilidad",
  activo: true,
  fecha_suspension: null,
  orden: 1,
  created_at: new Date("2026-01-01"),
  updated_at: new Date("2026-01-01"),
};

const routeContext = { params: Promise.resolve({ id: "linea-1" }) };

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/strategic-lines/linea-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(): Request {
  return new Request("http://localhost/api/v1/strategic-lines/linea-1", { method: "DELETE" });
}

beforeEach(() => {
  vi.mocked(requireApiRole).mockResolvedValue({
    ok: true,
    usuario: admin,
    supabaseUser: {} as never,
  });
  vi.mocked(db.lineaEstrategicaCatalogo.findUnique).mockResolvedValue(existing as never);
  mocks.txLineaUpdate.mockResolvedValue({ ...existing, nombre: "Renombrada" } as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/strategic-lines/:id", () => {
  it("returns 403 when the caller is not an administrador", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "FORBIDDEN" }), {
        status: 403,
      }),
    });

    const res = await PATCH(patchRequest({ nombre: "Otra" }), routeContext);

    expect(res.status).toBe(403);
    expect(db.lineaEstrategicaCatalogo.findUnique).not.toHaveBeenCalled();
    expect(mocks.txLineaUpdate).not.toHaveBeenCalled();
  });

  it("allows renaming a strategic line", async () => {
    const res = await PATCH(patchRequest({ nombre: "Talento" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.linea.nombre).toBe("Renombrada");
    expect(mocks.txLineaUpdate).toHaveBeenCalledWith({
      where: { id: "linea-1" },
      data: { nombre: "Talento" },
      select: expect.objectContaining({ codigo: true, nombre: true, activo: true }),
    });
    expect(vi.mocked(logChanges)).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.objectContaining({
          entidad: "linea",
          entidad_id: "linea-1",
          accion: "EDITAR",
          campo: "nombre",
          valor_anterior: "Empleabilidad",
          valor_nuevo: "Talento",
        }),
      ],
    );
  });

  it("never changes codigo", async () => {
    const res = await PATCH(patchRequest({ codigo: "LE99" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toMatch(/inmutable/i);
    expect(db.lineaEstrategicaCatalogo.findUnique).not.toHaveBeenCalled();
    expect(mocks.txLineaUpdate).not.toHaveBeenCalled();
  });

  it("suspends a strategic line without deleting it and stamps fecha_suspension", async () => {
    mocks.txLineaUpdate.mockResolvedValue({
      ...existing,
      activo: false,
      fecha_suspension: new Date("2026-02-01"),
    } as never);

    const res = await PATCH(patchRequest({ activo: false }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.linea.codigo).toBe("LE01");
    expect(json.linea.activo).toBe(false);
    expect(json.linea.fecha_suspension).toBeTruthy();
    expect(mocks.txLineaUpdate).toHaveBeenCalledWith({
      where: { id: "linea-1" },
      data: { activo: false, fecha_suspension: expect.any(Date) },
      select: expect.objectContaining({ codigo: true }),
    });
    expect(vi.mocked(logChanges)).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          entidad: "linea",
          accion: "SUSPENDER",
          campo: "activo",
          valor_anterior: true,
          valor_nuevo: false,
        }),
      ]),
    );
  });

  it("restores a suspended strategic line and clears fecha_suspension", async () => {
    vi.mocked(db.lineaEstrategicaCatalogo.findUnique).mockResolvedValue({
      ...existing,
      activo: false,
      fecha_suspension: new Date("2026-02-01"),
    } as never);
    mocks.txLineaUpdate.mockResolvedValue({ ...existing, activo: true, fecha_suspension: null } as never);

    const res = await PATCH(patchRequest({ activo: true }), routeContext);

    expect(res.status).toBe(200);
    expect(mocks.txLineaUpdate).toHaveBeenCalledWith({
      where: { id: "linea-1" },
      data: { activo: true, fecha_suspension: null },
      select: expect.objectContaining({ codigo: true }),
    });
    expect(vi.mocked(logChanges)).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ accion: "EDITAR", campo: "activo", valor_nuevo: true }),
      ]),
    );
  });

  it("returns 404 for an unknown line", async () => {
    vi.mocked(db.lineaEstrategicaCatalogo.findUnique).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ nombre: "Otra" }), routeContext);

    expect(res.status).toBe(404);
    expect(mocks.txLineaUpdate).not.toHaveBeenCalled();
  });

  it("requires at least one changeable field", async () => {
    const res = await PATCH(patchRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
    expect(mocks.txLineaUpdate).not.toHaveBeenCalled();
  });

  it("rejects a blank nombre", async () => {
    const res = await PATCH(patchRequest({ nombre: "   " }), routeContext);

    expect(res.status).toBe(400);
    expect(mocks.txLineaUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/strategic-lines/:id", () => {
  it("returns 403 when the caller is not an administrador", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "FORBIDDEN" }), {
        status: 403,
      }),
    });

    const res = await DELETE(deleteRequest(), routeContext);

    expect(res.status).toBe(403);
    expect(db.lineaEstrategicaCatalogo.findUnique).not.toHaveBeenCalled();
    expect(mocks.txLineaUpdate).not.toHaveBeenCalled();
  });

  it("suspends the line and never destroys the row", async () => {
    mocks.txLineaUpdate.mockResolvedValue({
      ...existing,
      activo: false,
      fecha_suspension: new Date("2026-02-01"),
    } as never);

    const res = await DELETE(deleteRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.linea.codigo).toBe("LE01");
    expect(json.linea.activo).toBe(false);
    expect(json.linea.fecha_suspension).toBeTruthy();
    expect(mocks.txLineaUpdate).toHaveBeenCalledWith({
      where: { id: "linea-1" },
      data: { activo: false, fecha_suspension: expect.any(Date) },
      select: expect.objectContaining({ codigo: true }),
    });
    expect(mocks.txLineaDelete).not.toHaveBeenCalled();
    expect(db.lineaEstrategicaCatalogo.delete).not.toHaveBeenCalled();
    expect(db.lineaEstrategicaCatalogo.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown line", async () => {
    vi.mocked(db.lineaEstrategicaCatalogo.findUnique).mockResolvedValue(null);

    const res = await DELETE(deleteRequest(), routeContext);

    expect(res.status).toBe(404);
    expect(mocks.txLineaUpdate).not.toHaveBeenCalled();
  });
});
