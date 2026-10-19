import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  txMunicipioCreate: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  requireApiRole: vi.fn(),
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn() };
});

vi.mock("@/lib/db", () => ({
  db: {
    municipio: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    // Interactive-form $transaction: the route reads/writes through the tx
    // client, so the fake forwards to the hoisted tx mock.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ municipio: { create: mocks.txMunicipioCreate } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiRole, requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { buildOpenApiDocument } from "@/lib/openapi/document";
import { GET, POST } from "./route";

const usuario = {
  id: "user-1",
  rol: "COLABORADOR",
} as Usuario;

const admin = {
  id: "admin-1",
  rol: "ADMINISTRADOR",
} as Usuario;

function municipioRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "municipio-1",
    nombre: "Medellín",
    departamento: "Antioquia",
    codigo_dane: "05001",
    activo: true,
    fecha_suspension: null,
    orden: 1,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"),
    ...overrides,
  };
}

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

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/municipalities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuthenticated(user: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario: user,
    supabaseUser: {} as never,
  });
}

beforeEach(() => {
  mockAuthenticated(admin);
  vi.mocked(requireApiRole).mockResolvedValue({
    ok: true,
    usuario: admin,
    supabaseUser: {} as never,
  });
  vi.mocked(db.municipio.findUnique).mockResolvedValue(null);
  vi.mocked(db.municipio.findFirst).mockResolvedValue(null);
  mocks.txMunicipioCreate.mockResolvedValue(municipioRow() as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/municipalities", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await GET();

    expect(res.status).toBe(401);
    expect(db.municipio.findMany).not.toHaveBeenCalled();
  });

  it("returns the active municipios ordered by orden for any authenticated user", async () => {
    mockAuthenticated(usuario);
    vi.mocked(db.municipio.findMany).mockResolvedValue([
      municipioRow({ id: "municipio-1", orden: 1 }),
      municipioRow({ id: "municipio-2", nombre: "Bogotá D.C.", departamento: "Bogotá D.C.", orden: 2 }),
    ] as never);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.municipios.map((municipio: { nombre: string }) => municipio.nombre)).toEqual([
      "Medellín",
      "Bogotá D.C.",
    ]);
    expect(db.municipio.findMany).toHaveBeenCalledWith({
      where: { activo: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      select: {
        id: true,
        nombre: true,
        departamento: true,
        codigo_dane: true,
        activo: true,
        fecha_suspension: true,
        orden: true,
        created_at: true,
        updated_at: true,
      },
    });
  });
});

