// GET/POST /api/v1/projects/:id/activities (S3 U2b).
//
// Mocked `@/lib/db`: pins the 404 -> 403 -> 409 -> 400 order, the week bounds
// against the project duration (F-W1: 17 weeks), same-project references, the
// derived dates/weight in responses and the audit rows. The partial unique
// index and the CHECKs are proven live in prisma/estructura.invariant.test.ts.

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
    objetivo: { findFirst: vi.fn() },
    usuario: { findFirst: vi.fn() },
    actividad: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ actividad: { create: mocks.txCreate } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { GET, POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

// F-W1: 2026-10-05 .. 2027-01-29 = 17 weeks.
const proyecto = {
  id: "pry-1",
  estado: "BORRADOR",
  fecha_inicio: new Date("2026-10-05T00:00:00.000Z"),
  fecha_fin: new Date("2027-01-29T00:00:00.000Z"),
  miembros: [],
};
const filaActividad = {
  id: "act-1",
  proyecto_id: "pry-1",
  objetivo_id: "obj-1",
  codigo: "1.4",
  nombre: "Taller de costura",
  semana_inicio: 3,
  semana_fin: 6,
  peso: new Prisma.Decimal(4),
  peso_manual: false,
  responsable_id: null,
  created_at: new Date("2026-10-08T12:00:00.000Z"),
  updated_at: new Date("2026-10-08T12:00:00.000Z"),
  deleted_at: null,
};
const cuerpo = { objetivo_id: "obj-1", codigo: "1.4", nombre: "Taller de costura", semana_inicio: 3, semana_fin: 6 };

const ctx = { params: Promise.resolve({ id: "pry-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function post(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/activities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function get(): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/activities");
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
  vi.mocked(db.objetivo.findFirst).mockResolvedValue({ id: "obj-1" } as never);
  vi.mocked(db.usuario.findFirst).mockResolvedValue({ id: "u-1" } as never);
  vi.mocked(db.actividad.findMany).mockResolvedValue([filaActividad] as never);
  mocks.txCreate.mockResolvedValue(filaActividad as never);
});
afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/projects/:id/activities", () => {
  it("returns 404 before 403, and 403 for a non-member COORDINADOR", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await GET(get(), ctx)).status).toBe(404);
    authAs(coordinador);
    expect((await GET(get(), ctx)).status).toBe(403);
    expect(db.actividad.findMany).not.toHaveBeenCalled();
  });

  it("returns live activities with derived dates and weight, never stored ones", async () => {
    const res = await GET(get(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.actividades).toHaveLength(1);
    expect(json.actividades[0]).toMatchObject({
      id: "act-1",
      semana_inicio: 3,
      semana_fin: 6,
      fecha_inicio: "2026-10-19",
      fecha_fin: "2026-11-15",
      peso: 4,
      peso_manual: false,
      fuera_de_duracion: false,
    });
    expect(db.actividad.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { proyecto_id: "pry-1", deleted_at: null },
        orderBy: [{ semana_inicio: "asc" }, { codigo: "asc" }],
      }),
    );
  });
});

describe("POST /api/v1/projects/:id/activities", () => {
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

  it("returns 400 for a scalar body, missing fields, a non-positive weight or unknown fields", async () => {
    for (const body of [
      "x",
      { ...cuerpo, codigo: " " },
      { ...cuerpo, nombre: undefined },
      { ...cuerpo, objetivo_id: undefined },
      { ...cuerpo, peso: 0 },
      { ...cuerpo, peso: -1 },
      { ...cuerpo, fecha_inicio: "2026-10-19" },
      { ...cuerpo, semana_inicio: 1.5 },
    ]) {
      expect((await POST(post(body), ctx)).status).toBe(400);
    }
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the project has no dates", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ ...proyecto, fecha_fin: null } as never);
    const res = await POST(post(cuerpo), ctx);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("Define las fechas del proyecto antes de crear actividades.");
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("validates 1 <= semana_inicio <= semana_fin <= duration (17 weeks)", async () => {
    for (const semanas of [
      { semana_inicio: 6, semana_fin: 3 },
      { semana_inicio: 0, semana_fin: 3 },
      { semana_inicio: 3, semana_fin: 18 },
    ]) {
      const res = await POST(post({ ...cuerpo, ...semanas }), ctx);
      expect(res.status).toBe(400);
    }
    expect((await POST(post({ ...cuerpo, semana_inicio: 1, semana_fin: 17 }), ctx)).status).toBe(201);
  });

  it("requires an objective of the same project (live)", async () => {
    vi.mocked(db.objetivo.findFirst).mockResolvedValue(null);
    const res = await POST(post(cuerpo), ctx);
    expect(res.status).toBe(400);
    expect(db.objetivo.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "obj-1", proyecto_id: "pry-1", deleted_at: null } }),
    );
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("requires an active responsable when one is supplied", async () => {
    vi.mocked(db.usuario.findFirst).mockResolvedValue(null);
    const res = await POST(post({ ...cuerpo, responsable_id: "u-9" }), ctx);
    expect(res.status).toBe(400);
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("creates with the duration as weight and derives dates in the response", async () => {
    const res = await POST(post({ ...cuerpo, codigo: " 1.4 " }), ctx);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.actividad).toMatchObject({ fecha_inicio: "2026-10-19", fecha_fin: "2026-11-15", peso: 4 });
    expect(mocks.txCreate).toHaveBeenCalledTimes(1);
    const data = mocks.txCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      proyecto_id: "pry-1",
      objetivo_id: "obj-1",
      codigo: "1.4",
      nombre: "Taller de costura",
      semana_inicio: 3,
      semana_fin: 6,
      peso: 4,
      peso_manual: false,
      responsable_id: null,
    });
    // Dates are never persisted.
    expect(data).not.toHaveProperty("fecha_inicio");
    expect(data).not.toHaveProperty("fecha_fin");
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        usuario_id: "ger-1",
        accion: "CREAR",
        entidad: "actividad",
        entidad_id: "act-1",
        proyecto_id: "pry-1",
      }),
    );
  });

  it("a supplied weight is stored as manual", async () => {
    await POST(post({ ...cuerpo, peso: 2.5 }), ctx);
    expect(mocks.txCreate.mock.calls[0][0].data).toMatchObject({ peso: 2.5, peso_manual: true });
  });

  it("maps the partial unique index to 409 CONFLICT and rethrows other violations", async () => {
    mocks.txCreate.mockRejectedValueOnce(uniqueViolation("actividades_codigo_activo_uq"));
    const res = await POST(post(cuerpo), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");

    mocks.txCreate.mockRejectedValueOnce(uniqueViolation("otro_uq"));
    expect((await POST(post(cuerpo), ctx)).status).toBe(500);
  });
});
