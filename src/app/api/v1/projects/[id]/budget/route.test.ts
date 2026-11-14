// GET/PUT /api/v1/projects/:id/budget (S5 U3).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  rubroFindMany: vi.fn(),
  lineaFindMany: vi.fn(),
  lineaCreate: vi.fn(),
  lineaUpdate: vi.fn(),
  lineaDelete: vi.fn(),
  actividadFindMany: vi.fn(),
  gastoCount: vi.fn(),
  celdaDeleteMany: vi.fn(),
  proyectoUpdate: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/db", () => {
  const models = {
    rubro: { findMany: mocks.rubroFindMany },
    lineaPresupuestal: {
      findMany: mocks.lineaFindMany,
      create: mocks.lineaCreate,
      update: mocks.lineaUpdate,
      delete: mocks.lineaDelete,
    },
    actividad: { findMany: mocks.actividadFindMany },
    gasto: { count: mocks.gastoCount },
    programacionPeriodo: { deleteMany: mocks.celdaDeleteMany },
    proyecto: { update: mocks.proyectoUpdate },
    $queryRaw: mocks.queryRaw,
  };
  return {
    db: {
      ...models,
      proyecto: { findFirst: vi.fn(), update: mocks.proyectoUpdate },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(models)),
    },
  };
});

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChanges } from "@/lib/api/audit-cambios";
import { GET, PUT } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const admin = { id: "adm-1", rol: "ADMINISTRADOR" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;

const proyecto = (estado = "BORRADOR", miembro = false, over: object = {}) =>
  ({
    id: "pry-1",
    estado,
    valor_total: new Prisma.Decimal(100),
    fecha_inicio: null,
    fecha_fin: null,
    oportunidad: null,
    miembros: miembro ? [{ id: "m-1" }] : [],
    ...over,
  }) as never;

const ctx = { params: Promise.resolve({ id: "pry-1" }) };

const rubros = Array.from({ length: 15 }, (_, i) => ({
  id: `r${i + 1}`,
  codigo: `R${String(i + 1).padStart(2, "0")}`,
  nombre: `Rubro ${i + 1}`,
  activo: true,
  orden: i + 1,
}));
const popSuspendido = { id: "pop", codigo: null, nombre: "Material POP", activo: false, orden: 0 };

const act11 = { id: "a-11", codigo: "1.1", nombre: "Taller de diseño" };
const act12 = { id: "a-12", codigo: "1.2", nombre: "Feria" };
const act110 = { id: "a-110", codigo: "1.10", nombre: "Cierre" };
type Act = { id: string; codigo: string; nombre: string };

/** A stored line; without `actividad` it is a legacy line (D9). */
const linea = (rubro_id: string, monto: string, id = `l-${rubro_id}`, actividad: Act | null = null) => ({
  id,
  proyecto_id: "pry-1",
  rubro_id,
  actividad_id: actividad?.id ?? null,
  actividad,
  monto_proyectado_cop: new Prisma.Decimal(monto),
});

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
const get = () => new Request("http://localhost/api/v1/projects/pry-1/budget");
function put(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/budget", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
type Item = { actividad_id?: string | null; rubro_id: string; valor: string | number };
/** S1: the PUT body is the whole budget, one item per activity + rubro. */
const cuerpo = (...lineas: Item[]) => ({ lineas });
const item = (actividad: Act | null, rubro_id: string, valor: string | number): Item => ({
  actividad_id: actividad?.id ?? null,
  rubro_id,
  valor,
});

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  mocks.rubroFindMany.mockResolvedValue(rubros);
  mocks.lineaFindMany.mockResolvedValue([]);
  mocks.queryRaw.mockResolvedValue([{ estado: "BORRADOR", valor_total: "100.00" }]);
  mocks.lineaCreate.mockImplementation(async ({ data }: { data: { rubro_id: string } }) => ({
    id: `new-${data.rubro_id}`,
  }));
  mocks.lineaUpdate.mockResolvedValue({});
  mocks.lineaDelete.mockResolvedValue({});
  mocks.actividadFindMany.mockResolvedValue([act11, act12, act110]);
  mocks.gastoCount.mockResolvedValue(0);
  mocks.celdaDeleteMany.mockResolvedValue({ count: 0 });
  mocks.proyectoUpdate.mockResolvedValue({});
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("GET budget", () => {
  it("returns a virtual $0 row for each of the 15 active rubros when nothing is saved", async () => {
    const res = await GET(get(), ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.estado).toBe("BORRADOR");
    expect(json.rubros).toHaveLength(15);
    expect(json.rubros[0]).toEqual({
      rubro_id: "r1",
      codigo: "R01",
      nombre: "Rubro 1",
      activo: true,
      linea_id: null,
      asignado: "0.00",
      heredado_pendiente: false,
    });
    expect(json.suma).toBe("0.00");
    expect(json.valor_total).toBe("100.00");
    expect(json.diferencia).toBe("-100.00");
  });

  it("shows saved lines, sums exactly and flags a suspended legacy rubro last", async () => {
    mocks.rubroFindMany.mockResolvedValue([popSuspendido, ...rubros]);
    mocks.lineaFindMany.mockResolvedValue([linea("r1", "59500000.10"), linea("r2", "0.20"), linea("pop", "300")]);

    const json = await (await GET(get(), ctx)).json();

    expect(json.rubros[0].rubro_id).toBe("r1");
    expect(json.rubros[0]).toMatchObject({ linea_id: "l-r1", asignado: "59500000.10" });
    const ultimo = json.rubros[json.rubros.length - 1];
    expect(ultimo).toMatchObject({ rubro_id: "pop", codigo: null, activo: false, heredado_pendiente: true, asignado: "300.00" });
    expect(json.suma).toBe("59500300.30");
    expect(mocks.rubroFindMany.mock.calls[0][0].where.OR).toBeDefined();
  });

  it("lists each activity + rubro line, and the rubro row is their sum (S6)", async () => {
    // S6: «Una actividad con Formación $15.000.000 y Transporte $8.000.000 aparece con las dos líneas,
    // y esos valores suman en sus rubros.» r3 = Formación, r5 = Transporte; 1.2 adds to Formación too.
    mocks.lineaFindMany.mockResolvedValue([
      linea("r5", "8000000", "l-11-r5", act11),
      linea("r3", "2000000", "l-12-r3", act12),
      linea("r3", "15000000", "l-11-r3", act11),
      linea("r1", "500", "l-r1"),
    ]);

    const json = await (await GET(get(), ctx)).json();

    expect(json.lineas).toEqual([
      { linea_id: "l-11-r3", actividad_id: "a-11", actividad_codigo: "1.1", actividad_nombre: "Taller de diseño", rubro_id: "r3", rubro_codigo: "R03", rubro_nombre: "Rubro 3", valor: "15000000.00" },
      { linea_id: "l-11-r5", actividad_id: "a-11", actividad_codigo: "1.1", actividad_nombre: "Taller de diseño", rubro_id: "r5", rubro_codigo: "R05", rubro_nombre: "Rubro 5", valor: "8000000.00" },
      { linea_id: "l-12-r3", actividad_id: "a-12", actividad_codigo: "1.2", actividad_nombre: "Feria", rubro_id: "r3", rubro_codigo: "R03", rubro_nombre: "Rubro 3", valor: "2000000.00" },
      // A1: a legacy line has no activity and goes last.
      { linea_id: "l-r1", actividad_id: null, actividad_codigo: null, actividad_nombre: null, rubro_id: "r1", rubro_codigo: "R01", rubro_nombre: "Rubro 1", valor: "500.00" },
    ]);
    expect(json.rubros.find((r: { rubro_id: string }) => r.rubro_id === "r3")).toMatchObject({ asignado: "17000000.00" });
    expect(json.rubros.find((r: { rubro_id: string }) => r.rubro_id === "r5")).toMatchObject({ asignado: "8000000.00" });
    expect(json.suma).toBe("25000500.00");
  });

  it("orders activities by their code as numbers, so 1.10 comes after 1.2", async () => {
    mocks.lineaFindMany.mockResolvedValue([linea("r1", "1", "l-110", act110), linea("r1", "1", "l-12", act12)]);
    const json = await (await GET(get(), ctx)).json();
    expect(json.lineas.map((l: { actividad_codigo: string }) => l.actividad_codigo)).toEqual(["1.2", "1.10"]);
  });

  it("returns null valor_total and diferencia while the project has none", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("BORRADOR", false, { valor_total: null }));
    const json = await (await GET(get(), ctx)).json();
    expect(json.valor_total).toBeNull();
    expect(json.diferencia).toBeNull();
  });

  it("allows ADMINISTRADOR, GERENCIA and a member COORDINADOR; 403 for others; 404 when missing", async () => {
    for (const [usuario, miembro, status] of [
      [admin, false, 200],
      [gerencia, false, 200],
      [coordinador, true, 200],
      [coordinador, false, 403],
      [colaborador, false, 403],
    ] as const) {
      authAs(usuario);
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("BORRADOR", miembro));
      expect((await GET(get(), ctx)).status, `${usuario.rol} ${miembro}`).toBe(status);
    }
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await GET(get(), ctx)).status).toBe(404);
  });
});

