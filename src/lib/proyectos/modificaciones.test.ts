import { describe, expect, it } from "vitest"

import { liveF_V1 } from "./__fixtures__/versiones"
import { applyModificacion, validarModificacion, type DetalleItem, type ErrorRegla } from "./modificaciones"
import { toCents, type Cents } from "./money"
import { buildSnapshot, diffSnapshots, type LiveProyecto } from "./versiones"

const SIN_EJECUTADO: ReadonlyMap<string, Cents> = new Map()
const PERMISIVO = { bloqueaPeriodosPasados: false }
const BLOQUEA = { bloqueaPeriodosPasados: true }

const presupuesto = (clave: string, antes: string, despues: string): DetalleItem => ({
  elemento: "presupuesto",
  clave,
  campo: "asignado",
  antes,
  despues,
})
const celda = (clave: string, antes: string, despues: string): DetalleItem => ({
  elemento: "programacion",
  clave,
  campo: "valor",
  antes,
  despues,
})

/** R12 -1.000.000 / R13 +1.000.000, with the matching January cells (R12 6M -> 5M, R13 3.2M -> 4.2M). */
const traslado = (): DetalleItem[] => [
  presupuesto("R12", "24000000", "23000000"),
  presupuesto("R13", "12800000", "13800000"),
  celda("R12|2027-01", "6000000", "5000000"),
  celda("R13|2027-01", "3200000", "4200000"),
]

const codigos = (errores: ErrorRegla[]) => errores.map((e) => e.codigo)
const valida = (live: LiveProyecto, tipo: Parameters<typeof validarModificacion>[1]["tipo"], detalle: DetalleItem[], opts: {
  ejecutado?: ReadonlyMap<string, Cents>
  periodoActual?: string
  params?: { bloqueaPeriodosPasados: boolean }
} = {}) =>
  validarModificacion(live, { tipo, detalle }, opts.ejecutado ?? SIN_EJECUTADO, opts.periodoActual ?? "2026-10", opts.params ?? PERMISIVO)

describe("applyModificacion", () => {
  it("TRASLADO keeps valor_total and moves A and P between rubros", () => {
    const live = liveF_V1()
    const despues = applyModificacion(live, { tipo: "TRASLADO", detalle: traslado() })
    expect(despues.proyecto.valor_total).toBe(live.proyecto.valor_total)
    const diff = diffSnapshots(buildSnapshot(live), buildSnapshot(despues))
    expect(diff.filter((d) => d.elemento === "presupuesto").map((d) => `${d.clave}:${d.desde}->${d.hasta}`)).toEqual([
      "R12:24000000.00->23000000.00",
      "R13:12800000.00->13800000.00",
    ])
    expect(diff.filter((d) => d.elemento === "programacion").map((d) => d.clave)).toEqual(["R12|2027-01", "R13|2027-01"])
    expect(diff.some((d) => d.elemento === "proyecto")).toBe(false)
  })

  it("ADICION derives valor_total as the sum of A (D2)", () => {
    const live = liveF_V1()
    const despues = applyModificacion(live, {
      tipo: "ADICION",
      detalle: [presupuesto("R12", "24000000", "29000000"), celda("R12|2027-01", "6000000", "7250000"), celda("R12|2026-12", "6000000", "7250000"), celda("R12|2026-11", "6000000", "7250000"), celda("R12|2026-10", "6000000", "7250000")],
    })
    expect(despues.proyecto.valor_total).toBe("182360000.00")
  })

  it("REDUCCION lowers valor_total by the sum of the deltas", () => {
    const live = liveF_V1()
    const despues = applyModificacion(live, { tipo: "REDUCCION", detalle: [presupuesto("R12", "24000000", "23000000")] })
    expect(despues.proyecto.valor_total).toBe("176360000.00")
  })

  it("a rubro without a line gets one named from the catalog; A=0 with no programming drops the line", () => {
    const live = liveF_V1()
    const nuevo = applyModificacion(
      live,
      { tipo: "ADICION", detalle: [presupuesto("R20", "0", "100"), celda("R20|2026-10", "0", "100")] },
      new Map([["R20", "Imprevistos"]]),
    )
    expect(nuevo.presupuesto.find((r) => r.rubro_codigo === "R20")).toMatchObject({ rubro_nombre: "Imprevistos", asignado: "100.00" })
    const sin = applyModificacion(live, {
      tipo: "REDUCCION",
      detalle: [presupuesto("R15", "320000", "0"), ...["2026-10", "2026-11", "2026-12", "2027-01"].map((p) => celda(`R15|${p}`, "80000", "0"))],
    })
    expect(sin.presupuesto.some((r) => r.rubro_codigo === "R15")).toBe(false)
    expect(sin.programacion.some((c) => c.rubro_codigo === "R15")).toBe(false)
  })

  it("CRONOGRAMA recomputes the weight of every activity whose weeks changed (AJ-02)", () => {
    const live = liveF_V1()
    const despues = applyModificacion(live, {
      tipo: "CRONOGRAMA",
      detalle: [
        { elemento: "actividad", clave: "1.4", campo: "semana_fin", antes: "6", despues: "8" },
        { elemento: "actividad", clave: "1.1", campo: "semana_fin", antes: "1", despues: "3" },
      ],
    })
    // 1.4 spans 3..8 = 6 weeks; 1.1 spans 1..3 = 3 weeks. No weight is manual any more.
    expect(despues.actividades.find((a) => a.codigo === "1.4")).toMatchObject({ semana_fin: 8, peso: "6" })
    expect(despues.actividades.find((a) => a.codigo === "1.1")).toMatchObject({ semana_fin: 3, peso: "3" })
  })

  it("does not mutate its input", () => {
    const live = liveF_V1()
    const copia = JSON.stringify(live)
    applyModificacion(live, { tipo: "TRASLADO", detalle: traslado() })
    expect(JSON.stringify(live)).toBe(copia)
  })
})

