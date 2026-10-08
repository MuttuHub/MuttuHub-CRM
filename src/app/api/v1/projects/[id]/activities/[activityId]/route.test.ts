// PATCH/DELETE /api/v1/projects/:id/activities/:activityId (S3 U2b).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ txUpdate: vi.fn() }));

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
    actividad: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ actividad: { update: mocks.txUpdate } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChanges } from "@/lib/api/audit-cambios";
import { DELETE, PATCH } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

const proyecto = {
  id: "pry-1",
  estado: "BORRADOR",
  fecha_inicio: new Date("2026-10-05T00:00:00.000Z"),
  fecha_fin: new Date("2027-01-29T00:00:00.000Z"),
};
const fila = {
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

const ctx = { params: Promise.resolve({ id: "pry-1", activityId: "act-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function patch(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/activities/act-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function del(): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/activities/act-1", { method: "DELETE" });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto as never);
  vi.mocked(db.actividad.findFirst).mockResolvedValue(fila as never);
  vi.mocked(db.objetivo.findFirst).mockResolvedValue({ id: "obj-2" } as never);
  vi.mocked(db.usuario.findFirst).mockResolvedValue({ id: "u-1" } as never);
  mocks.txUpdate.mockImplementation(async ({ data }: { data: object }) => ({ ...fila, ...data }));
});
afterEach(() => vi.clearAllMocks());

describe("PATCH /api/v1/projects/:id/activities/:activityId", () => {
  it("answers 404, 403 for a COORDINADOR, 409 outside BORRADOR", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await PATCH(patch({ nombre: "x" }), ctx)).status).toBe(404);
    authAs(coordinador);
    expect((await PATCH(patch({ nombre: "x" }), ctx)).status).toBe(403);
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce({ ...proyecto, estado: "ACTIVO" } as never);
    const res = await PATCH(patch({ nombre: "x" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INVALID_STATE");
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 for an activity of another project or a deleted one", async () => {
    vi.mocked(db.actividad.findFirst).mockResolvedValue(null);
    expect((await PATCH(patch({ nombre: "x" }), ctx)).status).toBe(404);
    expect(db.actividad.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "act-1", proyecto_id: "pry-1", deleted_at: null } }),
    );
  });

  it("returns 400 for an empty patch, unknown or derived fields, or bad weeks", async () => {
    for (const body of [
      {},
      { fecha_inicio: "2026-10-19" },
      { proyecto_id: "x" },
      { peso: 0 },
      { semana_inicio: 7 },
      { semana_fin: 18 },
      { semana_inicio: 0 },
    ]) {
      expect((await PATCH(patch(body), ctx)).status).toBe(400);
    }
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("recomputes a non-manual weight when the weeks change and audits the changed fields", async () => {
    const res = await PATCH(patch({ semana_fin: 7 }), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(mocks.txUpdate.mock.calls[0][0].data).toMatchObject({ semana_fin: 7, peso: 5, peso_manual: false });
    expect(json.actividad).toMatchObject({ semana_fin: 7, fecha_fin: "2026-11-22", peso: 5 });
    const rows = vi.mocked(logChanges).mock.calls[0][1];
    expect(rows.map((row) => row.campo).sort()).toEqual(["peso", "semana_fin"]);
    expect(rows.every((row) => row.accion === "EDITAR" && row.entidad === "actividad" && row.proyecto_id === "pry-1")).toBe(true);
  });

  it("keeps a manual weight when the weeks change", async () => {
    vi.mocked(db.actividad.findFirst).mockResolvedValue({ ...fila, peso: new Prisma.Decimal(2.5), peso_manual: true } as never);
    await PATCH(patch({ semana_fin: 7 }), ctx);
    expect(mocks.txUpdate.mock.calls[0][0].data).toMatchObject({ semana_fin: 7, peso: 2.5, peso_manual: true });
    const rows = vi.mocked(logChanges).mock.calls[0][1];
    expect(rows.map((row) => row.campo)).toEqual(["semana_fin"]);
  });

  it("a null weight clears the manual flag back to the default", async () => {
    vi.mocked(db.actividad.findFirst).mockResolvedValue({ ...fila, peso: new Prisma.Decimal(2.5), peso_manual: true } as never);
    await PATCH(patch({ peso: null }), ctx);
    expect(mocks.txUpdate.mock.calls[0][0].data).toMatchObject({ peso: 4, peso_manual: false });
  });

  it("requires the new objective to be a live one of the same project", async () => {
    vi.mocked(db.objetivo.findFirst).mockResolvedValue(null);
    expect((await PATCH(patch({ objetivo_id: "obj-x" }), ctx)).status).toBe(400);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("requires an active responsable, and null clears it", async () => {
    vi.mocked(db.usuario.findFirst).mockResolvedValue(null);
    expect((await PATCH(patch({ responsable_id: "u-9" }), ctx)).status).toBe(400);
    vi.mocked(db.usuario.findFirst).mockClear();
    expect((await PATCH(patch({ responsable_id: null }), ctx)).status).toBe(200);
    expect(db.usuario.findFirst).not.toHaveBeenCalled();
  });

  it("flags nothing as changed when the values are the same (no audit row, still 200)", async () => {
    const res = await PATCH(patch({ nombre: fila.nombre }), ctx);
    expect(res.status).toBe(200);
    expect(logChanges).not.toHaveBeenCalled();
  });

  it("maps the partial unique index to 409 CONFLICT", async () => {
    mocks.txUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { driverAdapterError: { cause: { originalMessage: 'violates unique constraint "actividades_codigo_activo_uq"' } } },
      }),
    );
    const res = await PATCH(patch({ codigo: "2.1" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
  });
});

describe("DELETE /api/v1/projects/:id/activities/:activityId", () => {
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
      expect.objectContaining({ where: { id: "act-1" }, data: { deleted_at: expect.any(Date) } }),
    );
    expect(logChanges).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ accion: "EDITAR", entidad: "actividad", entidad_id: "act-1", proyecto_id: "pry-1", campo: "deleted_at", valor_anterior: null }),
    ]);
  });

  it("returns 404 for a missing activity", async () => {
    vi.mocked(db.actividad.findFirst).mockResolvedValue(null);
    expect((await DELETE(del(), ctx)).status).toBe(404);
  });
});
