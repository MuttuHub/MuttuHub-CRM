// PUT /api/v1/projects/:id/rubros/:rubroId (B6, S1, decision L7 «Bloquear»).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  rubroFindUnique: vi.fn(),
  deshabilitadoFindUnique: vi.fn(),
  deshabilitadoCreate: vi.fn(),
  deshabilitadoDelete: vi.fn(),
  lineaFindMany: vi.fn(),
  gastoCount: vi.fn(),
  repartoCount: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/db", () => {
  const models = {
    rubro: { findUnique: mocks.rubroFindUnique },
    proyectoRubroDeshabilitado: {
      findUnique: mocks.deshabilitadoFindUnique,
      create: mocks.deshabilitadoCreate,
      delete: mocks.deshabilitadoDelete,
    },
    lineaPresupuestal: { findMany: mocks.lineaFindMany },
    gasto: { count: mocks.gastoCount },
    gastoReparto: { count: mocks.repartoCount },
    $queryRaw: mocks.queryRaw,
  };
  return {
    db: {
      proyecto: { findFirst: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(models)),
    },
  };
});

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChanges } from "@/lib/api/audit-cambios";
import { PUT } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;

const ctx = { params: Promise.resolve({ id: "pry-1", rubroId: "r5" }) };
const rubro = { id: "r5", codigo: "R05", nombre: "Viáticos" };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function put(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/rubros/r5", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const lockedAs = (estado: string) => mocks.queryRaw.mockResolvedValue([{ estado, valor_total: "0.00" }]);

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", miembros: [] } as never);
  lockedAs("BORRADOR");
  mocks.rubroFindUnique.mockResolvedValue(rubro);
  mocks.deshabilitadoFindUnique.mockResolvedValue(null);
  mocks.deshabilitadoCreate.mockResolvedValue({});
  mocks.deshabilitadoDelete.mockResolvedValue({});
  mocks.lineaFindMany.mockResolvedValue([]);
  mocks.gastoCount.mockResolvedValue(0);
  mocks.repartoCount.mockResolvedValue(0);
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("PUT /api/v1/projects/:id/rubros/:rubroId", () => {
  it("disables a rubro at $0 with no expenses, for this project only", async () => {
    mocks.lineaFindMany.mockResolvedValue([{ id: "l-1", monto_proyectado_cop: new Prisma.Decimal("0") }]);
    const res = await PUT(put({ habilitado: false }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rubro_id: "r5", habilitado: false });
    expect(mocks.deshabilitadoCreate).toHaveBeenCalledWith({
      data: { proyecto_id: "pry-1", rubro_id: "r5", created_by_id: "ger-1" },
    });
    // The checks are scoped to this project.
    expect(mocks.lineaFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { proyecto_id: "pry-1", rubro_id: "r5" } }));
  });

  it("writes one EDITAR audit row on the rubro of the project", async () => {
    await PUT(put({ habilitado: false }), ctx);
    expect(logChanges).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logChanges).mock.calls[0]![1]).toEqual([
      {
        usuario_id: "ger-1",
        accion: "EDITAR",
        entidad: "rubro",
        entidad_id: "r5",
        proyecto_id: "pry-1",
        campo: "habilitado",
        valor_anterior: true,
        valor_nuevo: false,
      },
    ]);
  });

  it("refuses to disable a rubro that has money in the project, and says why", async () => {
    mocks.lineaFindMany.mockResolvedValue([
      { id: "l-1", monto_proyectado_cop: new Prisma.Decimal("0") },
      { id: "l-2", monto_proyectado_cop: new Prisma.Decimal("1500000") },
    ]);
    const res = await PUT(put({ habilitado: false }), ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/^No se puede deshabilitar el rubro R05 Viáticos: tiene .*1\.500\.000.* asignados en este proyecto\./);
    expect(mocks.deshabilitadoCreate).not.toHaveBeenCalled();
    expect(logChanges).not.toHaveBeenCalled();
  });

  it("refuses to disable a rubro that has expenses in the project, even at $0", async () => {
    mocks.lineaFindMany.mockResolvedValue([{ id: "l-1", monto_proyectado_cop: new Prisma.Decimal("0") }]);
    mocks.repartoCount.mockResolvedValue(1);
    const res = await PUT(put({ habilitado: false }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "No se puede deshabilitar el rubro R05 Viáticos: tiene gastos registrados en este proyecto.",
    );
    expect(mocks.deshabilitadoCreate).not.toHaveBeenCalled();
  });

  it("re-enables a disabled rubro, always, and audits it", async () => {
    lockedAs("EN_EJECUCION");
    mocks.deshabilitadoFindUnique.mockResolvedValue({ rubro });
    const res = await PUT(put({ habilitado: true }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rubro_id: "r5", habilitado: true });
    expect(mocks.deshabilitadoDelete).toHaveBeenCalledWith({
      where: { proyecto_id_rubro_id: { proyecto_id: "pry-1", rubro_id: "r5" } },
    });
    expect(mocks.lineaFindMany).not.toHaveBeenCalled();
    expect(vi.mocked(logChanges).mock.calls[0]![1]).toEqual([
      expect.objectContaining({ campo: "habilitado", valor_anterior: false, valor_nuevo: true }),
    ]);
  });

  it("works in execution too", async () => {
    lockedAs("EN_EJECUCION");
    expect((await PUT(put({ habilitado: false }), ctx)).status).toBe(200);
  });

  it("answers 409 outside BORRADOR and EN_EJECUCION", async () => {
    lockedAs("CERRADO");
    const res = await PUT(put({ habilitado: false }), ctx);
    expect(res.status).toBe(409);
    expect(mocks.deshabilitadoCreate).not.toHaveBeenCalled();
  });

  it("changes nothing and writes no audit when the rubro is already in that state", async () => {
    mocks.deshabilitadoFindUnique.mockResolvedValue({ rubro });
    const res = await PUT(put({ habilitado: false }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.deshabilitadoCreate).not.toHaveBeenCalled();
    expect(logChanges).not.toHaveBeenCalled();
  });

  it("follows the budget-edit permission: 403 for a role that cannot edit the budget, member COORDINADOR allowed", async () => {
    authAs(colaborador);
    expect((await PUT(put({ habilitado: false }), ctx)).status).toBe(403);
    authAs(coordinador);
    expect((await PUT(put({ habilitado: false }), ctx)).status).toBe(403);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", miembros: [{ id: "m-1" }] } as never);
    expect((await PUT(put({ habilitado: false }), ctx)).status).toBe(200);
    expect(mocks.deshabilitadoCreate).toHaveBeenCalledTimes(1);
  });

  it("answers 404 for a missing project or rubro, and 400 for a bad body", async () => {
    expect((await PUT(put({ habilitado: "no" }), ctx)).status).toBe(400);
    mocks.rubroFindUnique.mockResolvedValue(null);
    expect((await PUT(put({ habilitado: false }), ctx)).status).toBe(404);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);
    expect((await PUT(put({ habilitado: false }), ctx)).status).toBe(404);
  });
});
