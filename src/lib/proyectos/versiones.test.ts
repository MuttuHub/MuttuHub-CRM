import { describe, expect, it } from "vitest"
import { buildSnapshot, diffSnapshots, type LiveProyecto } from "./versiones"
import { liveF_V1, liveMini } from "./__fixtures__/versiones"

const clone = (live: LiveProyecto): LiveProyecto => structuredClone(live)

describe("buildSnapshot", () => {
  it("contains exactly the baseline elements and no execution data", () => {
    const snapshot = buildSnapshot(liveF_V1())
    expect(Object.keys(snapshot).sort()).toEqual(
      ["actividades", "entregables", "indicadores", "presupuesto", "programacion", "proyecto", "schema"],
    )
    expect(snapshot.schema).toBe(1)
    expect(Object.keys(snapshot.proyecto).sort()).toEqual(
      ["beneficiarios_meta", "fecha_fin", "fecha_inicio", "valor_total"],
    )
    expect(snapshot.presupuesto).toHaveLength(8)
    expect(snapshot.programacion).toHaveLength(32)
    expect(snapshot.actividades.map((a) => [a.codigo, a.peso])).toEqual([
      ["1.1", "1"],
      ["1.2", "1"],
      ["1.3", "1"],
      ["1.4", "4"],
    ])
    expect(snapshot.entregables).toHaveLength(7)
    expect(JSON.stringify(snapshot)).not.toMatch(/avance|gasto|ejecut|valid/i)
  })

  it("orders every list deterministically whatever the input order", () => {
    const sorted = buildSnapshot(liveF_V1())
    const live = liveF_V1()
    live.presupuesto.reverse()
    live.programacion.reverse()
    live.actividades.reverse()
    live.entregables.reverse()
    live.indicadores.reverse()
    expect(JSON.stringify(buildSnapshot(live))).toBe(JSON.stringify(sorted))
    expect(sorted.presupuesto.map((r) => r.rubro_codigo)).toEqual(
      ["R01", "R04", "R06", "R08", "R11", "R12", "R13", "R15"],
    )
    expect(sorted.programacion.slice(0, 5).map((c) => `${c.rubro_codigo}|${c.periodo}`)).toEqual([
      "R01|2026-10",
      "R01|2026-11",
      "R01|2026-12",
      "R01|2027-01",
      "R04|2026-10",
    ])
  })

  it("is byte-stable: the mini project serializes to a frozen literal", () => {
    expect(JSON.stringify(buildSnapshot(liveMini()))).toBe(
      '{"schema":1,"proyecto":{"valor_total":"300.00","fecha_inicio":"2026-10-05","fecha_fin":"2026-11-27","beneficiarios_meta":null},' +
        '"presupuesto":[{"rubro_codigo":"R01","rubro_nombre":"Personal","asignado":"199.50"},{"rubro_codigo":"R12","rubro_nombre":"Transporte","asignado":"100.50"}],' +
        '"programacion":[{"rubro_codigo":"R01","periodo":"2026-10","valor":"99.50"},{"rubro_codigo":"R01","periodo":"2026-11","valor":"100.00"},' +
        '{"rubro_codigo":"R12","periodo":"2026-10","valor":"50.25"},{"rubro_codigo":"R12","periodo":"2026-11","valor":"50.25"}],' +
        '"actividades":[{"codigo":"1.1","objetivo_codigo":"OE1","nombre":"A","semana_inicio":1,"semana_fin":2,"peso":"2","peso_manual":false}],' +
        '"entregables":[],' +
        '"indicadores":[{"codigo":"IND-01","objetivo_codigo":"OE1","nombre":"I","meta":"10.5","unidad":"u","linea_base":null}]}',
    )
  })

  it("does not mutate its input", () => {
    const live = liveF_V1()
    const before = JSON.stringify(live)
    buildSnapshot(live)
    expect(JSON.stringify(live)).toBe(before)
  })

  it("throws when a funded line has no rubro code", () => {
    const live = liveMini()
    live.presupuesto[0] = { rubro_codigo: null, rubro_nombre: "Legado", asignado: "10" }
    expect(() => buildSnapshot(live)).toThrow(/código/)
  })

  it("throws when a programming cell has no rubro code", () => {
    const live = liveMini()
    live.programacion[0] = { rubro_codigo: null, periodo: "2026-10", valor: "1" }
    expect(() => buildSnapshot(live)).toThrow(/código/)
  })
})

