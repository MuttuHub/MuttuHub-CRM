// POST /api/v1/projects/:id/activities/:activityId/reopen-expenses (S11/T14.5-A).
//
// Mocked `@/lib/db`: the reopening demands a motivo, clears the three closure columns in one state-pinned
// write, leaves the motivo in the ledger, and answers the open state. The 409 of reopening an activity that is
// not closed is the mirror of the closure's own.

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
import { ACTIVIDAD_SIN_CIERRE_MESSAGE, MOTIVO_REAPERTURA_OBLIGATORIO } from "@/lib/api/cierre-gastos";
import { POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;

const proyecto = (estado = "EN_EJECUCION") =>
  ({
    id: "pry-1",
    estado,
    fecha_inicio: new Date("2026-10-05"),
    fecha_fin: new Date("2027-01-29"),
    miembros: [],
  }) as never;

const NOTA = "No se requirió transporte porque el taller fue en el mismo municipio.";
const MOTIVO = "Llegó una factura de noviembre que faltaba.";

const actividadCerrada = {
  id: "act-12",
  gastos_cerrados_at: new Date("2026-11-16T15:00:00.000Z"),
  gastos_cerrados_nota: NOTA,
  gastos_cerrados_por: "coord-1",
};

const actividadAbierta = {
  id: "act-12",
  gastos_cerrados_at: null,
  gastos_cerrados_nota: null,
  gastos_cerrados_por: null,
};

const ctx = { params: Promise.resolve({ id: "pry-1", activityId: "act-12" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/activities/act-12/reopen-expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.actividad.findFirst).mockResolvedValue(actividadCerrada as never);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.reread.mockResolvedValue(actividadAbierta);
});
afterEach(() => vi.clearAllMocks());

describe("POST activities/:activityId/reopen-expenses", () => {
  it("answers 404 for an unknown project and 403 for a COLABORADOR who is not a member, writing nothing", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post({ motivo: MOTIVO }), ctx)).status).toBe(404);

    authAs(colaborador);
    expect((await POST(post({ motivo: MOTIVO }), ctx)).status).toBe(403);

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects the reopening without a motivo and changes nothing (S11, D4)", async () => {
    for (const body of [{}, { motivo: "" }, { motivo: "   " }, { nota: NOTA }]) {
      const res = await POST(post(body), ctx);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: MOTIVO_REAPERTURA_OBLIGATORIO, code: "VALIDATION_ERROR" });
    }
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(logChanges).not.toHaveBeenCalled();
  });

  it("clears the closure, records the motivo and answers the open activity (S11, D4)", async () => {
    const res = await POST(post({ motivo: ` ${MOTIVO} ` }), ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      actividad: {
        id: "act-12",
        gastos_cerrados: false,
        gastos_cerrados_at: null,
        gastos_cerrados_nota: null,
        gastos_cerrados_por: null,
      },
    });

    // The three columns the expense writers read: with them clear, the same line is allowed in again.
    const { where, data } = mocks.updateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(where).toEqual({
      id: "act-12",
      proyecto_id: "pry-1",
      deleted_at: null,
      gastos_cerrados_at: { not: null },
    });
    expect(data).toEqual({ gastos_cerrados_at: null, gastos_cerrados_nota: null, gastos_cerrados_por: null });

    const filas = vi.mocked(logChanges).mock.calls[0][1];
    expect(filas).toContainEqual(
      expect.objectContaining({ campo: "gastos_cerrados_nota", valor_anterior: NOTA, valor_nuevo: null }),
    );
    expect(filas).toContainEqual(
      expect.objectContaining({ accion: "EDITAR", entidad: "actividad", campo: "motivo_reapertura", valor_nuevo: MOTIVO }),
    );
  });

  it("answers 409 for an activity whose expenses are open and never rewrites it (S11)", async () => {
    vi.mocked(db.actividad.findFirst).mockResolvedValue(actividadAbierta as never);

    const res = await POST(post({ motivo: MOTIVO }), ctx);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: ACTIVIDAD_SIN_CIERRE_MESSAGE, code: "CONFLICT" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("answers 409 when a racer reopened the activity after the request read it (S11)", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(post({ motivo: MOTIVO }), ctx);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: ACTIVIDAD_SIN_CIERRE_MESSAGE, code: "CONFLICT" });
    expect(logChanges).not.toHaveBeenCalled();
  });
});
