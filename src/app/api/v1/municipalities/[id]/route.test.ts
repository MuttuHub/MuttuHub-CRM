import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  txMunicipioUpdate: vi.fn(),
  txMunicipioDelete: vi.fn(),
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
    municipio: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      // Present so the tests can prove DELETE never reaches a hard delete.
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    // Interactive-form $transaction: the route reads/writes through the tx
    // client, so the fake forwards to the hoisted tx mocks.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        municipio: {
          update: mocks.txMunicipioUpdate,
          delete: mocks.txMunicipioDelete,
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
  id: "municipio-1",
  nombre: "Medellín",
  departamento: "Antioquia",
  codigo_dane: "05001",
  activo: true,
  fecha_suspension: null,
  orden: 1,
  created_at: new Date("2026-01-01"),
  updated_at: new Date("2026-01-01"),
};

const routeContext = { params: Promise.resolve({ id: "municipio-1" }) };

/** The exact P2002 payload Prisma 7 + @prisma/adapter-pg produces. */
function uniqueViolation(fields: string[], constraintName: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: {
      modelName: "Municipio",
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: {
          originalCode: "23505",
          originalMessage: `duplicate key value violates unique constraint "${constraintName}"`,
          kind: "UniqueConstraintViolation",
          constraint: { fields },
        },
      },
    },
  });
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/municipalities/municipio-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(): Request {
  return new Request("http://localhost/api/v1/municipalities/municipio-1", { method: "DELETE" });
}

