// "Requiere atención" (S14 P5): one derived, server-owned list per project. These tests pin every
// rule (rubro sobreejecución, actividad atrasada D3, avance sin soporte, indicador bajo meta, alerta
// de retraso, gasto observado D5) and the Spanish copy the client only renders.

import { describe, expect, it } from "vitest"
import { toCents } from "./money"
import { construirAtencion, type AtencionInput, type AtencionItem } from "./atencion"

const CORTE = "2026-03-31"

const avance = (fecha: string, cantidad: number, tieneMedio = true) => ({
  fecha,
  cantidad,
  anulado: false,
  tieneMedio,
  createdAt: `${fecha}T12:00:00.000Z`,
})

function input(over: Partial<AtencionInput> = {}): AtencionInput {
  return {
    corte: CORTE,
    alerta_retraso: false,
    requiere_medio: false,
    actividades: [],
    avances: [],
    indicadores: [],
    rubros: [],
    gastos: [],
    ...over,
  }
}

const tipos = (items: readonly AtencionItem[]) => items.map((item) => item.tipo)

describe("construirAtencion", () => {
  it("empty input yields no items", () => {
    expect(construirAtencion(input())).toEqual([])
  })

  describe("rubro_sobreejecucion", () => {
    const rubro = (asignado: string, ejecutado: string) => ({
      rubro_id: "r1",
      codigo: "R-01",
      nombre: "Materiales",
      asignado: toCents(asignado),
      ejecutado: toCents(ejecutado),
    })

    it("flags a line whose executed amount exceeds its assigned amount", () => {
      const items = construirAtencion(input({ rubros: [rubro("1000", "1500")] }))
      expect(tipos(items)).toEqual(["rubro_sobreejecucion"])
      expect(items[0]).toMatchObject({ rubro_id: "r1", titulo: "Rubro sobreejecutado" })
      expect(items[0].detalle).toContain("$ 1.500")
    })

    it("does not flag equal or under execution", () => {
      expect(construirAtencion(input({ rubros: [rubro("1000", "1000")] }))).toEqual([])
      expect(construirAtencion(input({ rubros: [rubro("1000", "400")] }))).toEqual([])
    })
  })

  describe("actividad_atrasada (D3)", () => {
    const actividad = (id: string, fin: string, cantidad: number, meta = 10) => ({
      id,
      codigo: id,
      nombre: `Actividad ${id}`,
      peso: 1,
      inicio: "2026-01-01",
      fin,
      entregables: [{ id: `${id}-e`, meta, avances: [avance("2026-02-01", cantidad)] }],
    })

    it("flags an activity due by the corte and below 100 %", () => {
      const items = construirAtencion(input({ actividades: [actividad("a1", "2026-02-28", 5)] }))
      expect(tipos(items)).toEqual(["actividad_atrasada"])
      expect(items[0]).toMatchObject({ actividad_id: "a1", titulo: "Actividad atrasada" })
      expect(items[0].detalle).toContain("50 %")
    })

    it("ignores an activity due after the corte and one already finished", () => {
      expect(construirAtencion(input({ actividades: [actividad("a1", "2026-04-30", 5)] }))).toEqual([])
      expect(construirAtencion(input({ actividades: [actividad("a1", "2026-02-28", 10)] }))).toEqual([])
    })
  })

  describe("avance_sin_soporte", () => {
    it("flags a live avance without a support", () => {
      const items = construirAtencion(
        input({ avances: [{ id: "av1", entregable_id: "e1", fecha: "2026-02-10", tiene_soporte: false }] }),
      )
      expect(tipos(items)).toEqual(["avance_sin_soporte"])
      expect(items[0]).toMatchObject({ avance_id: "av1", titulo: "Avance sin soporte" })
    })

    it("writes the avance date as a readable calendar date, never ISO", () => {
      const items = construirAtencion(
        input({ avances: [{ id: "av1", entregable_id: "e1", fecha: "2026-02-10", tiene_soporte: false }] }),
      )
      expect(items[0].detalle).toMatch(/^Avance del 10 (de )?feb(\.)?( de)? 2026 sin soporte adjunto\.$/)
      expect(items[0].detalle).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    })

    it("ignores an avance with a support", () => {
      const items = construirAtencion(
        input({ avances: [{ id: "av1", entregable_id: "e1", fecha: "2026-02-10", tiene_soporte: true }] }),
      )
      expect(items).toEqual([])
    })
  })

  describe("indicador_bajo_meta", () => {
    const med = (fecha: string, valor: number) => ({ fecha, valor, anulado: false })

    it("flags an indicator whose last measurement at the corte is below its goal", () => {
      const items = construirAtencion(
        input({ indicadores: [{ id: "i1", nombre: "Cobertura", meta: 100, mediciones: [med("2026-02-01", 40)] }] }),
      )
      expect(tipos(items)).toEqual(["indicador_bajo_meta"])
      expect(items[0]).toMatchObject({ indicador_id: "i1", titulo: "Indicador bajo la meta" })
    })

    it("ignores one that reached the goal or has no measurement at the corte", () => {
      expect(
        construirAtencion(input({ indicadores: [{ id: "i1", nombre: "X", meta: 100, mediciones: [med("2026-02-01", 100)] }] })),
      ).toEqual([])
      expect(
        construirAtencion(input({ indicadores: [{ id: "i1", nombre: "X", meta: 100, mediciones: [] }] })),
      ).toEqual([])
      expect(
        construirAtencion(input({ indicadores: [{ id: "i1", nombre: "X", meta: 100, mediciones: [med("2026-05-01", 10)] }] })),
      ).toEqual([])
    })
  })

  describe("alerta_retraso", () => {
    it("emits one item when the server flagged the financial delay", () => {
      const items = construirAtencion(input({ alerta_retraso: true }))
      expect(tipos(items)).toEqual(["alerta_retraso"])
      expect(items[0].titulo).toBe("Posible retraso")
    })
  })

  describe("gasto_observado (D5)", () => {
    const gasto = (over: Partial<Parameters<typeof construirAtencion>[0]["gastos"][number]> = {}) => ({
      id: "g1",
      estado: "REGISTRADO" as const,
      alerta_sobregasto: false,
      datos_incompletos: false,
      descripcion: "Compra de insumos",
      ...over,
    })

    it("flags a REGISTRADO expense with the overspend alert or incomplete data", () => {
      expect(tipos(construirAtencion(input({ gastos: [gasto({ alerta_sobregasto: true })] })))).toEqual(["gasto_observado"])
      expect(tipos(construirAtencion(input({ gastos: [gasto({ datos_incompletos: true })] })))).toEqual(["gasto_observado"])
    })

    it("does not leave a '.:' when the description already ends with a period", () => {
      const [item] = construirAtencion(input({ gastos: [gasto({ alerta_sobregasto: true, descripcion: "Compra de insumos." })] }))
      expect(item.detalle).toBe("Compra de insumos: supera lo asignado al rubro.")
      expect(item.detalle).not.toContain(".:")
    })

    it("ignores validated, rejected or voided expenses, and a clean REGISTRADO", () => {
      expect(construirAtencion(input({ gastos: [gasto()] }))).toEqual([])
      expect(construirAtencion(input({ gastos: [gasto({ estado: "VALIDADO", alerta_sobregasto: true })] }))).toEqual([])
      expect(construirAtencion(input({ gastos: [gasto({ estado: "ANULADO", datos_incompletos: true })] }))).toEqual([])
    })
  })

  it("groups every rule in one list with stable Spanish titles", () => {
    const items = construirAtencion(
      input({
        alerta_retraso: true,
        rubros: [{ rubro_id: "r1", codigo: "R-01", nombre: "Materiales", asignado: toCents("10"), ejecutado: toCents("20") }],
        gastos: [{ id: "g1", estado: "REGISTRADO", alerta_sobregasto: true, datos_incompletos: false, descripcion: "Compra" }],
      }),
    )
    expect(tipos(items)).toEqual(["alerta_retraso", "rubro_sobreejecucion", "gasto_observado"])
    for (const item of items) {
      expect(item.titulo.length).toBeGreaterThan(0)
      expect(item.detalle.length).toBeGreaterThan(0)
    }
  })
})