describe("diffSnapshots", () => {
  const base = () => buildSnapshot(liveF_V1())

  it("returns [] for identical snapshots", () => {
    expect(diffSnapshots(base(), buildSnapshot(liveF_V1()))).toEqual([])
  })

  it("lists a changed budget line and its programming cells", () => {
    const live = clone(liveF_V1())
    live.presupuesto.find((r) => r.rubro_codigo === "R12")!.asignado = "23000000"
    live.presupuesto.find((r) => r.rubro_codigo === "R13")!.asignado = "13800000"
    live.programacion.find((c) => c.rubro_codigo === "R12" && c.periodo === "2026-12")!.valor = "5000000"
    const diff = diffSnapshots(base(), buildSnapshot(live))
    expect(diff).toEqual([
      { elemento: "presupuesto", clave: "R12", campo: "asignado", desde: "24000000.00", hasta: "23000000.00" },
      { elemento: "presupuesto", clave: "R13", campo: "asignado", desde: "12800000.00", hasta: "13800000.00" },
      { elemento: "programacion", clave: "R12|2026-12", campo: "valor", desde: "6000000.00", hasta: "5000000.00" },
    ])
  })

  it("lists changed project fields, weeks, weights and quantities", () => {
    const live = clone(liveF_V1())
    live.proyecto.fecha_fin = "2027-02-26"
    live.proyecto.valor_total = "177360001"
    const a14 = live.actividades.find((a) => a.codigo === "1.4")!
    a14.semana_fin = 7
    a14.peso = "5"
    live.entregables.find((e) => e.codigo === "1.3-E1")!.cantidad_meta = "6"
    live.indicadores.find((i) => i.codigo === "IND-02")!.meta = "75"
    expect(diffSnapshots(base(), buildSnapshot(live))).toEqual([
      { elemento: "proyecto", clave: "proyecto", campo: "valor_total", desde: "177360000.00", hasta: "177360001.00" },
      { elemento: "proyecto", clave: "proyecto", campo: "fecha_fin", desde: "2027-01-29", hasta: "2027-02-26" },
      { elemento: "actividad", clave: "1.4", campo: "semana_fin", desde: "6", hasta: "7" },
      { elemento: "actividad", clave: "1.4", campo: "peso", desde: "4", hasta: "5" },
      { elemento: "entregable", clave: "1.3-E1", campo: "cantidad_meta", desde: "4", hasta: "6" },
      { elemento: "indicador", clave: "IND-02", campo: "meta", desde: "60", hasta: "75" },
    ])
  })

  it("reports additions and removals as existencia", () => {
    const live = clone(liveF_V1())
    live.presupuesto = live.presupuesto.filter((r) => r.rubro_codigo !== "R15")
    live.programacion = live.programacion.filter((c) => c.rubro_codigo !== "R15")
    live.presupuesto.push({ rubro_codigo: "R14", rubro_nombre: "Otros", asignado: "1" })
    const diff = diffSnapshots(base(), buildSnapshot(live))
    expect(diff.filter((d) => d.campo === "existencia")).toEqual([
      { elemento: "presupuesto", clave: "R14", campo: "existencia", desde: null, hasta: "presente" },
      { elemento: "presupuesto", clave: "R15", campo: "existencia", desde: "presente", hasta: null },
      { elemento: "programacion", clave: "R15|2026-10", campo: "existencia", desde: "presente", hasta: null },
      { elemento: "programacion", clave: "R15|2026-11", campo: "existencia", desde: "presente", hasta: null },
      { elemento: "programacion", clave: "R15|2026-12", campo: "existencia", desde: "presente", hasta: null },
      { elemento: "programacion", clave: "R15|2027-01", campo: "existencia", desde: "presente", hasta: null },
    ])
  })

  it("orders by element, then key, then field", () => {
    const live = clone(liveF_V1())
    live.indicadores[0].meta = "1"
    live.proyecto.fecha_inicio = "2026-10-12"
    live.actividades.find((a) => a.codigo === "1.1")!.nombre = "Otro"
    const elementos = diffSnapshots(base(), buildSnapshot(live)).map((d) => d.elemento)
    expect(elementos).toEqual(["proyecto", "actividad", "indicador"])
  })
})