beforeEach(() => {
  vi.mocked(requireApiRole).mockResolvedValue({
    ok: true,
    usuario: admin,
    supabaseUser: {} as never,
  });
  vi.mocked(db.municipio.findUnique).mockResolvedValue(existing as never);
  vi.mocked(db.municipio.findFirst).mockResolvedValue(null);
  mocks.txMunicipioUpdate.mockResolvedValue({ ...existing, nombre: "Renombrado" } as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/municipalities/:id", () => {
  it("returns 403 when the caller is not an administrador", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "FORBIDDEN" }), {
        status: 403,
      }),
    });

    const res = await PATCH(patchRequest({ nombre: "Otro" }), routeContext);

    expect(res.status).toBe(403);
    expect(db.municipio.findUnique).not.toHaveBeenCalled();
    expect(mocks.txMunicipioUpdate).not.toHaveBeenCalled();
  });

  it("allows renaming a municipio", async () => {
    const res = await PATCH(patchRequest({ nombre: "Medellín de nuevo" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.municipio.nombre).toBe("Renombrado");
    expect(mocks.txMunicipioUpdate).toHaveBeenCalledWith({
      where: { id: "municipio-1" },
      data: { nombre: "Medellín de nuevo" },
      select: expect.objectContaining({ nombre: true, departamento: true, codigo_dane: true }),
    });
    expect(vi.mocked(logChanges)).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.objectContaining({
          entidad: "municipio",
          entidad_id: "municipio-1",
          accion: "EDITAR",
          campo: "nombre",
          valor_anterior: "Medellín",
          valor_nuevo: "Medellín de nuevo",
        }),
      ],
    );
  });

  it("allows changing the departamento and clears codigo_dane when sent as null", async () => {
    const res = await PATCH(
      patchRequest({ departamento: "Cundinamarca", codigo_dane: null }),
      routeContext,
    );

    expect(res.status).toBe(200);
    expect(mocks.txMunicipioUpdate).toHaveBeenCalledWith({
      where: { id: "municipio-1" },
      data: { departamento: "Cundinamarca", codigo_dane: null },
      select: expect.anything(),
    });
    expect(vi.mocked(logChanges)).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ campo: "codigo_dane", valor_anterior: "05001", valor_nuevo: null }),
      ]),
    );
  });

  it("rejects a duplicate (nombre, departamento) pair with 409 without touching the row", async () => {
    vi.mocked(db.municipio.findFirst).mockResolvedValue({ id: "municipio-9" } as never);

    const res = await PATCH(patchRequest({ nombre: "Bello" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
    expect(db.municipio.findFirst).toHaveBeenCalledWith({
      where: { nombre: "Bello", departamento: "Antioquia", NOT: { id: "municipio-1" } },
      select: { id: true },
    });
    expect(mocks.txMunicipioUpdate).not.toHaveBeenCalled();
  });

  it("rejects a duplicate codigo_dane with 409 without touching the row", async () => {
    vi.mocked(db.municipio.findFirst).mockResolvedValue({ id: "municipio-8" } as never);

    const res = await PATCH(patchRequest({ codigo_dane: "11001" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
    expect(json.error).toMatch(/DANE/);
    expect(mocks.txMunicipioUpdate).not.toHaveBeenCalled();
  });

  it("returns the same 409 CONFLICT when the update hits the pair index (race condition)", async () => {
    mocks.txMunicipioUpdate.mockRejectedValue(
      uniqueViolation(["nombre", "departamento"], "municipios_nombre_departamento_key"),
    );

    const res = await PATCH(patchRequest({ nombre: "Bello" }), routeContext);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
  });

  it("returns the DANE conflict when the update hits the codigo_dane index (race condition)", async () => {
    mocks.txMunicipioUpdate.mockRejectedValue(
      uniqueViolation(["codigo_dane"], "municipios_codigo_dane_key"),
    );

    const res = await PATCH(patchRequest({ codigo_dane: "11001" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
    expect(json.error).toMatch(/DANE/);
  });

  it("suspends a municipio without deleting it and stamps fecha_suspension", async () => {
    mocks.txMunicipioUpdate.mockResolvedValue({
      ...existing,
      activo: false,
      fecha_suspension: new Date("2026-02-01"),
    } as never);

    const res = await PATCH(patchRequest({ activo: false }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.municipio.activo).toBe(false);
    expect(json.municipio.fecha_suspension).toBeTruthy();
    expect(mocks.txMunicipioUpdate).toHaveBeenCalledWith({
      where: { id: "municipio-1" },
      data: { activo: false, fecha_suspension: expect.any(Date) },
      select: expect.anything(),
    });
    expect(vi.mocked(logChanges)).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          entidad: "municipio",
          accion: "SUSPENDER",
          campo: "activo",
          valor_anterior: true,
          valor_nuevo: false,
        }),
      ]),
    );
  });

  it("restores a suspended municipio and clears fecha_suspension", async () => {
    vi.mocked(db.municipio.findUnique).mockResolvedValue({
      ...existing,
      activo: false,
      fecha_suspension: new Date("2026-02-01"),
    } as never);
    mocks.txMunicipioUpdate.mockResolvedValue({ ...existing, activo: true, fecha_suspension: null } as never);

    const res = await PATCH(patchRequest({ activo: true }), routeContext);

    expect(res.status).toBe(200);
    expect(mocks.txMunicipioUpdate).toHaveBeenCalledWith({
      where: { id: "municipio-1" },
      data: { activo: true, fecha_suspension: null },
      select: expect.anything(),
    });
    expect(vi.mocked(logChanges)).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ accion: "EDITAR", campo: "activo", valor_nuevo: true }),
      ]),
    );
  });

  it("returns 404 for an unknown municipio", async () => {
    vi.mocked(db.municipio.findUnique).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ nombre: "Otro" }), routeContext);

    expect(res.status).toBe(404);
    expect(mocks.txMunicipioUpdate).not.toHaveBeenCalled();
  });

  it("requires at least one changeable field", async () => {
    const res = await PATCH(patchRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
    expect(mocks.txMunicipioUpdate).not.toHaveBeenCalled();
  });

  it("rejects a blank nombre", async () => {
    const res = await PATCH(patchRequest({ nombre: "   " }), routeContext);

    expect(res.status).toBe(400);
    expect(mocks.txMunicipioUpdate).not.toHaveBeenCalled();
  });

  it("rejects a codigo_dane that is not 5 digits", async () => {
    const res = await PATCH(patchRequest({ codigo_dane: "abcde" }), routeContext);

    expect(res.status).toBe(400);
    expect(mocks.txMunicipioUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/municipalities/:id", () => {
  it("returns 403 when the caller is not an administrador", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "FORBIDDEN" }), {
        status: 403,
      }),
    });

    const res = await DELETE(deleteRequest(), routeContext);

    expect(res.status).toBe(403);
    expect(db.municipio.findUnique).not.toHaveBeenCalled();
    expect(mocks.txMunicipioUpdate).not.toHaveBeenCalled();
  });

  it("suspends the municipio and never destroys the row", async () => {
    mocks.txMunicipioUpdate.mockResolvedValue({
      ...existing,
      activo: false,
      fecha_suspension: new Date("2026-02-01"),
    } as never);

    const res = await DELETE(deleteRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.municipio.activo).toBe(false);
    expect(json.municipio.fecha_suspension).toBeTruthy();
    expect(mocks.txMunicipioUpdate).toHaveBeenCalledWith({
      where: { id: "municipio-1" },
      data: { activo: false, fecha_suspension: expect.any(Date) },
      select: expect.anything(),
    });
    expect(mocks.txMunicipioDelete).not.toHaveBeenCalled();
    expect(db.municipio.delete).not.toHaveBeenCalled();
    expect(db.municipio.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown municipio", async () => {
    vi.mocked(db.municipio.findUnique).mockResolvedValue(null);

    const res = await DELETE(deleteRequest(), routeContext);

    expect(res.status).toBe(404);
    expect(mocks.txMunicipioUpdate).not.toHaveBeenCalled();
  });
});
