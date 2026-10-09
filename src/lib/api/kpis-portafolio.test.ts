// S9 U3: the batched loader. (1) call count is constant in the number of projects; (2) parity with the
// per-project paths (`loadTecnicoStatus` + the `computeFicha` total of the financial sheet) over the
// same fixture, for a corte before, inside and after the project, and for a BORRADOR.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Prisma } from "@prisma/client"

type Row = Record<string, unknown>
const store = vi.hoisted(() => ({
  actividades: [] as Row[],
  entregables: [] as Row[],
  avances: [] as Row[],
  soportes: [] as Row[],
  indicadores: [] as Row[],
  mediciones: [] as Row[],
  beneficiarios: [] as Row[],
  lineas: [] as Row[],
  programacion: [] as Row[],
  gastos: [] as Row[],
}))

vi.mock("@/lib/db", async () => {
  const { Prisma: P } = await import("@prisma/client")
  const cmp = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() - b.getTime() : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)
  const eq = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b)
  const match = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, cond]) => {
      const value = row[key]
      if (cond === null) return value == null
      if (cond instanceof Date || typeof cond !== "object") return eq(value, cond)
      const c = cond as { in?: unknown[]; lte?: unknown; not?: null }
      if (c.in && !c.in.includes(value)) return false
      if (c.lte !== undefined && !(value != null && cmp(value, c.lte) <= 0)) return false
      if (c.not === null && value == null) return false
      return true
    })
  const groupBy = (rows: Row[]) =>
    vi.fn(async (args: { by: string[]; where?: Row; _count?: unknown; _sum?: Record<string, true> }) => {
      const groups = new Map<unknown, Row[]>()
      for (const row of rows.filter((r) => match(r, args.where))) groups.set(row[args.by[0]], [...(groups.get(row[args.by[0]]) ?? []), row])
      return [...groups.entries()].map(([key, items]) => {
        const out: Row = { [args.by[0]]: key }
        if (args._count) out._count = { _all: items.length }
        if (args._sum) {
          out._sum = Object.fromEntries(
            Object.keys(args._sum).map((field) => {
              const values = items.map((i) => i[field])
              return [field, typeof values[0] === "number" ? (values as number[]).reduce((s, v) => s + v, 0) : values.reduce<Prisma.Decimal>((s, v) => s.plus(v as Prisma.Decimal), new P.Decimal(0))]
            }),
          )
        }
        return out
      })
    })
  const findMany = (rows: () => Row[], attach?: (row: Row, args: { select?: Row }) => Row) =>
    vi.fn(async (args: { where?: Row; select?: Row }) => rows().filter((r) => match(r, args.where)).map((r) => (attach ? attach(r, args) : r)))
  return {
    db: {
      actividad: {
        findMany: findMany(
          () => store.actividades,
          (row) => ({ ...row, entregables: store.entregables.filter((e) => e.actividad_id === row.id && e.deleted_at === null) }),
        ),
      },
      avanceEntregable: { findMany: findMany(() => store.avances) },
      soporteProyecto: { groupBy: groupBy(store.soportes) },
      indicador: {
        findMany: findMany(
          () => store.indicadores,
          (row, args) => {
            const where = ((args.select?.mediciones as { where?: Row } | undefined)?.where ?? {}) as Row
            return { ...row, mediciones: store.mediciones.filter((m) => m.indicador_id === row.id && match(m, where)) }
          },
        ),
      },
      registroBeneficiario: { groupBy: groupBy(store.beneficiarios) },
      lineaPresupuestal: { groupBy: groupBy(store.lineas) },
      programacionPeriodo: { groupBy: groupBy(store.programacion) },
      gasto: { groupBy: groupBy(store.gastos) },
    },
  }
})

import { db } from "@/lib/db"
import { loadKpisPortafolio, type ProyectoKpiBase } from "./kpis-portafolio"
import { loadTecnicoStatus } from "./tecnico"
import { computeFicha } from "@/lib/proyectos/ficha-financiera"
import { toCents } from "@/lib/proyectos/money"
import { PARAMETROS_V2_DEFAULT, toleranciaBp } from "@/lib/proyectos/semaforo-v2"
import { periodOf } from "@/lib/proyectos/weeks"

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const dec = (value: string) => new Prisma.Decimal(value)