describe("PUT budget: gates", () => {
  it("answers 404, then 403 for non-members, then 409 outside BORRADOR", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await PUT(put(cuerpo()), ctx)).status).toBe(404);

    for (const usuario of [coordinador, colaborador]) {
      authAs(usuario);
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("BORRADOR", false));
      expect((await PUT(put(cuerpo()), ctx)).status, usuario.rol).toBe(403);
    }

    // S5: a member of either role writes the budget.
    for (const usuario of [coordinador, colaborador]) {
      authAs(usuario);
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("BORRADOR", true));
      expect((await PUT(put(cuerpo()), ctx)).status, usuario.rol).not.toBe(403);
    }

    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION"));
    const res = await PUT(put(cuerpo(item(act11, "r1", "5"))), ctx);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.code).toBe("INVALID_STATE");
    expect(json.error).toContain("presupuesto");
    expect(json.error).not.toContain("estructura");
    expect(mocks.lineaCreate).not.toHaveBeenCalled();
  });

  it("re-checks BORRADOR under the row lock", async () => {
    mocks.queryRaw.mockResolvedValue([{ estado: "EN_EJECUCION", valor_total: "100.00" }]);
    const res = await PUT(put(cuerpo(item(act11, "r1", "100"))), ctx);
    expect(res.status).toBe(409);
    expect(mocks.lineaCreate).not.toHaveBeenCalled();
  });
});

