// GET /api/v1/projects/:id/curve (S14 P7). Multi-month fixture through the route.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  parametros: {
    umbral1: { valor: 10, confirmado: false },
    umbral2: { valor: 20, confirmado: false },
    avance_requiere_medio: { valor: true, confirmado: false },
  } as Record<string, { valor: number | boolean; confirmado: boolean }>,
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getSemaforoParametrosV2: vi.fn(async () => mocks.parametros) }));
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    actividad: { findMany: vi.fn() },
    avanceEntregable: { findMany: vi.fn() },
    soporteProyecto: { groupBy: vi.fn() },
    lineaPresupuestal: { findMany: vi.fn() },
    programacionPeriodo: { findMany: vi.fn() },
    gasto: { findMany: vi.fn() },
    versionProyecto: { findFirst: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;

const proyecto = (over: object = {}, miembro = false) =>
  ({
    id: "pry-1",
    estado: "EN_EJECUCION",
    fecha_inicio: new Date("2026-08-03T00:00:00.000Z"),
    fecha_fin: new Date("2026-12-31T00:00:00.000Z"),
    miembros: miembro ? [{ id: "m-1" }] : [],
    ...over,
  }) as never;

const ent = (id: string) => ({ id, codigo: id, cantidad_meta: new Prisma.Decimal(100) });
const act = (id: string, ini: number, fin: number, peso: number) => ({
  id,
  codigo: id,
  nombre: `Actividad ${id}`,
  semana_inicio: ini,
  semana_fin: fin,
  peso: new Prisma.Decimal(peso),
  peso_manual: true,
  objetivo: { codigo: "OE1" },
  entregables: [ent(`${id}-e1`)],
});
const actividades = [act("a1", 1, 4, 4), act("a2", 5, 12, 8), act("a3", 13, 20, 8)];

const av = (id: string, entregable_id: string, fecha: string, cantidad: number) => ({
  id,
  entregable_id,
  fecha: new Date(`${fecha}T00:00:00.000Z`),
  cantidad: new Prisma.Decimal(cantidad),
  created_at: new Date(`${fecha}T12:00:00.000Z`),
});
const avances = [
  av("v1", "a1-e1", "2026-08-15", 50),
  av("v2", "a1-e1", "2026-09-10", 50),
  av("v3", "a2-e1", "2026-09-20", 20),
  av("v4", "a2-e1", "2026-10-15", 30),
  av("v5", "a2-e1", "2026-11-10", 10),
  av("v6", "a3-e1", "2026-11-15", 10),
];

const lineas = [
  { id: "l1", monto_proyectado_cop: new Prisma.Decimal("12000000.00") },
  { id: "l2", monto_proyectado_cop: new Prisma.Decimal("8000000.00") },
];
const meses = ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
const celdas = meses.flatMap((periodo) => [
  { linea_id: "l1", periodo, valor: new Prisma.Decimal("2400000.00") },
  { linea_id: "l2", periodo, valor: new Prisma.Decimal("1600000.00") },
]);
const gastos = [
  { periodo: "2026-08", monto_cop: new Prisma.Decimal("1000000.00"), linea: { rubro_id: "r01" } },
  { periodo: "2026-09", monto_cop: new Prisma.Decimal("2000000.00"), linea: { rubro_id: "r01" } },
  { periodo: "2026-10", monto_cop: new Prisma.Decimal("3000000.00"), linea: { rubro_id: "r12" } },
  { periodo: "2026-11", monto_cop: new Prisma.Decimal("2500000.00"), linea: { rubro_id: "r12" } },
];
const conMedio = (ids: string[]) => ids.map((avance_id) => ({ avance_id, _count: { _all: 1 } }));

const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const get = (qs = "") => new Request(`http://localhost/api/v1/projects/pry-1/curve${qs}`);

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

const GOLDEN = [
  { periodo: "2026-08", tecnico: { planeado: 20.7, ejecutado: 10 }, financiero: { planeado: 20, ejecutado: 5 } },
  { periodo: "2026-09", tecnico: { planeado: 42.1, ejecutado: 28 }, financiero: { planeado: 40, ejecutado: 15 } },
  { periodo: "2026-10", tecnico: { planeado: 64.3, ejecutado: 40 }, financiero: { planeado: 60, ejecutado: 30 } },
  { periodo: "2026-11", tecnico: { planeado: 85.7, ejecutado: 48 }, financiero: { planeado: 80, ejecutado: 42.5 } },
  { periodo: "2026-12", tecnico: { planeado: 100, ejecutado: null }, financiero: { planeado: 100, ejecutado: null } },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T15:00:00.000Z"));
  mocks.parametros.avance_requiere_medio = { valor: true, confirmado: false };
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.actividad.findMany).mockResolvedValue(actividades as never);
  vi.mocked(db.avanceEntregable.findMany).mockResolvedValue(avances as never);
  vi.mocked(db.soporteProyecto.groupBy).mockResolvedValue(conMedio(avances.map((a) => a.id)) as never);
  vi.mocked(db.lineaPresupuestal.findMany).mockResolvedValue(lineas as never);
  vi.mocked(db.programacionPeriodo.findMany).mockResolvedValue(celdas as never);
  vi.mocked(db.gasto.findMany).mockResolvedValue(gastos as never);
  vi.mocked(db.versionProyecto.findFirst).mockResolvedValue(null);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("GET curve: golden", () => {
  it("answers the two curves as percentages, with the executed line null after the corte", async () => {
    const res = await GET(get(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ base: "vigente", corte: "2026-11", periodos: GOLDEN });
  });

  it("defaults to vigente without reading a version", async () => {
    const body = await (await GET(get(), ctx)).json();
    expect(body.base).toBe("vigente");
    expect(db.versionProyecto.findFirst).not.toHaveBeenCalled();
  });

  it("reads the v0 A and P for base=original with the same live execution", async () => {
    vi.mocked(db.versionProyecto.findFirst).mockResolvedValue({
      snapshot: {
        schema: 1,
        proyecto: { valor_total: "20000000.00", fecha_inicio: "2026-08-03", fecha_fin: "2026-12-31", beneficiarios_meta: 1 },
        presupuesto: [{ rubro_codigo: "R01", rubro_nombre: "Personal", asignado: "20000000.00" }],
        programacion: meses.map((periodo) => ({ rubro_codigo: "R01", periodo, valor: "4000000.00" })),
        actividades: [
          { codigo: "a1", objetivo_codigo: "OE1", nombre: "a", semana_inicio: 1, semana_fin: 4, peso: "4", peso_manual: true },
          { codigo: "a2", objetivo_codigo: "OE1", nombre: "b", semana_inicio: 5, semana_fin: 12, peso: "8", peso_manual: true },
          { codigo: "a3", objetivo_codigo: "OE1", nombre: "c", semana_inicio: 13, semana_fin: 20, peso: "8", peso_manual: true },
        ],
        entregables: [
          { codigo: "a1-e1", actividad_codigo: "a1", descripcion: "x", cantidad_meta: "100", unidad: "u" },
          { codigo: "a2-e1", actividad_codigo: "a2", descripcion: "x", cantidad_meta: "100", unidad: "u" },
          { codigo: "a3-e1", actividad_codigo: "a3", descripcion: "x", cantidad_meta: "100", unidad: "u" },
        ],
        indicadores: [],
      },
    } as never);
    const body = await (await GET(get("?base=original"), ctx)).json();
    expect(body.base).toBe("original");
    expect(body.periodos.map((p: { tecnico: { ejecutado: number | null } }) => p.tecnico.ejecutado)).toEqual([10, 28, 40, 48, null]);
  });
});

describe("GET curve: errors", () => {
  it("answers 400 for an unknown base and 409 for original without a v0", async () => {
    const mala = await GET(get("?base=otra"), ctx);
    expect(mala.status).toBe(400);
    expect((await mala.json()).error).toBe("La base no es válida. Usa vigente u original.");
    const sin = await GET(get("?base=original"), ctx);
    expect(sin.status).toBe(409);
    expect((await sin.json()).error).toBe("La versión original aún no existe.");
  });

  it("answers 404, and 403 for a COLABORADOR or a non-member COORDINADOR", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await GET(get(), ctx)).status).toBe(404);
    for (const usuario of [colaborador, coordinador]) {
      authAs(usuario);
      expect((await GET(get(), ctx)).status, usuario.rol).toBe(403);
    }
  });

  it("lets a member COORDINADOR read", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({}, true));
    expect((await GET(get(), ctx)).status).toBe(200);
  });

  it("answers 409 when the project has no dates yet", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({ fecha_inicio: null, fecha_fin: null }));
    const res = await GET(get(), ctx);
    expect(res.status).toBe(409);
    expect(db.actividad.findMany).not.toHaveBeenCalled();
  });
});