function seedProject(id: string, n: number) {
  // 2 activities x 2 deliverables, avances, one with and one without a support.
  for (const a of [1, 2]) {
    const actId = `${id}-a${a}`
    store.actividades.push({ id: actId, proyecto_id: id, codigo: `${a}`, semana_inicio: a === 1 ? 1 : 5, semana_fin: a === 1 ? 4 : 12, peso: dec("10"), peso_manual: false, deleted_at: null })
    for (const e of [1, 2]) {
      const entId = `${actId}-e${e}`
      store.entregables.push({ id: entId, proyecto_id: id, actividad_id: actId, codigo: `${a}-E${e}`, cantidad_meta: dec("10"), deleted_at: null })
      const avId = `${entId}-v1`
      store.avances.push({ id: avId, proyecto_id: id, entregable_id: entId, fecha: D(a === 1 ? "2026-01-20" : "2026-03-10"), cantidad: dec(String(e === 1 ? 10 : 4 + n)), created_at: new Date("2026-03-11T10:00:00Z"), anulado_at: null })
      if (e === 1) store.soportes.push({ id: `${avId}-s`, proyecto_id: id, avance_id: avId, deleted_at: null })
    }
  }
  store.indicadores.push({ id: `${id}-i1`, proyecto_id: id, meta: dec("100"), deleted_at: null })
  store.mediciones.push({ id: `${id}-m1`, indicador_id: `${id}-i1`, proyecto_id: id, fecha: D("2026-02-01"), valor: dec("40"), created_at: new Date("2026-02-01T10:00:00Z"), anulado_at: null })
  store.beneficiarios.push({ proyecto_id: id, fecha: D("2026-02-01"), cantidad: 7 + n, anulado_at: null })
  store.lineas.push({ id: `${id}-l1`, proyecto_id: id, rubro_id: "R1", monto_proyectado_cop: dec("1000000.50") })
  store.lineas.push({ id: `${id}-l2`, proyecto_id: id, rubro_id: "R2", monto_proyectado_cop: dec("500000") })
  for (const [linea, periodo, valor] of [["l1", "2026-01", "300000"], ["l1", "2026-03", "400000"], ["l2", "2026-02", "200000"], ["l2", "2026-06", "300000"]]) {
    store.programacion.push({ proyecto_id: id, linea_id: `${id}-${linea}`, periodo, valor: dec(valor) })
  }
  for (const [linea, periodo, valor, estado] of [["l1", "2026-01", "250000", "VALIDADO"], ["l1", "2026-03", "100000.50", "VALIDADO"], ["l2", "2026-02", "90000", "VALIDADO"], ["l2", "2026-04", "50000", "VALIDADO"], ["l1", "2026-02", "999", "REGISTRADO"]]) {
    store.gastos.push({ proyecto_id: id, linea_id: `${id}-${linea}`, periodo, monto_cop: dec(valor), estado })
  }
}

const base = (id: string, estado: string): ProyectoKpiBase => ({ id, estado, fecha_inicio: D("2026-01-05"), fecha_fin: D("2026-06-30"), beneficiarios_meta: 100 })

beforeEach(() => {
  for (const key of Object.keys(store) as (keyof typeof store)[]) store[key].length = 0
  vi.clearAllMocks()
})

const BATCHED = [
  () => db.actividad.findMany,
  () => db.avanceEntregable.findMany,
  () => db.soporteProyecto.groupBy,
  () => db.indicador.findMany,
  () => db.registroBeneficiario.groupBy,
  () => db.lineaPresupuestal.groupBy,
  () => db.programacionPeriodo.groupBy,
  () => db.gasto.groupBy,
]

describe("loadKpisPortafolio call count", () => {
  it.each([1, 50])("issues exactly one query per table for %i projects", async (count) => {
    const proyectos = Array.from({ length: count }, (_, i) => {
      seedProject(`p${i}`, i % 3)
      return base(`p${i}`, "EN_EJECUCION")
    })
    const result = await loadKpisPortafolio({ proyectos, corte: "2026-03-15", parametros: PARAMETROS_V2_DEFAULT })
    expect(result.size).toBe(count)
    for (const query of BATCHED) expect(query()).toHaveBeenCalledTimes(1)
  })

  it("runs no query when nothing is measurable (BORRADOR or no dates)", async () => {
    const result = await loadKpisPortafolio({
      proyectos: [base("b1", "BORRADOR"), { ...base("s1", "EN_EJECUCION"), fecha_inicio: null }],
      corte: "2026-03-15",
      parametros: PARAMETROS_V2_DEFAULT,
    })
    expect(result.get("b1")).toMatchObject({ medible: false, tecnico: null, financiero: null, estado: "BORRADOR" })
    expect(result.get("s1")?.medible).toBe(false)
    for (const query of BATCHED) expect(query()).not.toHaveBeenCalled()
  })

  it("never loads expense rows: money comes from groupBy aggregates", () => {
    expect((db as unknown as { gasto: Record<string, unknown> }).gasto.findMany).toBeUndefined()
  })
})

