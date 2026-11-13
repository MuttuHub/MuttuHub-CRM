// Caracterización de la ficha financiera (T10, S5): cómo `calcularFichaFinanciera` ata cada gasto
// (E) a su rubro y cómo arma las filas A/P/E de las dos bases. Fija lo que hace HOY, antes de que el
// presupuesto pase de agrupar por rubro a agrupar por línea.
//
// La función no recibe su cliente (usa el singleton `@/lib/db`), así que el doble es un objeto a mano
// montado sobre el mock del módulo; `loadGastosEjecutados` y `loadTecnicoStatus` corren de verdad
// contra ese `db`, sin mocks propios, para que el test vea la cadena completa.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Prisma } from "@prisma/client"

const mocks = vi.hoisted(() => ({
  lineas: vi.fn(),
  celdas: vi.fn(),
  gastos: vi.fn(),
  version: vi.fn(),
  setting: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  db: {
    lineaPresupuestal: { findMany: mocks.lineas },
    programacionPeriodo: { findMany: mocks.celdas },
    gasto: { findMany: mocks.gastos },
    versionProyecto: { findFirst: mocks.version },
    setting: { findUnique: mocks.setting },
    // El semáforo técnico no es asunto de este test: sin actividades ni avances, su color es verde.
    actividad: { findMany: async () => [] },
    avanceEntregable: { findMany: async () => [] },
    reporteActividad: { findMany: async () => [] },
  },
}))

import { calcularFichaFinanciera, type FinancialSheetInput } from "./financial-sheet"
import type { SnapshotV1 } from "@/lib/proyectos/versiones"

const PERIODOS = ["2026-10", "2026-11", "2026-12", "2027-01"]

const dinero = (valor: string) => new Prisma.Decimal(valor)

type Linea = {
  id: string
  rubro_id: string
  monto_proyectado_cop: Prisma.Decimal
  rubro: { codigo: string | null; nombre: string; orden: number; activo: boolean }
}

const linea = (id: string, rubroId: string, codigo: string | null, nombre: string, orden: number, monto: string): Linea => ({
  id,
  rubro_id: rubroId,
  monto_proyectado_cop: dinero(monto),
  rubro: { codigo, nombre, orden, activo: true },
})

const celda = (lineaId: string, periodo: string, valor: string) => ({
  id: `${lineaId}-${periodo}`,
  linea_id: lineaId,
  periodo,
  valor: dinero(valor),
})

/**
 * Gasto tal como lo selecciona `loadGastosEjecutados`: la fila trae la línea, y por ella el rubro.
 * T10: la línea es lo que impide que dos líneas del mismo rubro se queden con los mismos gastos.
 */
const LINEA_DE_RUBRO: Record<string, string> = { r01: "l01", r12: "l12", r99: "l99" }
const gasto = (rubroId: string, periodo: string, valor: string, estado = "VALIDADO", lineaId?: string) => ({
  periodo,
  monto_cop: dinero(valor),
  estado,
  linea: { id: lineaId ?? LINEA_DE_RUBRO[rubroId] ?? `l-${rubroId}`, rubro_id: rubroId },
})

const snapshot = (over: Partial<SnapshotV1> = {}): SnapshotV1 => ({
  schema: 1,
  proyecto: { valor_total: "83500000.00", fecha_inicio: "2026-10-05", fecha_fin: "2027-01-29", beneficiarios_meta: 120 },
  presupuesto: [],
  programacion: [],
  actividades: [],
  entregables: [],
  indicadores: [],
  ...over,
})

const PROYECTO: Omit<FinancialSheetInput, "baseParam" | "corteParam"> = {
  id: "pry-1",
  estado: "EN_EJECUCION",
  fecha_inicio: new Date("2026-10-05T00:00:00.000Z"),
  fecha_fin: new Date("2027-01-29T00:00:00.000Z"),
}

const ficha = async (input: Partial<FinancialSheetInput> = {}) => {
  const result = await calcularFichaFinanciera({ ...PROYECTO, baseParam: null, corteParam: "2026-11", ...input })
  if (!result.ok) throw new Error(`La ficha respondió ${result.response.status}`)
  return result.value
}

