// GET/POST /api/v1/projects/:id/objectives (S3 U1).
//
// Mocked `@/lib/db`: pins the authorization order (404 -> 403 -> 409
// INVALID_STATE -> 400), the audit rows and the mapping of the partial unique
// index to 409. The index itself is proven live in
// prisma/objetivo.invariant.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ lock: vi.fn(), txCreate: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));

vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});

vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    objetivo: { findMany: vi.fn(), aggregate: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $queryRaw: mocks.lock, objetivo: { create: mocks.txCreate } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { GET, POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

const proyecto = {
  id: "pry-1",
  estado: "BORRADOR",
  fecha_inicio: new Date("2026-10-05T00:00:00.000Z"),
  fecha_fin: new Date("2027-01-29T00:00:00.000Z"),
  miembros: [],
};
const objetivoRow = {
  id: "obj-1",
  proyecto_id: "pry-1",
  codigo: "OE1",
  descripcion: "Fortalecer la empleabilidad",
  orden: 1,
  created_at: new Date("2026-10-08T12:00:00.000Z"),
  updated_at: new Date("2026-10-08T12:00:00.000Z"),
  deleted_at: null,
};

const ctx = { params: Promise.resolve({ id: "pry-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function post(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/objectives", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function get(): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/objectives");
}
function uniqueViolation(constraint: string) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: {
      modelName: "Objetivo",
      driverAdapterError: { name: "DriverAdapterError", cause: { kind: "UniqueConstraintViolation", originalMessage: `duplicate key value violates unique constraint "${constraint}"` } },
    },
  });
}

beforeEach(() => {
  mocks.lock.mockResolvedValue([{ estado: "BORRADOR", valor_total: null }] as never);
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto as never);
  vi.mocked(db.objetivo.findMany).mockResolvedValue([objetivoRow] as never);
  vi.mocked(db.objetivo.aggregate).mockResolvedValue({ _max: { orden: 1 } } as never);
  mocks.txCreate.mockResolvedValue(objetivoRow as never);
});
afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/projects/:id/objectives", () => {
  it("returns 404 before 403 for a missing project", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);
    const res = await GET(get(), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 for a COORDINADOR who is not an active member", async () => {
    authAs(coordinador);
    const res = await GET(get(), ctx);
    expect(res.status).toBe(403);
    expect(db.objetivo.findMany).not.toHaveBeenCalled();
  });

  it("lists the live objectives ordered by orden then codigo", async () => {
    const res = await GET(get(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.objetivos).toEqual([
      {
        id: "obj-1",
        proyecto_id: "pry-1",
        codigo: "OE1",
        descripcion: "Fortalecer la empleabilidad",
        orden: 1,
        created_at: "2026-10-08T12:00:00.000Z",
        updated_at: "2026-10-08T12:00:00.000Z",
      },
    ]);
    expect(db.objetivo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { proyecto_id: "pry-1", deleted_at: null },
        orderBy: [{ orden: "asc" }, { codigo: "asc" }],
      }),
    );
  });
});

describe("POST /api/v1/projects/:id/objectives", () => {
  it("returns 404 for a missing project before the 403", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);
    authAs(coordinador);
    const res = await POST(post({ codigo: "OE1", descripcion: "x" }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 for a COORDINADOR", async () => {
    authAs(coordinador);
    const res = await POST(post({ codigo: "OE1", descripcion: "x" }), ctx);
    expect(res.status).toBe(403);
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("returns 409 INVALID_STATE when the project is not BORRADOR", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ ...proyecto, estado: "ACTIVO" } as never);
    const res = await POST(post({ codigo: "OE1", descripcion: "x" }), ctx);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.code).toBe("INVALID_STATE");
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for a scalar body, a blank codigo or a missing descripcion", async () => {
    for (const body of ["x", { codigo: "  ", descripcion: "x" }, { codigo: "OE1" }, { codigo: "OE1", descripcion: "x", orden: -1 }]) {
      const res = await POST(post(body), ctx);
      expect(res.status).toBe(400);
    }
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("creates the objective at the next orden and audits CREAR", async () => {
    const res = await POST(post({ codigo: " OE1 ", descripcion: " Fortalecer la empleabilidad " }), ctx);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.objetivo.id).toBe("obj-1");
    expect(mocks.txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { proyecto_id: "pry-1", codigo: "OE1", descripcion: "Fortalecer la empleabilidad", orden: 2 },
      }),
    );
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        usuario_id: "ger-1",
        accion: "CREAR",
        entidad: "objetivo",
        entidad_id: "obj-1",
        proyecto_id: "pry-1",
      }),
    );
  });

  it("maps the partial unique index to 409 CONFLICT", async () => {
    mocks.txCreate.mockRejectedValue(uniqueViolation("objetivos_codigo_activo_uq"));
    const res = await POST(post({ codigo: "OE1", descripcion: "x" }), ctx);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
  });

  it("does not swallow an unrelated unique violation", async () => {
    mocks.txCreate.mockRejectedValue(uniqueViolation("otro_uq"));
    const res = await POST(post({ codigo: "OE1", descripcion: "x" }), ctx);
    expect(res.status).toBe(500);
  });
});

describe("project row lock (S8: a baseline approval cannot interleave with a structure write)", () => {
  const casos: [string, () => Promise<Response>, ReturnType<typeof vi.fn>][] = [
    ["POST", () => POST(post({ codigo: "OE9", descripcion: "x" }), ctx), mocks.txCreate],
  ];

  it.each(casos)("%s locks the project row FOR UPDATE before writing", async (_name, call, write) => {
    const res = await call();
    expect(res.status).toBeLessThan(300);
    expect(mocks.lock).toHaveBeenCalledTimes(1);
    const sql = mocks.lock.mock.calls[0]![0] as readonly string[];
    expect(sql.join(" ")).toMatch(/FROM "proyectos"[\s\S]*FOR UPDATE/);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(write.mock.invocationCallOrder[0]!);
  });

  it.each(casos)("%s answers 409 and writes nothing when the approval won the race", async (_name, call, write) => {
    mocks.lock.mockResolvedValue([{ estado: "EN_EJECUCION", valor_total: null }] as never);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INVALID_STATE");
    expect(write).not.toHaveBeenCalled();
  });
});
