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
    lineaPresupuestal: { findMany: mocks.lineaFindMany, create: mocks.lineaCreate, update: mocks.lineaUpdate },
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

const linea = (rubro_id: string, monto: string, id = `l-${rubro_id}`) => ({
  id,
  proyecto_id: "pry-1",
  rubro_id,
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
/** A body covering every active rubro; `over` overrides amounts by rubro id. */
function cuerpo(over: Record<string, string | number> = {}) {
  return { rubros: rubros.map((r) => ({ rubro_id: r.id, asignado: over[r.id] ?? "0" })) };
}

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
    const res = await PUT(put(cuerpo()), ctx);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.code).toBe("INVALID_STATE");
    expect(json.error).toContain("presupuesto");
    expect(json.error).not.toContain("estructura");
    expect(mocks.lineaCreate).not.toHaveBeenCalled();
  });

  it("re-checks BORRADOR under the row lock", async () => {
    mocks.queryRaw.mockResolvedValue([{ estado: "EN_EJECUCION", valor_total: "100.00" }]);
    const res = await PUT(put(cuerpo({ r1: "100" })), ctx);
    expect(res.status).toBe(409);
    expect(mocks.lineaCreate).not.toHaveBeenCalled();
  });
});

describe("PUT budget: validation (400)", () => {
  const rechazados: [string, unknown][] = [
    ["a missing active rubro", { rubros: rubros.slice(1).map((r) => ({ rubro_id: r.id, asignado: "0" })) }],
    ["a duplicate rubro", { rubros: [...cuerpo().rubros, { rubro_id: "r1", asignado: "5" }] }],
    ["an unknown rubro", { rubros: [...cuerpo().rubros, { rubro_id: "nope", asignado: "5" }] }],
    ["a negative amount", cuerpo({ r1: "-1" })],
    ["more than two decimals", cuerpo({ r1: "1.001" })],
    ["a float-noise number", cuerpo({ r1: 0.1 + 0.2 })],
    ["a non-numeric amount", cuerpo({ r1: "abc" })],
    ["an amount above the column limit", cuerpo({ r1: "10000000000000.00" })],
    ["no rubros array", {}],
    ["a scalar body", 7],
  ];
  it.each(rechazados)("rejects %s", async (_name, body) => {
    const res = await PUT(put(body), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
    expect(mocks.lineaCreate).not.toHaveBeenCalled();
  });

  it("cannot create a line on a suspended rubro", async () => {
    mocks.rubroFindMany.mockResolvedValue([popSuspendido, ...rubros]);
    const body = { rubros: [...cuerpo().rubros, { rubro_id: "pop", asignado: "5" }] };
    const res = await PUT(put(body), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("suspendido");
  });
});

describe("PUT budget: writes", () => {
  it("creates lines only for amounts above zero, accepts string and number, and audits each change", async () => {
    const res = await PUT(put(cuerpo({ r1: "59500000.10", r2: 24000000 })), ctx);

    expect(res.status).toBe(200);
    expect(mocks.lineaCreate).toHaveBeenCalledTimes(2);
    expect(mocks.lineaCreate.mock.calls[0][0].data).toMatchObject({ proyecto_id: "pry-1", rubro_id: "r1" });
    expect(String(mocks.lineaCreate.mock.calls[0][0].data.monto_proyectado_cop)).toBe("59500000.1");

    const audit = vi.mocked(logChanges).mock.calls[0][1];
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({
      usuario_id: "ger-1",
      accion: "CREAR",
      entidad: "presupuesto",
      entidad_id: "new-r1",
      proyecto_id: "pry-1",
      campo: "asignado",
      valor_anterior: null,
      valor_nuevo: "59500000.10",
    });
  });

  it("updates only changed lines and writes nothing when nothing changed", async () => {
    mocks.lineaFindMany.mockResolvedValue([linea("r1", "100"), linea("r2", "50")]);

    await PUT(put(cuerpo({ r1: "100.00", r2: "75" })), ctx);

    expect(mocks.lineaUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.lineaUpdate.mock.calls[0][0].where).toEqual({ id: "l-r2" });
    const audit = vi.mocked(logChanges).mock.calls[0][1];
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ accion: "EDITAR", entidad_id: "l-r2", valor_anterior: "50.00", valor_nuevo: "75.00" });

    vi.clearAllMocks();
    mocks.rubroFindMany.mockResolvedValue(rubros);
    mocks.lineaFindMany.mockResolvedValue([linea("r1", "100")]);
    mocks.queryRaw.mockResolvedValue([{ estado: "BORRADOR", valor_total: "100.00" }]);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
    await PUT(put(cuerpo({ r1: "100" })), ctx);
    expect(mocks.lineaUpdate).not.toHaveBeenCalled();
    expect(mocks.lineaCreate).not.toHaveBeenCalled();
    expect(logChanges).not.toHaveBeenCalled();
  });

  it("allows reassigning an existing suspended line to $0", async () => {
    mocks.rubroFindMany.mockResolvedValue([popSuspendido, ...rubros]);
    mocks.lineaFindMany.mockResolvedValue([linea("pop", "300")]);
    const body = { rubros: [...cuerpo().rubros, { rubro_id: "pop", asignado: "0" }] };

    const res = await PUT(put(body), ctx);

    expect(res.status).toBe(200);
    expect(mocks.lineaUpdate.mock.calls[0][0].where).toEqual({ id: "l-pop" });
  });

  it("does not reject a sum different from valor_total in BORRADOR and never overwrites it", async () => {
    const res = await PUT(put(cuerpo({ r1: "40" })), ctx);
    expect(res.status).toBe(200);
    expect(mocks.proyectoUpdate).not.toHaveBeenCalled();
  });

  it("fills a null valor_total with the sum and recomputes the opportunity difference", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(
      proyecto("BORRADOR", false, { valor_total: null, oportunidad: { valor_estimado_cop: new Prisma.Decimal(100) } }),
    );
    mocks.queryRaw.mockResolvedValue([{ estado: "BORRADOR", valor_total: null }]);

    await PUT(put(cuerpo({ r1: "150.50" })), ctx);

    const data = mocks.proyectoUpdate.mock.calls[0][0].data;
    expect(String(data.valor_total)).toBe("150.5");
    expect(String(data.diferencia_valor_oportunidad)).toBe("50.5");
    const audit = vi.mocked(logChanges).mock.calls[0][1];
    expect(audit.some((a) => a.entidad === "proyecto" && a.campo === "valor_total" && a.valor_nuevo === "150.50")).toBe(true);
  });

  it("returns the same shape as GET after the write", async () => {
    mocks.lineaFindMany.mockResolvedValue([linea("r1", "100")]);
    const json = await (await PUT(put(cuerpo({ r1: "100" })), ctx)).json();
    expect(json.rubros).toHaveLength(15);
    expect(json.suma).toBe("100.00");
    expect(json.diferencia).toBe("0.00");
  });
});
