// GET/POST /api/v1/projects/:id/deliverables (S3 U3).
//
// Mocked `@/lib/db`: pins the 404 -> 403 -> 409 -> 400 order, the required
// quantity/unit/medium, same-project activities and the audit rows. The partial
// unique index, the CHECK and the composite FK are proven live in
// prisma/estructura.invariant.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ txCreate: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));

vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});

vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    actividad: { findFirst: vi.fn() },
    entregable: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ entregable: { create: mocks.txCreate } }),
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
  id: "ent-1",
  proyecto_id: "pry-1",
  actividad_id: "act-1",
  codigo: "1.4-E1",
  descripcion: "Prendas confeccionadas",
  cantidad_meta: new Prisma.Decimal(100),
  unidad: "prendas",
  tipo_medio_exigido: "Acta firmada",
  created_at: new Date("2026-10-08T12:00:00.000Z"),
  updated_at: new Date("2026-10-08T12:00:00.000Z"),
  deleted_at: null,
};
const cuerpo = {
  actividad_id: "act-1",
  codigo: "1.4-E1",
  descripcion: "Prendas confeccionadas",
  cantidad_meta: 100,
  unidad: "prendas",
  tipo_medio_exigido: "Acta firmada",
};

const ctx = { params: Promise.resolve({ id: "pry-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function post(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/deliverables", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function get(): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/deliverables");
}
function uniqueViolation(constraint: string) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { driverAdapterError: { cause: { originalMessage: `duplicate key value violates unique constraint "${constraint}"` } } },
  });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto as never);
  vi.mocked(db.actividad.findFirst).mockResolvedValue({ id: "act-1" } as never);
  vi.mocked(db.entregable.findMany).mockResolvedValue([fila] as never);
  mocks.txCreate.mockResolvedValue(fila as never);
});
afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/projects/:id/deliverables", () => {
  it("returns 404 before 403, and 403 for a non-member COORDINADOR", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await GET(get(), ctx)).status).toBe(404);
    authAs(coordinador);
    expect((await GET(get(), ctx)).status).toBe(403);
    expect(db.entregable.findMany).not.toHaveBeenCalled();
  });

  it("lists live deliverables with Decimal quantities as strings", async () => {
    const res = await GET(get(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.entregables).toEqual([
      {
        id: "ent-1",
        proyecto_id: "pry-1",
        actividad_id: "act-1",
        codigo: "1.4-E1",
        descripcion: "Prendas confeccionadas",
        cantidad_meta: "100",
        unidad: "prendas",
        tipo_medio_exigido: "Acta firmada",
        created_at: "2026-10-08T12:00:00.000Z",
        updated_at: "2026-10-08T12:00:00.000Z",
      },
    ]);
    expect(db.entregable.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { proyecto_id: "pry-1", deleted_at: null } }),
    );
  });
});

describe("POST /api/v1/projects/:id/deliverables", () => {
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

  it("requires cantidad_meta > 0, unidad and tipo_medio_exigido", async () => {
    for (const body of [
      "x",
      { ...cuerpo, cantidad_meta: 0 },
      { ...cuerpo, cantidad_meta: -3 },
      { ...cuerpo, cantidad_meta: 0.001 },
      { ...cuerpo, cantidad_meta: undefined },
      { ...cuerpo, unidad: " " },
      { ...cuerpo, unidad: undefined },
      { ...cuerpo, tipo_medio_exigido: "" },
      { ...cuerpo, tipo_medio_exigido: undefined },
      { ...cuerpo, descripcion: undefined },
      { ...cuerpo, codigo: " " },
      { ...cuerpo, actividad_id: undefined },
    ]) {
      expect((await POST(post(body), ctx)).status).toBe(400);
    }
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("requires a live activity of the same project", async () => {
    vi.mocked(db.actividad.findFirst).mockResolvedValue(null);
    const res = await POST(post(cuerpo), ctx);
    expect(res.status).toBe(400);
    expect(db.actividad.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "act-1", proyecto_id: "pry-1", deleted_at: null } }),
    );
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("creates the deliverable and audits CREAR", async () => {
    const res = await POST(post({ ...cuerpo, codigo: " 1.4-E1 " }), ctx);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.entregable.cantidad_meta).toBe("100");
    expect(mocks.txCreate.mock.calls[0][0].data).toMatchObject({
      proyecto_id: "pry-1",
      actividad_id: "act-1",
      codigo: "1.4-E1",
      unidad: "prendas",
    });
    expect(String(mocks.txCreate.mock.calls[0][0].data.cantidad_meta)).toBe("100");
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        usuario_id: "ger-1",
        accion: "CREAR",
        entidad: "entregable",
        entidad_id: "ent-1",
        proyecto_id: "pry-1",
      }),
    );
  });

  it("maps the partial unique index to 409 CONFLICT and rethrows other violations", async () => {
    mocks.txCreate.mockRejectedValueOnce(uniqueViolation("entregables_codigo_activo_uq"));
    const res = await POST(post(cuerpo), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
    mocks.txCreate.mockRejectedValueOnce(uniqueViolation("otro_uq"));
    expect((await POST(post(cuerpo), ctx)).status).toBe(500);
  });
});
