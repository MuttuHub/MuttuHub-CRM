// GET/PUT /api/v1/projects/:id/programming (S5 U3).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  lineaFindMany: vi.fn(),
  celdaFindMany: vi.fn(),
  celdaCreate: vi.fn(),
  celdaUpdate: vi.fn(),
  celdaDelete: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/db", () => {
  const models = {
    lineaPresupuestal: { findMany: mocks.lineaFindMany },
    programacionPeriodo: {
      findMany: mocks.celdaFindMany,
      create: mocks.celdaCreate,
      update: mocks.celdaUpdate,
      delete: mocks.celdaDelete,
    },
    $queryRaw: mocks.queryRaw,
  };
  return {
    db: {
      ...models,
      proyecto: { findFirst: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(models)),
    },
  };
});

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChanges } from "@/lib/api/audit-cambios";
import { GET, PUT } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;

const proyecto = (estado = "BORRADOR", miembro = false, over: object = {}) =>
  ({
    id: "pry-1",
    estado,
    valor_total: new Prisma.Decimal(100),
    fecha_inicio: new Date("2026-10-05T00:00:00.000Z"),
    fecha_fin: new Date("2027-01-29T00:00:00.000Z"),
    miembros: miembro ? [{ id: "m-1" }] : [],
    ...over,
  }) as never;

const ctx = { params: Promise.resolve({ id: "pry-1" }) };

const lineaR01 = {
  id: "l1",
  rubro_id: "r1",
  monto_proyectado_cop: new Prisma.Decimal("100"),
  rubro: { codigo: "R01", nombre: "Personal", orden: 1, activo: true },
};
const lineaR12 = {
  id: "l12",
  rubro_id: "r12",
  monto_proyectado_cop: new Prisma.Decimal("50"),
  rubro: { codigo: "R12", nombre: "Transporte", orden: 12, activo: true },
};
const celda = (id: string, linea_id: string, periodo: string, valor: string) => ({
  id,
  linea_id,
  periodo,
  valor: new Prisma.Decimal(valor),
});

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
const get = () => new Request("http://localhost/api/v1/projects/pry-1/programming");
function put(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/programming", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  mocks.queryRaw.mockResolvedValue([{ estado: "BORRADOR", valor_total: "100.00" }]);
  mocks.lineaFindMany.mockResolvedValue([lineaR01, lineaR12]);
  mocks.celdaFindMany.mockResolvedValue([]);
  mocks.celdaCreate.mockImplementation(async ({ data }: { data: { linea_id: string; periodo: string } }) => ({
    id: `new-${data.linea_id}-${data.periodo}`,
  }));
  mocks.celdaUpdate.mockResolvedValue({});
  mocks.celdaDelete.mockResolvedValue({});
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("GET programming", () => {
  it("returns the project periods, the cells and the control per rubro", async () => {
    mocks.celdaFindMany.mockResolvedValue([
      celda("c1", "l1", "2026-10", "60"),
      celda("c2", "l1", "2026-11", "30"),
      celda("c3", "l12", "2026-10", "50"),
    ]);

    const res = await GET(get(), ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.estado).toBe("BORRADOR");
    expect(json.periodos).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(json.filas).toEqual([
      { rubro_id: "r1", periodo: "2026-10", valor: "60.00" },
      { rubro_id: "r1", periodo: "2026-11", valor: "30.00" },
      { rubro_id: "r12", periodo: "2026-10", valor: "50.00" },
    ]);
    expect(json.control_por_rubro).toEqual([
      { rubro_id: "r1", codigo: "R01", nombre: "Personal", asignado: "100.00", programado: "90.00", control: "-10.00" },
      { rubro_id: "r12", codigo: "R12", nombre: "Transporte", asignado: "50.00", programado: "50.00", control: "0.00" },
    ]);
    expect(json.programacion_pendiente).toBe(false);
  });

  it("derives programacion_pendiente when no cell is above zero", async () => {
    const json = await (await GET(get(), ctx)).json();
    expect(json.programacion_pendiente).toBe(true);
    expect(json.filas).toEqual([]);
  });

  it("answers 409 INVALID_STATE without project dates", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("BORRADOR", false, { fecha_fin: null }));
    const res = await GET(get(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INVALID_STATE");
  });

  it("allows a member COORDINADOR, 403 for non-members, 404 when missing", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("BORRADOR", true));
    expect((await GET(get(), ctx)).status).toBe(200);
    for (const usuario of [coordinador, colaborador]) {
      authAs(usuario);
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("BORRADOR", false));
      expect((await GET(get(), ctx)).status, usuario.rol).toBe(403);
    }
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await GET(get(), ctx)).status).toBe(404);
  });
});

