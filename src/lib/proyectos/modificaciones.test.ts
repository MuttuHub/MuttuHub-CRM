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

  it("a line created by a request carries its line key, as the live reader derives it for a legacy line (T10)", () => {
    // aplicarModificacion re-reads the project and compares snapshots: without the key the new line
    // never matches what was written and every ADICION with a new rubro is rolled back.
    const nuevo = applyModificacion(
      liveF_V1(),
      { tipo: "ADICION", detalle: [presupuesto("R20", "0", "100"), celda("R20|2026-10", "0", "100")] },
      new Map([["R20", "Imprevistos"]]),
    )
    expect(nuevo.presupuesto.find((r) => r.rubro_codigo === "R20")).toMatchObject({ codigo_linea: "R20" })
    expect(nuevo.programacion.find((c) => c.rubro_codigo === "R20")).toMatchObject({ codigo_linea: "R20" })
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

  it("rejects a TRASLADO that leaves the origin rubro below what it already executed (AJ-09)", () => {
    // R12 gives 1.000.000 to R13 (24M -> 23M) while it already has 23.500.000 validated.
    const errores = valida(liveF_V1(), "TRASLADO", traslado(), { ejecutado: new Map([["R12", toCents("23500000")]]) })
    expect(codigos(errores)).toEqual(["A_MENOR_QUE_EJECUTADO"])
    expect(errores[0]!.clave).toBe("R12")
    expect(errores[0]!.mensaje).toBe("El valor asignado de «R12» no puede quedar por debajo de lo ya ejecutado ($ 23.500.000).")
    // Leaving the origin exactly at its executed amount is allowed, and so is what the destination executed.
    const alLimite = new Map([["R12", toCents("23000000")], ["R13", toCents("13800000")]])
    expect(valida(liveF_V1(), "TRASLADO", traslado(), { ejecutado: alLimite })).toEqual([])
  })

  it("an overspent line the request does not lower never blocks it (AJ-08 lets it save, AJ-09 checks the origin)", () => {
    // R15 is overspent (assigned 320.000, executed 500.000), which AJ-08 allows with the critical alert.
    // An unrelated R12 → R13 traslado must still go through.
    const ejecutado = new Map([["R15", toCents("500000")]])
    expect(valida(liveF_V1(), "TRASLADO", traslado(), { ejecutado })).toEqual([])
  })

  it("a traslado into an overspent line is allowed even when it does not cover it all (it narrows the gap)", () => {
    // R13 executed 20.000.000 over 12.800.000; receiving 1.000.000 leaves it at 13.800.000, still below, but higher.
    const ejecutado = new Map([["R13", toCents("20000000")]])
    expect(valida(liveF_V1(), "TRASLADO", traslado(), { ejecutado })).toEqual([])
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

describe("claves de línea (T10): el detalle lee las dos formas", () => {
  // Una línea con actividad expone `codigo_linea` = `1.1|R12`; las solicitudes guardadas antes de la
  // Parte 2 siguen direccionando por `R12`. Mientras convivan, el validador tiene que entender las dos.
  // El aserto es sobre la resolución: `ANTES_DESACTUALIZADO` significa que la clave no encontró su fila
  // (o encontró otra), así que su ausencia prueba que resolvió.
  const liveConLinea = (): LiveProyecto => {
    const live = liveF_V1()
    return {
      ...live,
      presupuesto: live.presupuesto.map((r) => (r.rubro_codigo === "R12" ? { ...r, codigo_linea: "1.1|R12" } : r)),
      programacion: live.programacion.map((c) => (c.rubro_codigo === "R12" ? { ...c, codigo_linea: "1.1|R12" } : c)),
    }
  }
  const codigos = (errores: { codigo: string }[]) => errores.map((e) => e.codigo)

  it("resuelve el presupuesto por la clave nueva ACT|RUBRO, y falla con una clave inventada", () => {
    const live = liveConLinea()
    const fila = live.presupuesto.find((r) => r.codigo_linea === "1.1|R12")!
    const detalle = (clave: string): DetalleItem[] => [
      { elemento: "presupuesto", clave, campo: "asignado", antes: fila.asignado, despues: fila.asignado },
    ]
    expect(codigos(valida(live, "REDUCCION", detalle("1.1|R12")))).not.toContain("ANTES_DESACTUALIZADO")
    expect(codigos(valida(live, "REDUCCION", detalle("9.9|R99")))).toContain("ANTES_DESACTUALIZADO")
  })

  it("resuelve la programación por la clave nueva ACT|RUBRO|periodo, y falla con una clave inventada", () => {
    const live = liveConLinea()
    const celda = live.programacion.find((c) => c.codigo_linea === "1.1|R12")!
    const detalle = (clave: string): DetalleItem[] => [
      { elemento: "programacion", clave, campo: "valor", antes: celda.valor, despues: celda.valor },
    ]
    expect(codigos(valida(live, "REPROGRAMACION", detalle(`1.1|R12|${celda.periodo}`)))).not.toContain("ANTES_DESACTUALIZADO")
    expect(codigos(valida(live, "REPROGRAMACION", detalle(`9.9|R99|${celda.periodo}`)))).toContain("ANTES_DESACTUALIZADO")
  })

  it("sigue resolviendo la clave vieja R12 aunque la fila traiga codigo_linea", () => {
    const live = liveConLinea()
    const fila = live.presupuesto.find((r) => r.rubro_codigo === "R12")!
    const detalle: DetalleItem[] = [{ elemento: "presupuesto", clave: "R12", campo: "asignado", antes: fila.asignado, despues: fila.asignado }]
    expect(codigos(valida(live, "REDUCCION", detalle))).not.toContain("ANTES_DESACTUALIZADO")
  })
})

describe("modifications per budget line (T13 S5): a rubro with two activity lines", () => {
  // R12 (24M) split into two activity lines of 12M, 3M per month each: 1.1|R12 and 1.2|R12.
  const liveDosLineas = (): LiveProyecto => {
    const live = liveF_V1()
    const mitad = (valor: string) => String(toCents(valor) / BigInt(200))
    return {
      ...live,
      presupuesto: live.presupuesto.flatMap((r) =>
        r.rubro_codigo === "R12"
          ? ["1.1", "1.2"].map((act) => ({ ...r, codigo_linea: `${act}|R12`, asignado: mitad(r.asignado) }))
          : [{ ...r, codigo_linea: r.rubro_codigo }],
      ),
      programacion: live.programacion.flatMap((c) =>
        c.rubro_codigo === "R12"
          ? ["1.1", "1.2"].map((act) => ({ ...c, codigo_linea: `${act}|R12`, valor: mitad(c.valor) }))
          : [{ ...c, codigo_linea: c.rubro_codigo }],
      ),
    }
  }
  /** 2.000.000 from activity 1.1 to activity 1.2 of the same rubro, in January. */
  const entreActividades = (): DetalleItem[] => [
    presupuesto("1.1|R12", "12000000", "10000000"),
    presupuesto("1.2|R12", "12000000", "14000000"),
    celda("1.1|R12|2027-01", "3000000", "1000000"),
    celda("1.2|R12|2027-01", "3000000", "5000000"),
  ]
  const linea = (live: LiveProyecto, clave: string) => live.presupuesto.find((r) => r.codigo_linea === clave)
  const celdaDe = (live: LiveProyecto, clave: string, periodo: string) =>
    live.programacion.find((c) => c.codigo_linea === clave && c.periodo === periodo)

  it("a TRASLADO between the two activity lines of one rubro changes each line apart", () => {
    const live = liveDosLineas()
    expect(valida(live, "TRASLADO", entreActividades())).toEqual([])
    const despues = applyModificacion(live, { tipo: "TRASLADO", detalle: entreActividades() })
    expect(linea(despues, "1.1|R12")?.asignado).toBe("10000000.00")
    expect(linea(despues, "1.2|R12")?.asignado).toBe("14000000.00")
    expect(celdaDe(despues, "1.1|R12", "2027-01")).toMatchObject({ rubro_codigo: "R12", valor: "1000000.00" })
    expect(celdaDe(despues, "1.2|R12", "2027-01")).toMatchObject({ rubro_codigo: "R12", valor: "5000000.00" })
    expect(celdaDe(despues, "1.1|R12", "2026-12")?.valor).toBe("3000000")
    expect(despues.presupuesto.filter((r) => r.rubro_codigo === "R12")).toHaveLength(2)
  })

  it("the post-state control checks each line: a line whose programming no longer matches its A is rejected", () => {
    // The rubro still adds up (24M budget, 24M programmed) but each line is off by 2.000.000.
    const detalle = [presupuesto("1.1|R12", "12000000", "10000000"), presupuesto("1.2|R12", "12000000", "14000000")]
    const errores = valida(liveDosLineas(), "TRASLADO", detalle)
    expect(codigos(errores)).toEqual(["PROGRAMACION_DESCUADRADA", "PROGRAMACION_DESCUADRADA"])
    expect(errores.map((e) => e.clave)).toEqual(["1.1|R12", "1.2|R12"])
    expect(errores[0]!.mensaje).toContain("en la actividad 1.1")
  })

  it("a cell may be created in an existing activity line and keeps that line's rubro", () => {
    const live = liveDosLineas()
    live.programacion = live.programacion.filter((c) => !(c.codigo_linea === "1.2|R12" && c.periodo === "2027-01"))
    live.presupuesto = live.presupuesto.map((r) => (r.codigo_linea === "1.2|R12" ? { ...r, asignado: "9000000" } : r))
    const detalle = [presupuesto("1.2|R12", "9000000", "11000000"), presupuesto("1.1|R12", "12000000", "10000000"), celda("1.1|R12|2027-01", "3000000", "1000000"), celda("1.2|R12|2027-01", "0", "2000000")]
    const despues = applyModificacion(live, { tipo: "TRASLADO", detalle })
    expect(celdaDe(despues, "1.2|R12", "2027-01")).toEqual({ rubro_codigo: "R12", codigo_linea: "1.2|R12", periodo: "2027-01", valor: "2000000.00" })
  })

  it("an elapsed month of an activity line stays frozen (PERIODO_PASADO reads the line key)", () => {
    const detalle = [celda("1.1|R12|2026-10", "3000000", "2000000"), celda("1.1|R12|2026-11", "3000000", "4000000")]
    const errores = valida(liveDosLineas(), "REPROGRAMACION", detalle, { periodoActual: "2026-11", params: BLOQUEA })
    expect(codigos(errores)).toEqual(["PERIODO_PASADO"])
    expect(errores[0]!.clave).toBe("1.1|R12|2026-10")
    expect(errores[0]!.mensaje).toBe("El periodo 2026-10 ya transcurrió: no se puede reprogramar.")
  })

  it("the executed amount is checked per line (REQ-GAS-06)", () => {
    // 1.1|R12 already executed 11M: leaving it at 10M is refused although the rubro keeps 24M.
    const errores = valida(liveDosLineas(), "TRASLADO", entreActividades(), { ejecutado: new Map([["1.1|R12", toCents("11000000")]]) })
    expect(codigos(errores)).toEqual(["A_MENOR_QUE_EJECUTADO"])
    expect(errores[0]!.clave).toBe("1.1|R12")
  })

  it("a stored request with the old rubro key is refused, not misapplied, when the rubro has several lines", () => {
    const viejo = [presupuesto("R12", "24000000", "23000000"), presupuesto("R13", "12800000", "13800000"), celda("R12|2027-01", "6000000", "5000000"), celda("R13|2027-01", "3200000", "4200000")]
    const errores = valida(liveDosLineas(), "TRASLADO", viejo)
    expect(codigos(errores)).toEqual(["CLAVE_AMBIGUA", "CLAVE_AMBIGUA"])
    expect(errores.map((e) => e.clave)).toEqual(["R12", "R12|2027-01"])
    expect(errores[0]!.mensaje).toBe(
      "El rubro «R12» tiene varias líneas (una por actividad): la solicitud debe indicar la actividad. Vuelve a crearla.",
    )
  })

  it("a stored request with the old rubro key still applies to the rubro's only line", () => {
    const live = liveDosLineas()
    const viejo = [presupuesto("R13", "12800000", "11800000"), presupuesto("1.1|R12", "12000000", "13000000"), celda("R13|2027-01", "3200000", "2200000"), celda("1.1|R12|2027-01", "3000000", "4000000")]
    expect(valida(live, "TRASLADO", viejo)).toEqual([])
    const despues = applyModificacion(live, { tipo: "TRASLADO", detalle: viejo })
    expect(linea(despues, "R13")?.asignado).toBe("11800000.00")
    expect(celdaDe(despues, "R13", "2027-01")?.valor).toBe("2200000.00")
    expect(despues.presupuesto.filter((r) => r.rubro_codigo === "R13")).toHaveLength(1)
  })

  it("the old and the new key of the same line in one request are a repeated change", () => {
    const live = liveDosLineas()
    const repetido = [presupuesto("R13", "12800000", "11800000"), presupuesto("R13", "12800000", "11800000")]
    expect(codigos(valida(live, "REDUCCION", repetido))).toEqual(["DETALLE_DUPLICADO"])
  })
})