describe("parity with the per-project paths", () => {
  // before the project, inside it, after its end
  it.each(["2025-12-01", "2026-03-15", "2026-08-01"])("corte %s", async (corte) => {
    seedProject("p1", 0)
    seedProject("p2", 2)
    const inicio = D("2026-01-05")
    const batched = await loadKpisPortafolio({
      proyectos: [base("p1", "EN_EJECUCION"), base("p2", "CERRADO")],
      corte,
      parametros: PARAMETROS_V2_DEFAULT,
    })

    for (const id of ["p1", "p2"]) {
      const kpis = batched.get(id)!
      const tecnico = await loadTecnicoStatus({ proyectoId: id, fechaInicio: inicio, corte, parametros: PARAMETROS_V2_DEFAULT })
      expect(kpis.tecnico?.avance_real).toBe(Math.round(tecnico.tecnico.avance_real * 1000) / 10)
      expect(kpis.tecnico?.avance_programado).toBe(Math.round(tecnico.tecnico.avance_programado * 1000) / 10)
      expect(kpis.tecnico?.color).toBe(tecnico.color)

      const ficha = computeFicha({
        corte: periodOf(corte),
        toleranciaBp: toleranciaBp(PARAMETROS_V2_DEFAULT.tolerancia),
        rubros: ["l1", "l2"].map((l) => {
          const linea = store.lineas.find((r) => r.id === `${id}-${l}`)!
          return {
            rubroId: linea.rubro_id as string,
            codigo: null,
            nombre: "",
            asignado: toCents(linea.monto_proyectado_cop as Prisma.Decimal),
            programacion: store.programacion.filter((c) => c.linea_id === linea.id).map((c) => ({ periodo: c.periodo as string, valor: toCents(c.valor as Prisma.Decimal) })),
            gastos: store.gastos.filter((g) => g.linea_id === linea.id).map((g) => ({ periodo: g.periodo as string, valor: toCents(g.monto_cop as Prisma.Decimal), estado: g.estado as "VALIDADO" })),
          }
        }),
      })
      expect(kpis.financiero).toMatchObject({
        asignado: ficha.total.asignado,
        programado: ficha.total.programado,
        ejecutado: ficha.total.ejecutado,
        color: ficha.total.color,
      })
      expect(kpis.financiero?.ea).toBe(ficha.total.eaTenths === null ? null : Number(ficha.total.eaTenths) / 10)
      expect(kpis.financiero?.ep).toBe(ficha.total.epTenths === null ? null : Number(ficha.total.epTenths) / 10)
    }
  })

  it("batching does not mix projects: each project sees only its own rows", async () => {
    seedProject("p1", 0)
    seedProject("p2", 5)
    const result = await loadKpisPortafolio({ proyectos: [base("p1", "EN_EJECUCION"), base("p2", "EN_EJECUCION")], corte: "2026-03-15", parametros: PARAMETROS_V2_DEFAULT })
    expect(result.get("p1")?.beneficiarios?.total).toBe(7)
    expect(result.get("p2")?.beneficiarios?.total).toBe(12)
    expect(result.get("p1")?.indicadores).toMatchObject({ medidos: 1, valor: 40 })
  })

  it("counts avances and mediciones only up to the corte", async () => {
    seedProject("p1", 0)
    const result = await loadKpisPortafolio({ proyectos: [base("p1", "EN_EJECUCION")], corte: "2026-01-31", parametros: PARAMETROS_V2_DEFAULT })
    expect(result.get("p1")?.beneficiarios?.total).toBe(0)
    expect(result.get("p1")?.indicadores?.medidos).toBe(0)
  })
})