// F-F1 de las pruebas del endpoint con otro reparto: R01 59,5 M y R12 24 M a cuatro meses, gastos
// en octubre y noviembre, uno en diciembre (fuera del corte) y uno anulado.
const LINEAS = [
  linea("l01", "r01", "R01", "Personal", 1, "59500000.00"),
  linea("l12", "r12", "R12", "Transporte", 12, "24000000.00"),
]
const CELDAS = PERIODOS.flatMap((periodo) => [
  celda("l01", periodo, "14875000.00"),
  celda("l12", periodo, "6000000.00"),
])
const GASTOS = [
  gasto("r01", "2026-10", "12000000.00"),
  gasto("r01", "2026-11", "15000000.00", "REGISTRADO"),
  gasto("r01", "2026-11", "5000000.00", "ANULADO"),
  gasto("r12", "2026-11", "6500000.00"),
  gasto("r12", "2026-12", "1000000.00"),
  // Rubro sin línea presupuestal: no hay quién lo reciba (ver el `gastosDe` de la base original).
  gasto("r99", "2026-11", "777000.00"),
]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-11-20T15:00:00.000Z"))
  mocks.lineas.mockResolvedValue(LINEAS)
  mocks.celdas.mockResolvedValue(CELDAS)
  mocks.gastos.mockResolvedValue(GASTOS)
  mocks.version.mockResolvedValue(null)
  mocks.setting.mockResolvedValue({
    key: "semaforo_parametros_v2",
    value: { tolerancia: { valor: 10, confirmado: true }, retraso: { valor: 60, confirmado: true } },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("calcularFichaFinanciera — A, P y E por rubro", () => {
  it("arma una fila por línea con A de la línea, P al corte y E de los gastos de su rubro", async () => {
    const value = await ficha()
    expect(value.base).toBe("vigente")
    expect(value.corte).toBe("2026-11")
    expect(value.rubros.map((fila) => fila.codigo)).toEqual(["R01", "R12"])
    expect(value.rubros[0]).toMatchObject({
      rubro_id: "r01",
      nombre: "Personal",
      asignado: "59500000.00",
      programado: "29750000.00",
      ejecutado: "27000000.00",
      diferencia: "-2750000.00",
      ep_decimas: 908,
      ea_decimas: 454,
      umbral_rojo: "32725000.00",
      color: "verde",
    })
    expect(value.rubros[1]).toMatchObject({
      rubro_id: "r12",
      asignado: "24000000.00",
      programado: "12000000.00",
      // El de diciembre queda fuera del corte y el anulado de R01 no cuenta.
      // Los 777.000 de r99 (rubro sin línea) tampoco: `gastosDe` casa por rubro_id y nadie los pide.
      ejecutado: "6500000.00",
      diferencia: "-5500000.00",
      ep_decimas: 542,
      ea_decimas: 271,
      umbral_rojo: "13200000.00",
      color: "verde",
    })
    expect(value.total).toMatchObject({
      rubro_id: null,
      nombre: "Total",
      asignado: "83500000.00",
      programado: "41750000.00",
      ejecutado: "33500000.00",
      diferencia: "-8250000.00",
      ep_decimas: 802,
      ea_decimas: 401,
      umbral_rojo: "45925000.00",
      color: "verde",
    })
    expect(value.parametros).toEqual({ tolerancia: 10, retraso: 60, confirmado: true })
  })

  it("con dos líneas del mismo rubro, cada gasto cuenta en su línea y no se duplica en el total", async () => {
    // T10: antes la ficha le pasaba a cada línea los mismos gastos de su rubro_id, así que 6.500.000 se
    // contaban dos veces en el total. Ahora cada gasto va a su línea y el total es lo gastado de verdad.
    mocks.lineas.mockResolvedValue([
      linea("l1", "r12", "R12", "Transporte", 12, "15000000.00"),
      linea("l2", "r12", "R12", "Transporte", 12, "8000000.00"),
    ])
    mocks.celdas.mockResolvedValue([celda("l1", "2026-10", "15000000.00"), celda("l2", "2026-11", "8000000.00")])
    mocks.gastos.mockResolvedValue([gasto("r12", "2026-11", "6500000.00", "VALIDADO", "l1")])
    const value = await ficha()
    expect(value.rubros.map((fila) => fila.codigo)).toEqual(["R12", "R12"])
    expect(value.rubros.map((fila) => fila.ejecutado)).toEqual(["6500000.00", "0.00"])
    expect(value.total.asignado).toBe("23000000.00")
    expect(value.total.programado).toBe("23000000.00")
    expect(value.total.ejecutado).toBe("6500000.00")
  })

  it("base original: A y P salen del snapshot v0 y E de los gastos vivos del rubro", async () => {
    mocks.version.mockResolvedValue({
      snapshot: snapshot({
        presupuesto: [
          { rubro_codigo: "R01", rubro_nombre: "Personal", asignado: "59500000.00" },
          // v0 congeló 25.000.000; la vigente dice 24.000.000 después de un traslado.
          { rubro_codigo: "R12", rubro_nombre: "Transporte", asignado: "25000000.00" },
        ],
        programacion: PERIODOS.flatMap((periodo) => [
          { rubro_codigo: "R01", periodo, valor: "14875000.00" },
          { rubro_codigo: "R12", periodo, valor: "6250000.00" },
        ]),
      }),
    })
    const value = await ficha({ baseParam: "original" })
    expect(value.base).toBe("original")
    expect(value.rubros[1]).toMatchObject({
      rubro_id: "r12",
      asignado: "25000000.00",
      programado: "12500000.00",
      ejecutado: "6500000.00",
      diferencia: "-6000000.00",
      ep_decimas: 520,
      ea_decimas: 260,
    })
  })

  it("base original: une los códigos de v0 y de la vigente, con fila sintética para el rubro que ya no existe", async () => {
    mocks.version.mockResolvedValue({
      snapshot: snapshot({
        presupuesto: [
          { rubro_codigo: "R01", rubro_nombre: "Personal", asignado: "59500000.00" },
          { rubro_codigo: "R20", rubro_nombre: "Imprevistos", asignado: "100.00" },
        ],
      }),
    })
    const value = await ficha({ baseParam: "original" })
    expect(value.rubros.map((fila) => [fila.codigo, fila.rubro_id])).toEqual([
      ["R01", "r01"],
      // Rubro que sólo existe en la vigente: entra con A y P en cero, pero su E vivo se muestra.
      ["R12", "r12"],
      // Rubro que sólo existe en v0: id sintético `v0:<codigo>` y sin gastos posibles.
      ["R20", "v0:R20"],
    ])
    expect(value.rubros[1]).toMatchObject({ nombre: "Transporte", asignado: "0.00", programado: "0.00", ejecutado: "6500000.00" })
    expect(value.rubros[2]).toMatchObject({ nombre: "Imprevistos", asignado: "100.00", programado: "0.00", ejecutado: "0.00" })
    expect(value.total.asignado).toBe("59500100.00")
    expect(value.total.ejecutado).toBe("33500000.00")
  })

  it("base original: un rubro vivo sin código no entra y sus gastos desaparecen del total", async () => {
    // `rubrosDelOriginal` indexa la vigente por `codigo`: la línea de un rubro legado (codigo null) no
    // tiene fila, así que ni su asignado ni su ejecutado se cuentan en ninguna parte.
    mocks.lineas.mockResolvedValue([
      linea("l01", "r01", "R01", "Personal", 1, "59500000.00"),
      linea("l99", "r99", null, "Rubro legado", 99, "1000000.00"),
    ])
    mocks.version.mockResolvedValue({
      snapshot: snapshot({ presupuesto: [{ rubro_codigo: "R01", rubro_nombre: "Personal", asignado: "59500000.00" }] }),
    })
    const value = await ficha({ baseParam: "original" })
    expect(value.rubros.map((fila) => fila.codigo)).toEqual(["R01"])
    expect(value.total.asignado).toBe("59500000.00")
    // Tampoco entran los 6.500.000 de R12 (sin línea viva) ni los 777.000 de r99.
    expect(value.total.ejecutado).toBe("27000000.00")
  })

  it("base original: dos líneas del mismo rubro no duplican E, porque el mapa por código las colapsa", async () => {
    // Contraste con la base vigente: acá la fila se identifica por código de rubro, no por línea.
    mocks.lineas.mockResolvedValue([
      linea("l1", "r12", "R12", "Transporte", 12, "15000000.00"),
      linea("l2", "r12", "R12", "Transporte", 12, "8000000.00"),
    ])
    mocks.version.mockResolvedValue({
      snapshot: snapshot({ presupuesto: [{ rubro_codigo: "R12", rubro_nombre: "Transporte", asignado: "25000000.00" }] }),
    })
    mocks.gastos.mockResolvedValue([gasto("r12", "2026-11", "6500000.00", "VALIDADO", "l1")])
    const value = await ficha({ baseParam: "original" })
    expect(value.rubros).toHaveLength(1)
    expect(value.rubros[0]).toMatchObject({ asignado: "25000000.00", ejecutado: "6500000.00" })
    expect(value.total.ejecutado).toBe("6500000.00")
  })
})
