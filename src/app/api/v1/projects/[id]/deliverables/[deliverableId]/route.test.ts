// PATCH/DELETE /api/v1/projects/:id/deliverables/:deliverableId (S3 U3).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ lock: vi.fn(), txUpdate: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));

vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});

vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    actividad: { findFirst: vi.fn() },
    entregable: { findFirst: vi.fn() },
    avanceEntregable: { count: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $queryRaw: mocks.lock, entregable: { update: mocks.txUpdate } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChanges } from "@/lib/api/audit-cambios";
import { DELETE, PATCH } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

const proyecto = { id: "pry-1", estado: "BORRADOR", fecha_inicio: null, fecha_fin: null };
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

const ctx = { params: Promise.resolve({ id: "pry-1", deliverableId: "ent-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function patch(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/deliverables/ent-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function del(): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/deliverables/ent-1", { method: "DELETE" });
}

beforeEach(() => {
  mocks.lock.mockResolvedValue([{ estado: "BORRADOR", valor_total: null }] as never);
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto as never);
  vi.mocked(db.entregable.findFirst).mockResolvedValue(fila as never);
  vi.mocked(db.actividad.findFirst).mockResolvedValue({ id: "act-2" } as never);
  vi.mocked(db.avanceEntregable.count).mockResolvedValue(0 as never);
  mocks.txUpdate.mockImplementation(async ({ data }: { data: object }) => ({ ...fila, ...data }));
});
afterEach(() => vi.clearAllMocks());

describe("PATCH /api/v1/projects/:id/deliverables/:deliverableId", () => {
  it("answers 404, 403 for a COORDINADOR, 409 outside BORRADOR", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await PATCH(patch({ unidad: "x" }), ctx)).status).toBe(404);
    authAs(coordinador);
    expect((await PATCH(patch({ unidad: "x" }), ctx)).status).toBe(403);
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce({ ...proyecto, estado: "ACTIVO" } as never);
    const res = await PATCH(patch({ unidad: "x" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INVALID_STATE");
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 for a deliverable of another project or a deleted one", async () => {
    vi.mocked(db.entregable.findFirst).mockResolvedValue(null);
    expect((await PATCH(patch({ unidad: "x" }), ctx)).status).toBe(404);
    expect(db.entregable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ent-1", proyecto_id: "pry-1", deleted_at: null } }),
    );
  });

  it("returns 400 for an empty patch, unknown keys, blank fields or a non-positive quantity", async () => {
    for (const body of [{}, { proyecto_id: "x" }, { unidad: "" }, { cantidad_meta: 0 }, { tipo_medio_exigido: " " }]) {
      expect((await PATCH(patch(body), ctx)).status).toBe(400);
    }
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("requires the new activity to be a live one of the same project", async () => {
    vi.mocked(db.actividad.findFirst).mockResolvedValue(null);
    expect((await PATCH(patch({ actividad_id: "act-x" }), ctx)).status).toBe(400);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("writes the change and audits one EDITAR row per changed field, comparing Decimals by value", async () => {
    const res = await PATCH(patch({ cantidad_meta: 100, unidad: "unidades" }), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.entregable.unidad).toBe("unidades");
    const rows = vi.mocked(logChanges).mock.calls[0][1];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      accion: "EDITAR",
      entidad: "entregable",
      entidad_id: "ent-1",
      proyecto_id: "pry-1",
      campo: "unidad",
      valor_anterior: "prendas",
      valor_nuevo: "unidades",
    });
  });

  it("audits a changed quantity", async () => {
    await PATCH(patch({ cantidad_meta: 250.5 }), ctx);
    const rows = vi.mocked(logChanges).mock.calls[0][1];
    expect(rows[0]).toMatchObject({ campo: "cantidad_meta", valor_anterior: "100", valor_nuevo: "250.5" });
  });

  it("maps the partial unique index to 409 CONFLICT", async () => {
    mocks.txUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { driverAdapterError: { cause: { originalMessage: 'violates unique constraint "entregables_codigo_activo_uq"' } } },
      }),
    );
    const res = await PATCH(patch({ codigo: "1.4-E2" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
  });
});

describe("DELETE /api/v1/projects/:id/deliverables/:deliverableId", () => {
  it("is manager-only and BORRADOR-only", async () => {
    authAs(coordinador);
    expect((await DELETE(del(), ctx)).status).toBe(403);
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce({ ...proyecto, estado: "ACTIVO" } as never);
    expect((await DELETE(del(), ctx)).status).toBe(409);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("soft-deletes and audits EDITAR deleted_at", async () => {
    const res = await DELETE(del(), ctx);
    expect(res.status).toBe(200);
    expect(mocks.txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ent-1" }, data: { deleted_at: expect.any(Date) } }),
    );
    expect(logChanges).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ accion: "EDITAR", entidad: "entregable", entidad_id: "ent-1", proyecto_id: "pry-1", campo: "deleted_at", valor_anterior: null }),
    ]);
  });

  it("returns 404 for a missing deliverable", async () => {
    vi.mocked(db.entregable.findFirst).mockResolvedValue(null);
    expect((await DELETE(del(), ctx)).status).toBe(404);
  });

  it("answers 409 CONFLICT while the deliverable has live (non-voided) avances", async () => {
    vi.mocked(db.avanceEntregable.count).mockResolvedValue(2 as never);
    const res = await DELETE(del(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
    expect(db.avanceEntregable.count).toHaveBeenCalledWith({ where: { entregable_id: "ent-1", anulado_at: null } });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });
});

describe("project row lock (S8: a baseline approval cannot interleave with a structure write)", () => {
  const casos: [string, () => Promise<Response>, ReturnType<typeof vi.fn>][] = [
    ["PATCH", () => PATCH(patch({ cantidad_meta: 100, unidad: "unidades" }), ctx), mocks.txUpdate],
    ["DELETE", () => DELETE(del(), ctx), mocks.txUpdate],
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