describe("PUT programming: gates", () => {
  const cuerpo = { filas: [{ rubro_id: "r1", periodo: "2026-10", valor: "10" }] };

  it("answers 404, 403 for non-managers, 409 outside BORRADOR and 409 without dates", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await PUT(put(cuerpo), ctx)).status).toBe(404);

    for (const usuario of [coordinador, colaborador]) {
      authAs(usuario);
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("BORRADOR", false));
      expect((await PUT(put(cuerpo), ctx)).status, usuario.rol).toBe(403);
    }

    // S5: a member of either role writes the monthly programming. The writes
    // of this loop are cleared so the "not called" assertion below still
    // refers to the blocked case that follows it.
    for (const usuario of [coordinador, colaborador]) {
      authAs(usuario);
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("BORRADOR", true));
      expect((await PUT(put(cuerpo), ctx)).status, usuario.rol).not.toBe(403);
    }
    mocks.celdaCreate.mockClear();

    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION"));
    const bloqueado = await PUT(put(cuerpo), ctx);
    expect(bloqueado.status).toBe(409);
    expect((await bloqueado.json()).error).toContain("programación");

    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("BORRADOR", false, { fecha_inicio: null }));
    expect((await PUT(put(cuerpo), ctx)).status).toBe(409);
    expect(mocks.celdaCreate).not.toHaveBeenCalled();
  });

  it("re-checks BORRADOR under the row lock", async () => {
    mocks.queryRaw.mockResolvedValue([{ estado: "EN_EJECUCION", valor_total: "100.00" }]);
    expect((await PUT(put(cuerpo), ctx)).status).toBe(409);
    expect(mocks.celdaCreate).not.toHaveBeenCalled();
  });
});

describe("PUT programming: validation (400)", () => {
  const rechazados: [string, unknown][] = [
    ["a period outside the project range", { filas: [{ rubro_id: "r1", periodo: "2027-02", valor: "1" }] }],
    ["a malformed period", { filas: [{ rubro_id: "r1", periodo: "2026-1", valor: "1" }] }],
    ["a duplicate (rubro, periodo)", { filas: [{ rubro_id: "r1", periodo: "2026-10", valor: "1" }, { rubro_id: "r1", periodo: "2026-10", valor: "2" }] }],
    ["a negative value", { filas: [{ rubro_id: "r1", periodo: "2026-10", valor: "-1" }] }],
    ["a float-noise value", { filas: [{ rubro_id: "r1", periodo: "2026-10", valor: 0.1 + 0.2 }] }],
    ["a rubro without a budget line", { filas: [{ rubro_id: "r99", periodo: "2026-10", valor: "1" }] }],
    ["no filas array", {}],
  ];
  it.each(rechazados)("rejects %s", async (_name, body) => {
    const res = await PUT(put(body), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
    expect(mocks.celdaCreate).not.toHaveBeenCalled();
    expect(mocks.celdaDelete).not.toHaveBeenCalled();
  });

  it("explains the out-of-range period", async () => {
    const res = await PUT(put({ filas: [{ rubro_id: "r1", periodo: "2027-02", valor: "1" }] }), ctx);
    expect((await res.json()).error).toBe("El periodo 2027-02 está fuera del rango del proyecto.");
  });
});

describe("PUT programming: writes", () => {
  it("creates new cells, updates changed ones and deletes cells that became zero or were omitted", async () => {
    mocks.celdaFindMany.mockResolvedValue([
      celda("c1", "l1", "2026-10", "60"),
      celda("c2", "l1", "2026-11", "30"),
      celda("c3", "l12", "2026-10", "50"),
      celda("c4", "l12", "2026-11", "5"),
    ]);

    const res = await PUT(
      put({
        filas: [
          { rubro_id: "r1", periodo: "2026-10", valor: "60.00" },
          { rubro_id: "r1", periodo: "2026-11", valor: "35" },
          { rubro_id: "r1", periodo: "2026-12", valor: 10 },
          { rubro_id: "r12", periodo: "2026-10", valor: "0" },
        ],
      }),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(mocks.celdaUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.celdaUpdate.mock.calls[0][0].where).toEqual({ id: "c2" });
    expect(mocks.celdaCreate).toHaveBeenCalledTimes(1);
    expect(mocks.celdaCreate.mock.calls[0][0].data).toMatchObject({ proyecto_id: "pry-1", linea_id: "l1", periodo: "2026-12" });
    expect(mocks.celdaDelete.mock.calls.map((c) => c[0].where.id).sort()).toEqual(["c3", "c4"]);

    const audit = vi.mocked(logChanges).mock.calls[0][1];
    expect(audit).toHaveLength(4);
    expect(audit.find((a) => a.entidad_id === "c2")).toMatchObject({
      accion: "EDITAR", entidad: "programacion", campo: "2026-11", valor_anterior: "30.00", valor_nuevo: "35.00", proyecto_id: "pry-1",
    });
    expect(audit.find((a) => a.accion === "CREAR")).toMatchObject({ entidad_id: "new-l1-2026-12", campo: "2026-12", valor_anterior: null, valor_nuevo: "10.00" });
    expect(audit.find((a) => a.entidad_id === "c3")).toMatchObject({ accion: "EDITAR", valor_anterior: "50.00", valor_nuevo: "0.00" });
  });

  it("writes nothing and audits nothing when nothing changed", async () => {
    mocks.celdaFindMany.mockResolvedValue([celda("c1", "l1", "2026-10", "60")]);
    const res = await PUT(put({ filas: [{ rubro_id: "r1", periodo: "2026-10", valor: "60" }] }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.celdaUpdate).not.toHaveBeenCalled();
    expect(mocks.celdaCreate).not.toHaveBeenCalled();
    expect(mocks.celdaDelete).not.toHaveBeenCalled();
    expect(logChanges).not.toHaveBeenCalled();
  });

  it("accepts a control different from zero (informational in BORRADOR) and reports it", async () => {
    mocks.celdaFindMany.mockResolvedValue([celda("c1", "l1", "2026-10", "150")]);
    const json = await (await PUT(put({ filas: [{ rubro_id: "r1", periodo: "2026-10", valor: "150" }] }), ctx)).json();
    expect(json.control_por_rubro[0]).toMatchObject({ rubro_id: "r1", programado: "150.00", control: "50.00" });
  });
});
