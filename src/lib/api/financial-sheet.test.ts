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

import { calcularFichaFinanciera, type FinancialSheet, type FinancialSheetInput } from "./financial-sheet"
import { sumCents, toCents } from "@/lib/proyectos/money"
import type { SnapshotV1 } from "@/lib/proyectos/versiones"

const PERIODOS = ["2026-10", "2026-11", "2026-12", "2027-01"]

const dinero = (valor: string) => new Prisma.Decimal(valor)

type ActividadDeLinea = {
  id: string
  codigo: string
  nombre: string
  tipo: "NORMAL" | "TRANSVERSAL"
  objetivo: { id: string; codigo: string; orden: number } | null
  /** S11/T14.5-B: el cierre de la actividad, tal como lo lee la hoja (null = gastos abiertos). */
  gastos_cerrados_at: Date | null
  gastos_cerrados_nota: string | null
}

type Linea = {
  id: string
  rubro_id: string
  /** S10: la actividad de la línea; null en una línea heredada («Sin actividad»). */
  actividad_id: string | null
  monto_proyectado_cop: Prisma.Decimal
  rubro: { codigo: string | null; nombre: string; orden: number; activo: boolean }
  actividad: ActividadDeLinea | null
}

const linea = (
  id: string,
  rubroId: string,
  codigo: string | null,
  nombre: string,
  orden: number,
  monto: string,
  actividad: ActividadDeLinea | null = null,
): Linea => ({
  id,
  rubro_id: rubroId,
  actividad_id: actividad?.id ?? null,
  monto_proyectado_cop: dinero(monto),
  rubro: { codigo, nombre, orden, activo: true },
  actividad,
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
    // EV-06: «El valor de cada rubro es la suma de ese rubro en todas las actividades»: one R12 row.
    expect(value.rubros.map((fila) => fila.codigo)).toEqual(["R12"])
    expect(value.rubros[0]).toMatchObject({ asignado: "23000000.00", programado: "23000000.00", ejecutado: "6500000.00" })
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

// S10 (EV-06): la vista «Por actividad». Cada fila agrupa las líneas de UNA actividad y saca sus
// A / P / E de la misma `computeFicha` de la vista por rubro, así que el ejecutado total no puede
// diferir entre las dos vistas. D4: las líneas sin actividad van a una fila «Sin actividad», y una
// actividad TRANSVERSAL se agrupa en «Gestión del proyecto» sin objetivo (S6).
describe("calcularFichaFinanciera — por actividad (S10)", () => {
  const objetivoDe = (codigo: string, orden: number) => ({ id: `obj-${codigo}`, codigo, orden })
  const actividadDe = (
    id: string,
    codigo: string,
    nombre: string,
    objetivo: { id: string; codigo: string; orden: number } | null,
    tipo: "NORMAL" | "TRANSVERSAL" = "NORMAL",
  ): ActividadDeLinea => ({ id, codigo, nombre, tipo, objetivo, gastos_cerrados_at: null, gastos_cerrados_nota: null })

  const O1 = objetivoDe("1", 1)
  const O2 = objetivoDe("2", 2)
  const A11 = actividadDe("act-11", "1.1", "Talleres", O1)
  const A12 = actividadDe("act-12", "1.2", "Ferias", O1)
  const A21 = actividadDe("act-21", "2.1", "Ruedas", O2)
  const AG = actividadDe("act-g", "G-1", "Coordinación", null, "TRANSVERSAL")

  // Una actividad con dos rubros (1.2), una transversal sin objetivo, y una línea heredada sin
  // actividad. A total 28.000.000 y P total 28.000.000 (7.000.000 por mes).
  const LINEAS_S10 = [
    linea("l11", "r01", "R01", "Personal", 1, "10000000.00", A11),
    linea("l12", "r12", "R12", "Transporte", 12, "6000000.00", A12),
    linea("l12b", "r13", "R13", "Materiales", 13, "4000000.00", A12),
    linea("l21", "r12", "R12", "Transporte", 12, "5000000.00", A21),
    linea("lg", "r01", "R01", "Personal", 1, "1000000.00", AG),
    linea("lh", "r14", "R14", "Imprevistos", 14, "2000000.00"),
  ]
  const programada = (lineaId: string, valor: string) => PERIODOS.map((periodo) => celda(lineaId, periodo, valor))
  const CELDAS_S10 = [
    ...programada("l11", "2500000.00"),
    ...programada("l12", "1500000.00"),
    ...programada("l12b", "1000000.00"),
    ...programada("l21", "1250000.00"),
    ...programada("lg", "250000.00"),
    ...programada("lh", "500000.00"),
  ]
  // E al corte 2026-11: 2.170.000 (el de diciembre queda fuera y el anulado no cuenta).
  const GASTOS_S10 = [
    gasto("r12", "2026-10", "1000000.00", "VALIDADO", "l12"),
    gasto("r13", "2026-11", "500000.00", "REGISTRADO", "l12b"),
    gasto("r12", "2026-10", "250000.00", "VALIDADO", "l21"),
    gasto("r01", "2026-10", "120000.00", "VALIDADO", "lg"),
    gasto("r14", "2026-11", "300000.00", "VALIDADO", "lh"),
    gasto("r12", "2026-12", "900000.00", "VALIDADO", "l12"),
    gasto("r13", "2026-10", "100000.00", "ANULADO", "l12b"),
  ]

  const fichaS10 = async (input: Partial<FinancialSheetInput> = {}) => {
    mocks.lineas.mockResolvedValue(LINEAS_S10)
    mocks.celdas.mockResolvedValue(CELDAS_S10)
    mocks.gastos.mockResolvedValue(GASTOS_S10)
    return ficha(input)
  }
  const sumaEjecutado = (filas: readonly { ejecutado: string }[]) => sumCents(filas.map((fila) => toCents(fila.ejecutado)))
  const filaDe = (value: FinancialSheet, codigo: string) => {
    const fila = value.actividades.find((candidata) => candidata.codigo === codigo)
    if (!fila) throw new Error(`Falta la fila de la actividad ${codigo}`)
    return fila
  }

  it("el ejecutado total es igual en las dos vistas (S10)", async () => {
    const value = await fichaS10()
    expect(sumaEjecutado(value.actividades)).toBe(toCents(value.total.ejecutado))
    expect(sumaEjecutado(value.actividades)).toBe(sumaEjecutado(value.rubros))
    expect(sumaEjecutado(value.actividades)).toBe(toCents("2170000.00"))
  })

  it("un gasto registrado en la actividad 1.2 sube el ejecutado de esa actividad y el de su rubro (S10)", async () => {
    const antes = await fichaS10()
    mocks.gastos.mockResolvedValue([...GASTOS_S10, gasto("r12", "2026-11", "400000.00", "REGISTRADO", "l12")])
    const despues = await ficha()
    // El rubro R12 está en dos actividades: la vista por rubro lo suma, y la de 1.2 sube igual.
    const rubroR12 = (value: FinancialSheet) =>
      sumCents(value.rubros.filter((fila) => fila.codigo === "R12").map((fila) => toCents(fila.ejecutado)))
    expect(toCents(filaDe(despues, "1.2").ejecutado) - toCents(filaDe(antes, "1.2").ejecutado)).toBe(toCents("400000.00"))
    expect(rubroR12(despues) - rubroR12(antes)).toBe(toCents("400000.00"))
    expect(filaDe(despues, "1.2").ejecutado).toBe("1900000.00")
  })

  it("agrupa en «Gestión del proyecto» la transversal y la fila «Sin actividad» (S10, D4)", async () => {
    const value = await fichaS10()
    expect(value.actividades.map((fila) => [fila.objetivo_codigo, fila.codigo, fila.gestion])).toEqual([
      ["1", "1.1", false],
      ["1", "1.2", false],
      ["2", "2.1", false],
      [null, "G-1", true],
      [null, null, true],
    ])
    expect(filaDe(value, "G-1")).toMatchObject({
      actividad_id: "act-g",
      nombre: "Coordinación",
      objetivo_id: null,
      objetivo_codigo: null,
      gestion: true,
      asignado: "1000000.00",
      ejecutado: "120000.00",
    })
    const sinActividad = value.actividades[value.actividades.length - 1]
    expect(sinActividad).toMatchObject({
      actividad_id: null,
      codigo: null,
      nombre: "Sin actividad",
      objetivo_id: null,
      objetivo_codigo: null,
      gestion: true,
      asignado: "2000000.00",
      ejecutado: "300000.00",
    })
  })

  it("el asignado y el programado al corte de una actividad son la suma de sus líneas (S10)", async () => {
    const value = await fichaS10()
    // 1.2 tiene Transporte 6.000.000 y Materiales 4.000.000, cada uno a 1.500.000 y 1.000.000 por mes.
    expect(filaDe(value, "1.2")).toMatchObject({
      asignado: "10000000.00",
      programado: "5000000.00",
      ejecutado: "1500000.00",
      diferencia: "-3500000.00",
      saldo: "8500000.00",
      ep_decimas: 300,
      ea_decimas: 150,
      umbral_rojo: "5500000.00",
      color: "verde",
    })
    // Noviembre y diciembre no cuentan todavía: el programado es «al corte».
    const octubre = await fichaS10({ corteParam: "2026-10" })
    expect(filaDe(octubre, "1.2")).toMatchObject({
      programado: "2500000.00",
      ejecutado: "1000000.00",
      saldo: "9000000.00",
    })
  })

  it("una actividad con dos rubros publica su detalle y los hijos suman exactamente la fila de la actividad (S10)", async () => {
    const value = await fichaS10()
    const ferias = filaDe(value, "1.2")
    // Los hijos son las filas de rubro de verdad de la actividad, con el formato del nivel superior.
    expect(ferias.rubros.map((fila) => [fila.codigo, fila.asignado, fila.programado, fila.ejecutado])).toEqual([
      ["R12", "6000000.00", "3000000.00", "1000000.00"],
      ["R13", "4000000.00", "2000000.00", "500000.00"],
    ])
    expect(Object.keys(ferias.rubros[0])).toEqual(Object.keys(value.rubros[0]))
    // La fila de la actividad es el total de la MISMA computeFicha: ninguna fórmula ni umbral propio.
    const campos = ["asignado", "programado", "ejecutado", "diferencia", "umbral_rojo"] as const
    for (const campo of campos) {
      expect(sumCents(ferias.rubros.map((fila) => toCents(fila[campo]))), campo).toBe(toCents(ferias[campo]))
    }
    expect(ferias).toMatchObject({ ep_decimas: 300, ea_decimas: 150, color: "verde", saldo: "8500000.00" })
  })

  it("«Sin actividad» detalla los rubros de sus propias líneas (S10, D4)", async () => {
    const value = await fichaS10()
    const sinActividad = value.actividades[value.actividades.length - 1]
    expect(sinActividad).toMatchObject({ actividad_id: null, codigo: null, objetivo_id: null, gestion: true })
    expect(
      sinActividad.rubros.map((fila) => [fila.codigo, fila.rubro_id, fila.asignado, fila.programado, fila.ejecutado]),
    ).toEqual([["R14", "r14", "2000000.00", "1000000.00", "300000.00"]])
    expect(sumCents(sinActividad.rubros.map((fila) => toCents(fila.ejecutado)))).toBe(toCents(sinActividad.ejecutado))
  })

  it("350.000 en la actividad 1.2 y 650.000 en la 1.3 no se cruzan en los hijos (S10)", async () => {
    // Las dos actividades comparten el rubro R12 (una línea por actividad, T10): si los hijos se armaran
    // por rubro en vez de por actividad, cada uno se llevaría los dos gastos.
    const ferias = actividadDe("act-12", "1.2", "Ferias", O1)
    const talleres = actividadDe("act-13", "1.3", "Talleres", O1)
    mocks.lineas.mockResolvedValue([
      linea("l12", "r12", "R12", "Transporte", 12, "6000000.00", ferias),
      linea("l13", "r12", "R12", "Transporte", 12, "6000000.00", talleres),
    ])
    mocks.celdas.mockResolvedValue([...programada("l12", "1500000.00"), ...programada("l13", "1500000.00")])
    mocks.gastos.mockResolvedValue([
      gasto("r12", "2026-10", "350000.00", "VALIDADO", "l12"),
      gasto("r12", "2026-10", "650000.00", "VALIDADO", "l13"),
    ])
    const value = await ficha()
    expect(filaDe(value, "1.2").rubros.map((fila) => [fila.rubro_id, fila.ejecutado])).toEqual([["r12", "350000.00"]])
    expect(filaDe(value, "1.3").rubros.map((fila) => [fila.rubro_id, fila.ejecutado])).toEqual([["r12", "650000.00"]])
    expect(filaDe(value, "1.2").ejecutado).toBe("350000.00")
    expect(filaDe(value, "1.3").ejecutado).toBe("650000.00")
    // EV-06: la vista por rubro suma el rubro en todas las actividades (una fila R12 con 1.000.000), y el total
    // ejecutado es el mismo que el de la vista por actividad.
    expect(value.rubros.map((fila) => [fila.codigo, fila.ejecutado])).toEqual([["R12", "1000000.00"]])
    expect(sumaEjecutado(value.actividades)).toBe(toCents(value.total.ejecutado))
  })

  it("con base=original la vista por actividad sigue leyendo el presupuesto vigente (S10)", async () => {
    // El snapshot v0 no dice de qué línea sale cada peso; congelar A y P de las líneas no es posible,
    // así que las filas por actividad son siempre las vigentes y `base` sólo cambia `rubros`/`total`.
    mocks.version.mockResolvedValue({
      snapshot: snapshot({ presupuesto: [{ rubro_codigo: "R01", rubro_nombre: "Personal", asignado: "59500000.00" }] }),
    })
    const value = await fichaS10({ baseParam: "original" })
    expect(value.base).toBe("original")
    // La base original une los códigos congelados con los vivos (S8): R01 del v0 y el resto de la vigente.
    expect(value.rubros.map((fila) => fila.codigo)).toEqual(["R01", "R12", "R13", "R14"])
    expect(value.rubros[0]).toMatchObject({ asignado: "59500000.00" })
    expect(filaDe(value, "1.2")).toMatchObject({ asignado: "10000000.00", programado: "5000000.00", ejecutado: "1500000.00" })
  })

  it("BORRADOR: las filas por actividad tampoco llevan color ni porcentajes", async () => {
    const value = await fichaS10({ estado: "BORRADOR" })
    expect(value.ejecucion_disponible).toBe(false)
    for (const fila of value.actividades) {
      expect(fila).toMatchObject({ ejecutado: "0.00", color: null, ep_decimas: null, ea_decimas: null, saldo: fila.asignado })
    }
  })
})

// S11 (EV-07/T14.5-B): la hoja publica el cierre de la actividad. Abierta, el saldo (A − E) y ningún ahorro;
// cerrada, el ahorro o la sobreejecución con su nota y su instante. Todo se LEE de `Actividad`: la hoja no
// guarda un monto de ahorro, así que una corrección posterior no puede dejarlo desfasado.
describe("calcularFichaFinanciera — cierre de gastos de la actividad (S11)", () => {
  const O1 = { id: "obj-1", codigo: "1", orden: 1 }
  const O2 = { id: "obj-2", codigo: "2", orden: 2 }
  const A12: ActividadDeLinea = {
    id: "act-12",
    codigo: "1.2",
    nombre: "Ferias",
    tipo: "NORMAL",
    objetivo: O1,
    gastos_cerrados_at: null,
    gastos_cerrados_nota: null,
  }
  const cerradaEl = new Date("2026-11-15T10:00:00.000Z")
  const NOTA = "No se requirió transporte porque el taller fue en el mismo municipio"
  const cerrar = (actividad: ActividadDeLinea, nota = NOTA): ActividadDeLinea => ({
    ...actividad,
    gastos_cerrados_at: cerradaEl,
    gastos_cerrados_nota: nota,
  })

  /** El caso exacto de los criterios: una línea de 10.000.000 y un gasto de 7.000.000 al corte. */
  const fichaS11 = async (
    actividad: ActividadDeLinea = A12,
    gastos = [gasto("r12", "2026-10", "7000000.00", "VALIDADO", "l12")],
  ) => {
    mocks.lineas.mockResolvedValue([linea("l12", "r12", "R12", "Transporte", 12, "10000000.00", actividad)])
    mocks.celdas.mockResolvedValue(PERIODOS.map((periodo) => celda("l12", periodo, "2500000.00")))
    mocks.gastos.mockResolvedValue(gastos)
    return ficha()
  }
  const filaDe = (value: FinancialSheet, codigo: string) => {
    const fila = value.actividades.find((candidata) => candidata.codigo === codigo)
    if (!fila) throw new Error(`Falta la fila de la actividad ${codigo}`)
    return fila
  }

  it("una actividad abierta con 10.000.000 asignados y 7.000.000 ejecutados muestra saldo 3.000.000 (S11)", async () => {
    const value = await fichaS11()
    expect(filaDe(value, "1.2")).toMatchObject({
      asignado: "10000000.00",
      ejecutado: "7000000.00",
      saldo: "3000000.00",
      cerrada: false,
      cerrada_at: null,
      nota_cierre: null,
    })
  })

  it("al cerrarla con nota muestra ahorro 3.000.000 y la nota (S11)", async () => {
    const value = await fichaS11(cerrar(A12))
    expect(filaDe(value, "1.2")).toMatchObject({
      saldo: "3000000.00",
      cerrada: true,
      cerrada_at: "2026-11-15T10:00:00.000Z",
      nota_cierre: NOTA,
      ahorro: "3000000.00",
      sobreejecucion: "0.00",
    })
  })

  it("una actividad cerrada que gastó de más muestra sobreejecución, no ahorro (S11)", async () => {
    const value = await fichaS11(cerrar({ ...A12, id: "act-21", codigo: "2.1", nombre: "Ruedas", objetivo: O2 }), [
      gasto("r12", "2026-10", "12000000.00", "VALIDADO", "l12"),
    ])
    expect(filaDe(value, "2.1")).toMatchObject({
      asignado: "10000000.00",
      ejecutado: "12000000.00",
      saldo: "-2000000.00",
      cerrada: true,
      nota_cierre: NOTA,
      ahorro: "0.00",
      sobreejecucion: "2000000.00",
    })
  })

  it("no inventa ahorro para una actividad abierta, aunque haya sobrado (S11)", async () => {
    const value = await fichaS11()
    const fila = filaDe(value, "1.2")
    expect(fila.ahorro).toBeNull()
    expect(fila.sobreejecucion).toBeNull()
  })

  it("no inventa ahorro ni sobreejecución para una actividad abierta que gastó de más (S11)", async () => {
    const value = await fichaS11(A12, [gasto("r12", "2026-10", "12000000.00", "VALIDADO", "l12")])
    expect(filaDe(value, "1.2")).toMatchObject({
      saldo: "-2000000.00",
      cerrada: false,
      ahorro: null,
      sobreejecucion: null,
    })
  })

  it("la fila «Sin actividad» no lleva cierre: no hay actividad que cerrar (S11, D4)", async () => {
    mocks.lineas.mockResolvedValue([
      linea("l12", "r12", "R12", "Transporte", 12, "10000000.00", A12),
      linea("lh", "r14", "R14", "Imprevistos", 14, "2000000.00"),
    ])
    mocks.celdas.mockResolvedValue(
      PERIODOS.flatMap((periodo) => [celda("l12", periodo, "2500000.00"), celda("lh", periodo, "500000.00")]),
    )
    mocks.gastos.mockResolvedValue([gasto("r14", "2026-10", "300000.00", "VALIDADO", "lh")])
    const value = await ficha()
    const sinActividad = value.actividades[value.actividades.length - 1]
    expect(sinActividad).toMatchObject({
      actividad_id: null,
      cerrada: false,
      cerrada_at: null,
      nota_cierre: null,
      ahorro: null,
      sobreejecucion: null,
      saldo: "1700000.00",
    })
  })
})