describe("PUT budget: validation (400)", () => {
  const rechazados: [string, unknown, string][] = [
    // S5: «no se repite la misma combinación actividad + rubro».
    ["a repeated activity + rubro", cuerpo(item(act11, "r3", "1"), item(act11, "r3", "2")), "repite"],
    ["an activity of another project", cuerpo(item({ id: "ajena", codigo: "9.9", nombre: "x" }, "r1", "5")), "actividad"],
    ["an unknown rubro", cuerpo(item(act11, "nope", "5")), "rubro"],
    // S1: every new line is activity + rubro.
    ["a new line without an activity", cuerpo(item(null, "r1", "5")), "actividad"],
    ["a negative amount", cuerpo(item(act11, "r1", "-1")), "monto"],
    ["more than two decimals", cuerpo(item(act11, "r1", "1.001")), ""],
    ["a float-noise number", cuerpo(item(act11, "r1", 0.1 + 0.2)), ""],
    ["a non-numeric amount", cuerpo(item(act11, "r1", "abc")), ""],
    ["an amount above the column limit", cuerpo(item(act11, "r1", "10000000000000.00")), ""],
    ["the old rubro-only body", { rubros: [{ rubro_id: "r1", asignado: "5" }] }, ""],
    ["no lineas array", {}, ""],
    ["a scalar body", 7, ""],
  ];
  it.each(rechazados)("rejects %s", async (_name, body, palabra) => {
    const res = await PUT(put(body), ctx);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error.toLowerCase()).toContain(palabra);
    expect(mocks.lineaCreate).not.toHaveBeenCalled();
    expect(mocks.lineaDelete).not.toHaveBeenCalled();
    expect(mocks.proyectoUpdate).not.toHaveBeenCalled();
  });

  it("only looks up activities that are alive in this project", async () => {
    await PUT(put(cuerpo(item(act11, "r1", "5"))), ctx);
    expect(mocks.actividadFindMany.mock.calls[0][0].where).toMatchObject({ proyecto_id: "pry-1", deleted_at: null });
  });

  it("cannot create a line on a suspended rubro", async () => {
    mocks.rubroFindMany.mockResolvedValue([popSuspendido, ...rubros]);
    const res = await PUT(put(cuerpo(item(act11, "pop", "5"))), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("suspendido");
  });

  it("refuses to remove a line that already has expenses (A3)", async () => {
    mocks.lineaFindMany.mockResolvedValue([linea("r1", "100", "l-11-r1", act11)]);
    mocks.gastoCount.mockResolvedValue(2);
    const res = await PUT(put(cuerpo()), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("gastos");
    expect(mocks.lineaDelete).not.toHaveBeenCalled();
  });
});

describe("PUT budget: writes", () => {
  it("creates one line per activity + rubro, so an activity holds several rubros (S1, S6)", async () => {
    const res = await PUT(put(cuerpo(item(act11, "r3", "15000000"), item(act11, "r5", 8000000))), ctx);

    expect(res.status).toBe(200);
    expect(mocks.lineaCreate).toHaveBeenCalledTimes(2);
    expect(mocks.lineaCreate.mock.calls.map((c) => c[0].data)).toEqual([
      expect.objectContaining({ proyecto_id: "pry-1", actividad_id: "a-11", rubro_id: "r3" }),
      expect.objectContaining({ proyecto_id: "pry-1", actividad_id: "a-11", rubro_id: "r5" }),
    ]);
    expect(String(mocks.lineaCreate.mock.calls[1][0].data.monto_proyectado_cop)).toBe("8000000");

    const audit = vi.mocked(logChanges).mock.calls[0][1];
    expect(audit[0]).toMatchObject({
      usuario_id: "ger-1",
      accion: "CREAR",
      entidad: "presupuesto",
      entidad_id: "new-r3",
      proyecto_id: "pry-1",
      campo: "asignado",
      valor_anterior: null,
      valor_nuevo: "15000000.00",
    });
  });

  it("allows the same rubro on two activities", async () => {
    const res = await PUT(put(cuerpo(item(act11, "r3", "1"), item(act12, "r3", "2"))), ctx);
    expect(res.status).toBe(200);
    expect(mocks.lineaCreate).toHaveBeenCalledTimes(2);
  });

  it("updates only the changed line, matched by activity + rubro, and writes nothing when nothing changed", async () => {
    mocks.lineaFindMany.mockResolvedValue([linea("r3", "100", "l-11-r3", act11), linea("r3", "50", "l-12-r3", act12)]);
    mocks.queryRaw.mockResolvedValue([{ estado: "BORRADOR", valor_total: "150.00" }]);

    await PUT(put(cuerpo(item(act11, "r3", "100.00"), item(act12, "r3", "75"))), ctx);

    expect(mocks.lineaUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.lineaUpdate.mock.calls[0][0].where).toEqual({ id: "l-12-r3" });
    const audit = vi.mocked(logChanges).mock.calls[0][1];
    expect(audit[0]).toMatchObject({ accion: "EDITAR", entidad_id: "l-12-r3", valor_anterior: "50.00", valor_nuevo: "75.00" });

    vi.clearAllMocks();
    mocks.rubroFindMany.mockResolvedValue(rubros);
    mocks.actividadFindMany.mockResolvedValue([act11]);
    mocks.lineaFindMany.mockResolvedValue([linea("r3", "100", "l-11-r3", act11)]);
    mocks.queryRaw.mockResolvedValue([{ estado: "BORRADOR", valor_total: "100.00" }]);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
    await PUT(put(cuerpo(item(act11, "r3", "100"))), ctx);
    expect(mocks.lineaUpdate).not.toHaveBeenCalled();
    expect(mocks.lineaCreate).not.toHaveBeenCalled();
    expect(mocks.proyectoUpdate).not.toHaveBeenCalled();
    expect(logChanges).not.toHaveBeenCalled();
  });

  it("keeps a legacy line editable without an activity (A1)", async () => {
    mocks.lineaFindMany.mockResolvedValue([linea("r1", "100", "l-r1")]);
    const res = await PUT(put(cuerpo(item(null, "r1", "60"))), ctx);
    expect(res.status).toBe(200);
    expect(mocks.lineaUpdate.mock.calls[0][0].where).toEqual({ id: "l-r1" });
  });

  it("allows reassigning an existing suspended line", async () => {
    mocks.rubroFindMany.mockResolvedValue([popSuspendido, ...rubros]);
    mocks.lineaFindMany.mockResolvedValue([linea("pop", "300", "l-11-pop", act11)]);
    const res = await PUT(put(cuerpo(item(act11, "pop", "0"))), ctx);
    expect(res.status).toBe(200);
    expect(mocks.lineaUpdate.mock.calls[0][0].where).toEqual({ id: "l-11-pop" });
  });

  it("does not create a new line for $0", async () => {
    await PUT(put(cuerpo(item(act11, "r1", "0"))), ctx);
    expect(mocks.lineaCreate).not.toHaveBeenCalled();
  });

  it("deletes a line left out of the body, with its programming, and audits it (A3)", async () => {
    mocks.lineaFindMany.mockResolvedValue([linea("r1", "100", "l-11-r1", act11), linea("r2", "40", "l-11-r2", act11)]);
    mocks.queryRaw.mockResolvedValue([{ estado: "BORRADOR", valor_total: "140.00" }]);

    const res = await PUT(put(cuerpo(item(act11, "r1", "100"))), ctx);

    expect(res.status).toBe(200);
    expect(mocks.celdaDeleteMany).toHaveBeenCalledWith({ where: { linea_id: "l-11-r2", proyecto_id: "pry-1" } });
    expect(mocks.lineaDelete).toHaveBeenCalledWith({ where: { id: "l-11-r2" } });
    expect(mocks.celdaDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.lineaDelete.mock.invocationCallOrder[0]!);
    const audit = vi.mocked(logChanges).mock.calls[0][1];
    expect(audit).toContainEqual(
      // Same convention as a deleted programming cell: AccionAuditoria has no delete action.
      expect.objectContaining({ accion: "EDITAR", entidad: "presupuesto", entidad_id: "l-11-r2", valor_anterior: "40.00", valor_nuevo: "0.00" }),
    );
  });

  // S2: «El asignado por rubro y el valor total del proyecto se calculan sumando las líneas; no se digitan.»
  it("sets valor_total to the sum of the lines on every write, and recomputes the opportunity difference (S2)", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(
      proyecto("BORRADOR", false, { oportunidad: { valor_estimado_cop: new Prisma.Decimal(100) } }),
    );
    mocks.queryRaw.mockResolvedValue([{ estado: "BORRADOR", valor_total: "100.00" }]);
    mocks.lineaFindMany.mockResolvedValue([linea("r2", "20", "l-r2")]);

    await PUT(put(cuerpo(item(act11, "r1", "130.50"), item(null, "r2", "20"))), ctx);

    const data = mocks.proyectoUpdate.mock.calls[0][0].data;
    expect(String(data.valor_total)).toBe("150.5");
    expect(String(data.diferencia_valor_oportunidad)).toBe("50.5");
    const audit = vi.mocked(logChanges).mock.calls[0][1];
    expect(audit).toContainEqual(
      expect.objectContaining({ entidad: "proyecto", campo: "valor_total", valor_anterior: "100.00", valor_nuevo: "150.50" }),
    );
  });

  it("sets valor_total to zero when the last line is removed", async () => {
    mocks.lineaFindMany.mockResolvedValue([linea("r1", "100", "l-11-r1", act11)]);
    await PUT(put(cuerpo()), ctx);
    expect(String(mocks.proyectoUpdate.mock.calls[0][0].data.valor_total)).toBe("0");
  });

  it("rejects a total above the column limit before writing anything", async () => {
    const res = await PUT(put(cuerpo(item(act11, "r1", "9999999999999.00"), item(act12, "r1", "9999999999999.00"))), ctx);
    expect(res.status).toBe(400);
    expect(mocks.lineaCreate).not.toHaveBeenCalled();
  });

  it("returns the same shape as GET after the write", async () => {
    mocks.lineaFindMany.mockResolvedValue([linea("r1", "100", "l-11-r1", act11)]);
    mocks.queryRaw.mockResolvedValue([{ estado: "BORRADOR", valor_total: "100.00" }]);
    const json = await (await PUT(put(cuerpo(item(act11, "r1", "100"))), ctx)).json();
    expect(json.rubros).toHaveLength(15);
    expect(json.lineas).toHaveLength(1);
    expect(json.suma).toBe("100.00");
    expect(json.diferencia).toBe("0.00");
  });
});