describe("validarModificacion", () => {
  it("accepts a balanced TRASLADO", () => {
    expect(valida(liveF_V1(), "TRASLADO", traslado())).toEqual([])
  })

  it("rejects a TRASLADO that changes the total", () => {
    const detalle = [presupuesto("R12", "24000000", "23000000"), celda("R12|2027-01", "6000000", "5000000")]
    expect(codigos(valida(liveF_V1(), "TRASLADO", detalle))).toContain("TRASLADO_CAMBIA_TOTAL")
  })

  it("requires an ADICION to raise and a REDUCCION to lower the budget", () => {
    const baja = [presupuesto("R12", "24000000", "23000000"), celda("R12|2027-01", "6000000", "5000000")]
    expect(codigos(valida(liveF_V1(), "ADICION", baja))).toContain("ADICION_NO_AUMENTA")
    const sube = [presupuesto("R12", "24000000", "25000000"), celda("R12|2027-01", "6000000", "7000000")]
    expect(codigos(valida(liveF_V1(), "REDUCCION", sube))).toContain("REDUCCION_NO_DISMINUYE")
    expect(valida(liveF_V1(), "ADICION", sube)).toEqual([])
    expect(valida(liveF_V1(), "REDUCCION", baja)).toEqual([])
  })

  it("rejects leaving A below the validated E (REQ-GAS-06)", () => {
    const detalle = [presupuesto("R12", "24000000", "23000000"), celda("R12|2027-01", "6000000", "5000000")]
    const ejecutado = new Map([["R12", toCents("23500000")]])
    const errores = valida(liveF_V1(), "REDUCCION", detalle, { ejecutado })
    expect(codigos(errores)).toEqual(["A_MENOR_QUE_EJECUTADO"])
    expect(errores[0]!.clave).toBe("R12")
    expect(errores[0]!.mensaje).toContain("«R12»")
    // exactly equal is allowed
    expect(valida(liveF_V1(), "REDUCCION", detalle, { ejecutado: new Map([["R12", toCents("23000000")]]) })).toEqual([])
  })

  it("rejects a rubro that vanishes while it has validated expenses", () => {
    const detalle = [presupuesto("R15", "320000", "0"), ...["2026-10", "2026-11", "2026-12", "2027-01"].map((p) => celda(`R15|${p}`, "80000", "0"))]
    const errores = valida(liveF_V1(), "REDUCCION", detalle, { ejecutado: new Map([["R15", toCents("1")]]) })
    expect(codigos(errores)).toEqual(["A_MENOR_QUE_EJECUTADO"])
  })

  it("rejects reprogramming elapsed periods when the rule is on, and allows it when off", () => {
    const detalle = [celda("R12|2026-10", "6000000", "5000000"), celda("R12|2026-11", "6000000", "7000000")]
    const bloqueado = valida(liveF_V1(), "REPROGRAMACION", detalle, { periodoActual: "2026-11", params: BLOQUEA })
    expect(codigos(bloqueado)).toEqual(["PERIODO_PASADO"])
    expect(bloqueado[0]!.clave).toBe("R12|2026-10")
    expect(valida(liveF_V1(), "REPROGRAMACION", detalle, { periodoActual: "2026-11", params: PERMISIVO })).toEqual([])
    // the current month stays editable
    expect(valida(liveF_V1(), "REPROGRAMACION", [celda("R12|2026-11", "6000000", "5000000"), celda("R12|2026-12", "6000000", "7000000")], { periodoActual: "2026-11", params: BLOQUEA })).toEqual([])
  })

  it("rejects a programming that no longer matches A, and a period outside the project", () => {
    expect(codigos(valida(liveF_V1(), "REPROGRAMACION", [celda("R12|2027-01", "6000000", "5000000")]))).toEqual(["PROGRAMACION_DESCUADRADA"])
    expect(codigos(valida(liveF_V1(), "REPROGRAMACION", [celda("R12|2027-01", "6000000", "5000000"), celda("R12|2027-02", "0", "1000000")]))).toContain("PERIODO_FUERA_DE_RANGO")
  })

  it("rejects elements that the tipo does not allow", () => {
    const errores = valida(liveF_V1(), "REPROGRAMACION", [presupuesto("R12", "24000000", "25000000")])
    expect(codigos(errores)).toEqual(["ELEMENTO_NO_PERMITIDO"])
    expect(errores[0]!.mensaje).toBe("El elemento «presupuesto» no se permite en una modificación de tipo REPROGRAMACION.")
    expect(codigos(valida(liveF_V1(), "CRONOGRAMA", [celda("R12|2027-01", "6000000", "5000000")]))).toEqual(["ELEMENTO_NO_PERMITIDO"])
  })

  it("rejects an `antes` that no longer matches the live value", () => {
    const errores = valida(liveF_V1(), "TRASLADO", [presupuesto("R12", "24000001", "23000000"), presupuesto("R13", "12800000", "13800001")])
    expect(codigos(errores)).toEqual(["ANTES_DESACTUALIZADO"])
    expect(errores[0]!.mensaje).toBe("El valor actual de «R12» cambió; recarga e inténtalo de nuevo.")
  })

  it("rejects unknown elements, malformed values and repeated items", () => {
    expect(codigos(valida(liveF_V1(), "CRONOGRAMA", [{ elemento: "actividad", clave: "9.9", campo: "semana_fin", antes: "1", despues: "2" }]))).toEqual(["ELEMENTO_INEXISTENTE"])
    expect(codigos(valida(liveF_V1(), "ADICION", [presupuesto("R12", "24000000", "mucho")]))).toEqual(["VALOR_INVALIDO"])
    expect(codigos(valida(liveF_V1(), "ADICION", [presupuesto("R12", "24000000", "-5")]))).toEqual(["VALOR_INVALIDO"])
    expect(codigos(valida(liveF_V1(), "REPROGRAMACION", [celda("R12|2027-01", "6000000", "5000000"), celda("R12|2027-01", "6000000", "5000000")]))).toContain("DETALLE_DUPLICADO")
    expect(codigos(valida(liveF_V1(), "REPROGRAMACION", []))).toEqual(["DETALLE_VACIO"])
  })

  it("validates the CRONOGRAMA weeks against the (possibly new) duration", () => {
    const duracion = 17 // 2026-10-05..2027-01-29
    const fin = { elemento: "actividad" as const, clave: "1.4", campo: "semana_fin", antes: "6", despues: String(duracion + 1) }
    expect(codigos(valida(liveF_V1(), "CRONOGRAMA", [fin]))).toEqual(["SEMANAS_INVALIDAS"])
    expect(valida(liveF_V1(), "CRONOGRAMA", [{ ...fin, despues: String(duracion) }])).toEqual([])
    const inicioMayor = { elemento: "actividad" as const, clave: "1.4", campo: "semana_inicio", antes: "3", despues: "7" }
    expect(codigos(valida(liveF_V1(), "CRONOGRAMA", [inicioMayor]))).toEqual(["SEMANAS_INVALIDAS"])
  })

  it("keeps the programming inside the range when the project dates change", () => {
    const acortar = { elemento: "proyecto" as const, clave: "proyecto", campo: "fecha_fin", antes: "2027-01-29", despues: "2026-12-18" }
    expect(codigos(valida(liveF_V1(), "CRONOGRAMA", [acortar]))).toContain("PERIODO_FUERA_DE_RANGO")
    const invertida = { ...acortar, despues: "2026-09-01" }
    expect(codigos(valida(liveF_V1(), "CRONOGRAMA", [invertida]))).toContain("FECHAS_INVALIDAS")
    // V-03 strict (PO-4): an end equal to the start is not a valid range either.
    const igual = { ...acortar, despues: "2026-10-05" }
    expect(codigos(valida(liveF_V1(), "CRONOGRAMA", [igual]))).toContain("FECHAS_INVALIDAS")
  })

  it("validates ENTREGABLES quantities", () => {
    const ok = { elemento: "entregable" as const, clave: "1.4-E1", campo: "cantidad_meta", antes: "4", despues: "6" }
    expect(valida(liveF_V1(), "ENTREGABLES", [ok])).toEqual([])
    expect(codigos(valida(liveF_V1(), "ENTREGABLES", [{ ...ok, despues: "0" }]))).toEqual(["VALOR_INVALIDO"])
    const meta = { elemento: "indicador" as const, clave: "IND-01", campo: "meta", antes: "30", despues: "40" }
    expect(valida(liveF_V1(), "ENTREGABLES", [meta])).toEqual([])
  })
})
