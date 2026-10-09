// GET/POST /api/v1/projects/:id/indicators (S3 U3).

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
    objetivo: { findFirst: vi.fn() },
    indicador: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $queryRaw: mocks.lock, indicador: { create: mocks.txCreate } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { GET, POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

const proyecto = { id: "pry-1", estado: "BORRADOR", fecha_inicio: null, fecha_fin: null, miembros: [] };
const fila = {
  id: "ind-1",
  proyecto_id: "pry-1",
  objetivo_id: "obj-1",
  codigo: "IND-01",
  nombre: "Personas empleadas",
  meta: new Prisma.Decimal(50),
  unidad: "personas",
  linea_base: null,
  created_at: new Date("2026-10-08T12:00:00.000Z"),
  updated_at: new Date("2026-10-08T12:00:00.000Z"),
  deleted_at: null,
};
const cuerpo = { objetivo_id: "obj-1", codigo: "IND-01", nombre: "Personas empleadas", meta: 50, unidad: "personas" };

const ctx = { params: Promise.resolve({ id: "pry-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function post(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/indicators", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function get(): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/indicators");
}
function uniqueViolation(constraint: string) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { driverAdapterError: { cause: { originalMessage: `duplicate key value violates unique constraint "${constraint}"` } } },
  });
}

beforeEach(() => {
  mocks.lock.mockResolvedValue([{ estado: "BORRADOR", valor_total: null }] as never);
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto as never);
  vi.mocked(db.objetivo.findFirst).mockResolvedValue({ id: "obj-1" } as never);
  vi.mocked(db.indicador.findMany).mockResolvedValue([fila] as never);
  mocks.txCreate.mockResolvedValue(fila as never);
});
afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/projects/:id/indicators", () => {
  it("returns 404 before 403, and 403 for a non-member COORDINADOR", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await GET(get(), ctx)).status).toBe(404);
    authAs(coordinador);
    expect((await GET(get(), ctx)).status).toBe(403);
    expect(db.indicador.findMany).not.toHaveBeenCalled();
  });

  it("lists live indicators with Decimals as strings and a null baseline", async () => {
    const res = await GET(get(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.indicadores).toEqual([
      {
        id: "ind-1",
        proyecto_id: "pry-1",
        objetivo_id: "obj-1",
        codigo: "IND-01",
        nombre: "Personas empleadas",
        meta: "50",
        unidad: "personas",
        linea_base: null,
        created_at: "2026-10-08T12:00:00.000Z",
        updated_at: "2026-10-08T12:00:00.000Z",
      },
    ]);
    expect(db.indicador.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { proyecto_id: "pry-1", deleted_at: null }, orderBy: [{ codigo: "asc" }] }),
    );
  });
});

describe("POST /api/v1/projects/:id/indicators", () => {
  it("answers 404, then 403 for a COORDINADOR, then 409 INVALID_STATE", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(cuerpo), ctx)).status).toBe(404);
    authAs(coordinador);
    expect((await POST(post(cuerpo), ctx)).status).toBe(403);
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce({ ...proyecto, estado: "ACTIVO" } as never);
    const res = await POST(post(cuerpo), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INVALID_STATE");
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("requires objetivo, codigo, nombre, meta > 0 and unidad; linea_base is optional and >= 0", async () => {
    for (const body of [
      "x",
      { ...cuerpo, objetivo_id: undefined },
      { ...cuerpo, codigo: " " },
      { ...cuerpo, nombre: undefined },
      { ...cuerpo, meta: 0 },
      { ...cuerpo, meta: -1 },
      { ...cuerpo, meta: 0.001 },
      { ...cuerpo, unidad: "" },
      { ...cuerpo, linea_base: -1 },
    ]) {
      expect((await POST(post(body), ctx)).status).toBe(400);
    }
    expect(mocks.txCreate).not.toHaveBeenCalled();
    expect((await POST(post({ ...cuerpo, linea_base: 0 }), ctx)).status).toBe(201);
    expect((await POST(post({ ...cuerpo, linea_base: null }), ctx)).status).toBe(201);
  });

  it("requires a live objective of the same project", async () => {
    vi.mocked(db.objetivo.findFirst).mockResolvedValue(null);
    const res = await POST(post(cuerpo), ctx);
    expect(res.status).toBe(400);
    expect(db.objetivo.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "obj-1", proyecto_id: "pry-1", deleted_at: null } }),
    );
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("creates the indicator and audits CREAR", async () => {
    const res = await POST(post({ ...cuerpo, codigo: " IND-01 ", linea_base: 5 }), ctx);
    expect(res.status).toBe(201);
    const data = mocks.txCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ proyecto_id: "pry-1", objetivo_id: "obj-1", codigo: "IND-01", unidad: "personas" });
    expect(String(data.meta)).toBe("50");
    expect(String(data.linea_base)).toBe("5");
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ usuario_id: "ger-1", accion: "CREAR", entidad: "indicador", entidad_id: "ind-1", proyecto_id: "pry-1" }),
    );
  });

  it("maps the partial unique index to 409 CONFLICT and rethrows other violations", async () => {
    mocks.txCreate.mockRejectedValueOnce(uniqueViolation("indicadores_codigo_activo_uq"));
    const res = await POST(post(cuerpo), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
    mocks.txCreate.mockRejectedValueOnce(uniqueViolation("otro_uq"));
    expect((await POST(post(cuerpo), ctx)).status).toBe(500);
  });
});

describe("project row lock (S8: a baseline approval cannot interleave with a structure write)", () => {
  const casos: [string, () => Promise<Response>, ReturnType<typeof vi.fn>][] = [
    ["POST", () => POST(post({ ...cuerpo, codigo: "IND-01", linea_base: 5 }), ctx), mocks.txCreate],
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
