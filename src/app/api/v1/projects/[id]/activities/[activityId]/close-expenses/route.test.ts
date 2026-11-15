// POST /api/v1/projects/:id/activities/:activityId/close-expenses (S11/T14.5-A).
//
// Mocked `@/lib/db`: pins the gate order of the neighbouring execution writes (404 -> 403 -> 409 -> 400), the
// 400 of closing without a nota (nothing written), the 409 of closing an activity that is already closed — also
// when the row changed under the request —, the three columns written with their audit rows and the closure
// state the response exposes for the financial screen (5-B).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ updateMany: vi.fn(), reread: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));

vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});

vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    actividad: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ actividad: { updateMany: mocks.updateMany, findFirstOrThrow: mocks.reread } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChanges } from "@/lib/api/audit-cambios";
import { ACTIVIDAD_YA_CERRADA_MESSAGE, NOTA_CIERRE_OBLIGATORIA } from "@/lib/api/cierre-gastos";
import { POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

const proyecto = (estado = "EN_EJECUCION", miembro = false) =>
  ({
    id: "pry-1",
    estado,
    fecha_inicio: new Date("2026-10-05"),
    fecha_fin: new Date("2027-01-29"),
    miembros: miembro ? [{ id: "m-1" }] : [],
  }) as never;

const NOTA = "No se requirió transporte porque el taller fue en el mismo municipio.";
const CERRADA_AT = new Date("2026-11-16T15:00:00.000Z");

const actividadAbierta = {
  id: "act-12",
  gastos_cerrados_at: null,
  gastos_cerrados_nota: null,
  gastos_cerrados_por: null,
};

const actividadCerrada = {
  id: "act-12",
  gastos_cerrados_at: CERRADA_AT,
  gastos_cerrados_nota: NOTA,
  gastos_cerrados_por: "coord-1",
};

const ctx = { params: Promise.resolve({ id: "pry-1", activityId: "act-12" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/activities/act-12/close-expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.actividad.findFirst).mockResolvedValue(actividadAbierta as never);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.reread.mockResolvedValue(actividadCerrada);
});
afterEach(() => vi.clearAllMocks());

describe("POST activities/:activityId/close-expenses", () => {
  it("answers 404 for an unknown project, 403 for a non-member and 409 outside EN_EJECUCION, writing nothing", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post({ nota: NOTA }), ctx)).status).toBe(404);

    authAs(coordinador);
    expect((await POST(post({ nota: NOTA }), ctx)).status).toBe(403);

    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("SUSPENDIDO"));
    expect((await POST(post({ nota: NOTA }), ctx)).status).toBe(409);

    expect(db.$transaction).not.toHaveBeenCalled();
    expect(logChanges).not.toHaveBeenCalled();
  });

  it("answers 404 for an activity of another project and never touches it", async () => {
    vi.mocked(db.actividad.findFirst).mockResolvedValue(null);

    const res = await POST(post({ nota: NOTA }), ctx);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "La actividad no existe.", code: "NOT_FOUND" });
    expect(db.actividad.findFirst).toHaveBeenCalledWith({
      where: { id: "act-12", proyecto_id: "pry-1", deleted_at: null },
      select: { id: true, gastos_cerrados_at: true, gastos_cerrados_nota: true, gastos_cerrados_por: true },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects the closure without a nota and changes nothing (S11)", async () => {
    for (const body of [{}, { nota: "" }, { nota: "   " }]) {
      const res = await POST(post(body), ctx);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: NOTA_CIERRE_OBLIGATORIA, code: "VALIDATION_ERROR" });
    }
    expect(db.actividad.findFirst).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(logChanges).not.toHaveBeenCalled();
  });

  it("closes with the nota, writes the three columns and audits the closure (S11)", async () => {
    const res = await POST(post({ nota: `  ${NOTA}  ` }), ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      actividad: {
        id: "act-12",
        gastos_cerrados: true,
        gastos_cerrados_at: "2026-11-16T15:00:00.000Z",
        gastos_cerrados_nota: NOTA,
        gastos_cerrados_por: "coord-1",
      },
    });

    const { where, data } = mocks.updateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(where).toEqual({ id: "act-12", proyecto_id: "pry-1", deleted_at: null, gastos_cerrados_at: null });
    expect(data).toMatchObject({ gastos_cerrados_nota: NOTA, gastos_cerrados_por: "ger-1" });

    const filas = vi.mocked(logChanges).mock.calls[0][1];
    expect(filas).toContainEqual(
      expect.objectContaining({ accion: "EDITAR", entidad: "actividad", campo: "gastos_cerrados_nota", valor_nuevo: NOTA }),
    );
  });

  it("answers 409 for an activity that is already closed and never rewrites it (S11)", async () => {
    vi.mocked(db.actividad.findFirst).mockResolvedValue(actividadCerrada as never);

    const res = await POST(post({ nota: NOTA }), ctx);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: ACTIVIDAD_YA_CERRADA_MESSAGE, code: "CONFLICT" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("answers 409 when a racer closed the activity after the request read it (S11)", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(post({ nota: NOTA }), ctx);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: ACTIVIDAD_YA_CERRADA_MESSAGE, code: "CONFLICT" });
    expect(logChanges).not.toHaveBeenCalled();
  });
});
