// Loader of the S-curve (S14 P7). Multi-month fixture: a project that runs
// 2026-08-03 -> 2026-12-31 with three activities of different spans and a
// monthly budget, so the curve has more than the single seeded month.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  parametros: {
    umbral1: { valor: 10, confirmado: false },
    umbral2: { valor: 20, confirmado: false },
    avance_requiere_medio: { valor: true, confirmado: false },
  } as Record<string, { valor: number | boolean; confirmado: boolean }>,
}));

vi.mock("@/lib/settings", () => ({ getSemaforoParametrosV2: vi.fn(async () => mocks.parametros) }));
vi.mock("@/lib/db", () => ({
  db: {
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
import { calcularCurva } from "./curva";

const INICIO = new Date("2026-08-03T00:00:00.000Z");
const FIN = new Date("2026-12-31T00:00:00.000Z");

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
// 2.400.000 + 1.600.000 per month -> cumulative 4 / 8 / 12 / 16 / 20 M.
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

const input = (over: Partial<Parameters<typeof calcularCurva>[0]> = {}) => ({
  id: "pry-1",
  fecha_inicio: INICIO,
  fecha_fin: FIN,
  baseParam: null,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T15:00:00.000Z"));
  mocks.parametros.avance_requiere_medio = { valor: true, confirmado: false };
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

const snapshotV0Corte = {
  schema: 1,
  proyecto: { valor_total: "20000000.00", fecha_inicio: "2026-08-03", fecha_fin: "2026-12-31", beneficiarios_meta: 1 },
  presupuesto: [
    { rubro_codigo: "R01", rubro_nombre: "Personal", asignado: "15000000.00" },
    { rubro_codigo: "R12", rubro_nombre: "Transporte", asignado: "5000000.00" },
  ],
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
};

describe("calcularCurva: vigente golden", () => {
  it("returns one row per period with the two curves as percentages", async () => {
    const result = await calcularCurva(input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.base).toBe("vigente");
    expect(result.value.corte).toBe("2026-11");
    expect(result.value.periodos).toEqual([
      { periodo: "2026-08", tecnico: { planeado: 20.7, ejecutado: 10 }, financiero: { planeado: 20, ejecutado: 5 } },
      { periodo: "2026-09", tecnico: { planeado: 42.1, ejecutado: 28 }, financiero: { planeado: 40, ejecutado: 15 } },
      { periodo: "2026-10", tecnico: { planeado: 64.3, ejecutado: 40 }, financiero: { planeado: 60, ejecutado: 30 } },
      { periodo: "2026-11", tecnico: { planeado: 78.6, ejecutado: 48 }, financiero: { planeado: 80, ejecutado: 42.5 } },
      { periodo: "2026-12", tecnico: { planeado: 100, ejecutado: null }, financiero: { planeado: 100, ejecutado: null } },
    ]);
  });

  it("reads the whole timeline up to the corte and filters per month in memory", async () => {
    await calcularCurva(input());
    expect(db.avanceEntregable.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          proyecto_id: "pry-1",
          anulado_at: null,
          // The corte month is measured at the corte date, not at its month end.
          fecha: { lte: new Date("2026-11-20T00:00:00.000Z") },
        }),
      }),
    );
  });

  it("evaluates the planned technical value of the corte month at the corte date (D13), past and future months at month end (D1)", async () => {
    const result = await calcularCurva(input());
    if (!result.ok) throw new Error("expected ok");
    // Corte 2026-11-20: a3 (10-26..12-20, peso 8 of 20) has run 26 of 56 days -> (4 + 8 + 8 * 26/56) / 20 = 78.57 %.
    // At the month end (11-30) it would be 85.7 %: the planned point must NOT reach that far.
    expect(result.value.periodos.map((p) => p.tecnico.planeado)).toEqual([20.7, 42.1, 64.3, 78.6, 100]);
  });

  it("applies the same corte rule to the planned technical value of base=original", async () => {
    vi.mocked(db.versionProyecto.findFirst).mockResolvedValue({ snapshot: snapshotV0Corte } as never);
    const result = await calcularCurva(input({ baseParam: "original" }));
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.periodos.map((p) => p.tecnico.planeado)).toEqual([20.7, 42.1, 64.3, 78.6, 100]);
  });

  it("keeps the technical and the financial curves independent", async () => {
    const result = await calcularCurva(input());
    if (!result.ok) throw new Error("expected ok");
    // The plan never equals the spend series: they come from different sources.
    const tecnico = result.value.periodos.map((p) => p.tecnico.planeado);
    const financiero = result.value.periodos.map((p) => p.financiero.planeado);
    expect(tecnico).not.toEqual(financiero);
  });
});

describe("calcularCurva: corte and dates", () => {
  it("clamps the corte to the project range", async () => {
    vi.setSystemTime(new Date("2025-01-01T15:00:00.000Z"));
    const antes = await calcularCurva(input());
    if (!antes.ok) throw new Error("expected ok");
    expect(antes.value.corte).toBe("2026-08");
    // Nothing has been executed yet: the first period measures 0, the rest are future.
    expect(antes.value.periodos[0].tecnico.ejecutado).toBe(0);
    expect(antes.value.periodos[1].tecnico.ejecutado).toBeNull();

    vi.setSystemTime(new Date("2028-01-01T15:00:00.000Z"));
    const despues = await calcularCurva(input());
    if (!despues.ok) throw new Error("expected ok");
    expect(despues.value.corte).toBe("2026-12");
  });

  it("answers 409 when the project has no dates", async () => {
    const result = await calcularCurva(input({ fecha_inicio: null, fecha_fin: null }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(409);
  });

  it("answers 400 for an unknown base and 409 for original without a v0", async () => {
    const mala = await calcularCurva(input({ baseParam: "otra" }));
    if (mala.ok) throw new Error("expected error");
    expect(mala.response.status).toBe(400);

    const sin = await calcularCurva(input({ baseParam: "original" }));
    if (sin.ok) throw new Error("expected error");
    expect(sin.response.status).toBe(409);
  });
});

describe("calcularCurva: base=original", () => {
  const snapshotV0 = snapshotV0Corte;

  it("reads the frozen A and P of v0 with the same live avances and expenses", async () => {
    vi.mocked(db.versionProyecto.findFirst).mockResolvedValue({ snapshot: snapshotV0 } as never);
    const result = await calcularCurva(input({ baseParam: "original" }));
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.base).toBe("original");
    // A = 20 M in both bases, but v0 programs 4 M per month (100 % of R01 assigned).
    expect(result.value.periodos.map((p) => p.financiero.planeado)).toEqual([20, 40, 60, 80, 100]);
    // The executed technical line is unchanged: the live avances still count.
    expect(result.value.periodos.map((p) => p.tecnico.ejecutado)).toEqual([10, 28, 40, 48, null]);
  });
});