describe("POST /api/v1/municipalities", () => {
  it("returns 403 when the caller is not an administrador", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "FORBIDDEN" }), {
        status: 403,
      }),
    });

    const res = await POST(
      postRequest({ nombre: "Medellín", departamento: "Antioquia", codigo_dane: "05001" }),
    );

    expect(res.status).toBe(403);
    expect(db.municipio.findFirst).not.toHaveBeenCalled();
    expect(db.municipio.findUnique).not.toHaveBeenCalled();
    expect(mocks.txMunicipioCreate).not.toHaveBeenCalled();
  });

  it("creates a municipio with its real DANE code and audits CREAR", async () => {
    const res = await POST(
      postRequest({ nombre: "Medellín", departamento: "Antioquia", codigo_dane: "05001", orden: 1 }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.municipio.nombre).toBe("Medellín");
    expect(mocks.txMunicipioCreate).toHaveBeenCalledWith({
      data: { nombre: "Medellín", departamento: "Antioquia", codigo_dane: "05001", orden: 1 },
      select: expect.objectContaining({ codigo_dane: true, activo: true, fecha_suspension: true }),
    });
    expect(vi.mocked(logChange)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        usuario_id: "admin-1",
        accion: "CREAR",
        entidad: "municipio",
        entidad_id: "municipio-1",
      }),
    );
  });

  it("stores a municipio without codigo_dane as NULL", async () => {
    const res = await POST(postRequest({ nombre: "La Unión", departamento: "Antioquia" }));

    expect(res.status).toBe(201);
    expect(mocks.txMunicipioCreate).toHaveBeenCalledWith({
      data: { nombre: "La Unión", departamento: "Antioquia", codigo_dane: null },
      select: expect.anything(),
    });
  });

  it("rejects a duplicate codigo_dane with 409 before inserting", async () => {
    vi.mocked(db.municipio.findUnique).mockResolvedValue({ id: "municipio-2" } as never);

    const res = await POST(
      postRequest({ nombre: "Soacha", departamento: "Cundinamarca", codigo_dane: "05001" }),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
    expect(json.error).toMatch(/DANE/);
    expect(mocks.txMunicipioCreate).not.toHaveBeenCalled();
  });

  it("rejects a duplicate (nombre, departamento) pair with 409 before inserting", async () => {
    vi.mocked(db.municipio.findFirst).mockResolvedValue({ id: "municipio-3" } as never);

    const res = await POST(postRequest({ nombre: "Medellín", departamento: "Antioquia" }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
    expect(json.error).toMatch(/departamento/);
    expect(db.municipio.findFirst).toHaveBeenCalledWith({
      where: { nombre: "Medellín", departamento: "Antioquia" },
      select: { id: true },
    });
    expect(mocks.txMunicipioCreate).not.toHaveBeenCalled();
  });

  it("returns the same 409 CONFLICT when the insert hits the pair index (race condition)", async () => {
    mocks.txMunicipioCreate.mockRejectedValue(
      uniqueViolation(["nombre", "departamento"], "municipios_nombre_departamento_key"),
    );

    const res = await POST(postRequest({ nombre: "Medellín", departamento: "Antioquia" }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
    expect(json.error).toMatch(/departamento/);
  });

  it("returns the DANE conflict when the insert hits the codigo_dane index (race condition)", async () => {
    mocks.txMunicipioCreate.mockRejectedValue(
      uniqueViolation(["codigo_dane"], "municipios_codigo_dane_key"),
    );

    const res = await POST(
      postRequest({ nombre: "Soacha", departamento: "Cundinamarca", codigo_dane: "05001" }),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
    expect(json.error).toMatch(/DANE/);
  });

  it("requires nombre and departamento", async () => {
    const res = await POST(postRequest({ nombre: "Sin departamento" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(mocks.txMunicipioCreate).not.toHaveBeenCalled();
  });

  it("rejects a blank nombre", async () => {
    const res = await POST(postRequest({ nombre: "   ", departamento: "Antioquia" }));

    expect(res.status).toBe(400);
    expect(mocks.txMunicipioCreate).not.toHaveBeenCalled();
  });

  it("rejects a codigo_dane that is not 5 digits", async () => {
    const res = await POST(
      postRequest({ nombre: "La Unión", departamento: "Antioquia", codigo_dane: "5001" }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(mocks.txMunicipioCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON body", async () => {
    const res = await POST(
      new Request("http://localhost/api/v1/municipalities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
    );

    expect(res.status).toBe(400);
    expect(mocks.txMunicipioCreate).not.toHaveBeenCalled();
  });
});

// The catalog ships as an OpenAPI-documented endpoint, and `document.ts` wires
// it by side-effect import: a missing import would silently drop the path from
// the published spec and no type check would notice. This file is the closest
// allowed surface to pin that (the domain registration file itself imports the
// schemas from this route module).
describe("municipalities paths in the published OpenAPI document", () => {
  it("publishes /api/v1/municipalities and /api/v1/municipalities/{id} with their methods", () => {
    const document = buildOpenApiDocument();
    const paths = document.paths ?? {};

    expect(paths["/api/v1/municipalities"]).toEqual(
      expect.objectContaining({ get: expect.anything(), post: expect.anything() }),
    );
    expect(paths["/api/v1/municipalities/{id}"]).toEqual(
      expect.objectContaining({ patch: expect.anything(), delete: expect.anything() }),
    );
  });
});

describe("GET /api/v1/municipalities?incluir_inactivos=true", () => {
  const url = "http://localhost/api/v1/municipalities?incluir_inactivos=true";

  it("lets ADMINISTRADOR see suspended rows", async () => {
    mockAuthenticated(admin);
    vi.mocked(db.municipio.findMany).mockResolvedValue([] as never);

    const res = await GET(new Request(url));

    expect(res.status).toBe(200);
    expect(vi.mocked(db.municipio.findMany).mock.calls[0][0]?.where).toEqual({});
  });

  it("ignores the flag for non-admin roles", async () => {
    mockAuthenticated(usuario);
    vi.mocked(db.municipio.findMany).mockResolvedValue([] as never);

    await GET(new Request(url));

    expect(vi.mocked(db.municipio.findMany).mock.calls[0][0]?.where).toEqual({ activo: true });
  });

  it("keeps the default (active only) without the flag, even for ADMINISTRADOR", async () => {
    mockAuthenticated(admin);
    vi.mocked(db.municipio.findMany).mockResolvedValue([] as never);

    await GET(new Request("http://localhost/api/v1/municipalities"));

    expect(vi.mocked(db.municipio.findMany).mock.calls[0][0]?.where).toEqual({ activo: true });
  });
});
