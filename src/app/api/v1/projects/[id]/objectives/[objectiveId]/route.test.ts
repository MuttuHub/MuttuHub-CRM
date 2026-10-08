// PATCH/DELETE /api/v1/projects/:id/objectives/:objectiveId (S3 U1, U2b, U3).

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
    actividad: { count: vi.fn() },
    indicador: { count: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ objetivo: { update: mocks.txUpdate } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChanges } from "@/lib/api/audit-cambios";
import { DELETE, PATCH } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

const proyecto = { id: "pry-1", estado: "BORRADOR" };
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

const ctx = { params: Promise.resolve({ id: "pry-1", objectiveId: "obj-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function patch(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/objectives/obj-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function del(): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/objectives/obj-1", { method: "DELETE" });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto as never);
  vi.mocked(db.objetivo.findFirst).mockResolvedValue(objetivoRow as never);
  vi.mocked(db.actividad.count).mockResolvedValue(0 as never);
  vi.mocked(db.indicador.count).mockResolvedValue(0 as never);
  mocks.txUpdate.mockImplementation(async ({ data }: { data: object }) => ({ ...objetivoRow, ...data }));
});
afterEach(() => vi.clearAllMocks());

describe("PATCH /api/v1/projects/:id/objectives/:objectiveId", () => {
  it("answers 404 for a missing project, then 403 for a COORDINADOR, then 409 outside BORRADOR", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await PATCH(patch({ codigo: "OE2" }), ctx)).status).toBe(404);

    authAs(coordinador);
    expect((await PATCH(patch({ codigo: "OE2" }), ctx)).status).toBe(403);

    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce({ ...proyecto, estado: "ACTIVO" } as never);
    const res = await PATCH(patch({ codigo: "OE2" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INVALID_STATE");
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 for an objective of another project or a deleted one", async () => {
    vi.mocked(db.objetivo.findFirst).mockResolvedValue(null);
    const res = await PATCH(patch({ codigo: "OE2" }), ctx);
    expect(res.status).toBe(404);
    expect(db.objetivo.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "obj-1", proyecto_id: "pry-1", deleted_at: null } }),
    );
  });

  it("returns 400 for an empty patch, a forbidden field or a blank codigo", async () => {
    for (const body of [{}, { proyecto_id: "x" }, { deleted_at: null }, { codigo: "" }]) {
      expect((await PATCH(patch(body), ctx)).status).toBe(400);
    }
  });

  it("writes only the changed fields and audits one EDITAR row per field", async () => {
    const res = await PATCH(patch({ codigo: "OE2", descripcion: objetivoRow.descripcion }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "obj-1" }, data: { codigo: "OE2", descripcion: objetivoRow.descripcion } }),
    );
    expect(logChanges).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({
        accion: "EDITAR",
        entidad: "objetivo",
        entidad_id: "obj-1",
        proyecto_id: "pry-1",
        campo: "codigo",
        valor_anterior: "OE1",
        valor_nuevo: "OE2",
      }),
    ]);
  });

  it("maps the partial unique index to 409 CONFLICT", async () => {
    mocks.txUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { driverAdapterError: { cause: { originalMessage: 'violates unique constraint "objetivos_codigo_activo_uq"' } } },
      }),
    );
    const res = await PATCH(patch({ codigo: "OE2" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
  });
});

describe("DELETE /api/v1/projects/:id/objectives/:objectiveId", () => {
  it("is manager-only and BORRADOR-only", async () => {
    authAs(coordinador);
    expect((await DELETE(del(), ctx)).status).toBe(403);
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce({ ...proyecto, estado: "ACTIVO" } as never);
    expect((await DELETE(del(), ctx)).status).toBe(409);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("returns 409 CONFLICT while the objective has live activities", async () => {
    vi.mocked(db.actividad.count).mockResolvedValue(2 as never);
    const res = await DELETE(del(), ctx);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
    expect(db.actividad.count).toHaveBeenCalledWith({ where: { objetivo_id: "obj-1", deleted_at: null } });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("returns 409 CONFLICT while the objective has live indicators", async () => {
    vi.mocked(db.indicador.count).mockResolvedValue(1 as never);
    const res = await DELETE(del(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
    expect(db.indicador.count).toHaveBeenCalledWith({ where: { objetivo_id: "obj-1", deleted_at: null } });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("soft-deletes and audits EDITAR deleted_at", async () => {
    const res = await DELETE(del(), ctx);
    expect(res.status).toBe(200);
    expect(mocks.txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "obj-1" }, data: { deleted_at: expect.any(Date) } }),
    );
    expect(logChanges).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({
        accion: "EDITAR",
        entidad: "objetivo",
        entidad_id: "obj-1",
        proyecto_id: "pry-1",
        campo: "deleted_at",
        valor_anterior: null,
      }),
    ]);
  });
});
