import { describe, expect, it } from "vitest"

import { camposPermitidos, construirDetalle, type CampoEditable } from "./modificacion-detalle"

const presupuesto = (clave: string, antes: string, valor: string): CampoEditable => ({ elemento: "presupuesto", clave, campo: "asignado", antes, valor })
const celda = (clave: string, antes: string, valor: string): CampoEditable => ({ elemento: "programacion", clave, campo: "valor", antes, valor })

describe("construirDetalle", () => {
  it("keeps only the fields the person changed, with the value they saw as `antes`", () => {
    const detalle = construirDetalle("TRASLADO", [
      presupuesto("R12", "24000000.00", "23000000"),
      presupuesto("R13", "12800000.00", "12800000"), // same amount written differently: not a change
      celda("R12|2027-01", "6000000.00", "5000000"),
      celda("R13|2027-01", "3200000.00", ""), // untouched input
    ])
    expect(detalle).toEqual([
      { elemento: "presupuesto", clave: "R12", campo: "asignado", antes: "24000000.00", despues: "23000000" },
      { elemento: "programacion", clave: "R12|2027-01", campo: "valor", antes: "6000000.00", despues: "5000000" },
    ])
  })

  it("treats 4 and 4.00 as the same quantity and trims the typed value", () => {
    const detalle = construirDetalle("ENTREGABLES", [
      { elemento: "entregable", clave: "1.4-E1", campo: "cantidad_meta", antes: "4.00", valor: " 4 " },
      { elemento: "entregable", clave: "1.4-E2", campo: "cantidad_meta", antes: "4.00", valor: " 6 " },
    ])
    expect(detalle).toEqual([{ elemento: "entregable", clave: "1.4-E2", campo: "cantidad_meta", antes: "4.00", despues: "6" }])
  })

  it("sends a value that is not a number as typed, so the API names the problem", () => {
    const detalle = construirDetalle("ADICION", [presupuesto("R12", "24000000.00", "mucho")])
    expect(detalle).toEqual([{ elemento: "presupuesto", clave: "R12", campo: "asignado", antes: "24000000.00", despues: "mucho" }])
  })

  it("compares dates and texts literally", () => {
    const detalle = construirDetalle("CRONOGRAMA", [
      { elemento: "proyecto", clave: "proyecto", campo: "fecha_fin", antes: "2027-01-29", valor: "2027-01-29" },
      { elemento: "proyecto", clave: "proyecto", campo: "fecha_inicio", antes: "2026-10-05", valor: "2026-10-12" },
    ])
    expect(detalle.map((d) => d.campo)).toEqual(["fecha_inicio"])
  })

  it("drops the fields the tipo does not allow (a REPROGRAMACION never changes A)", () => {
    const detalle = construirDetalle("REPROGRAMACION", [presupuesto("R12", "24000000.00", "1"), celda("R12|2027-01", "6000000.00", "5000000")])
    expect(detalle.map((d) => d.elemento)).toEqual(["programacion"])
  })
})

describe("camposPermitidos", () => {
  it("mirrors the server matrix of RF-28", () => {
    expect(camposPermitidos("TRASLADO")).toEqual({ presupuesto: ["asignado"], programacion: ["valor"] })
    expect(camposPermitidos("REPROGRAMACION")).toEqual({ programacion: ["valor"] })
    expect(Object.keys(camposPermitidos("CRONOGRAMA"))).toEqual(["proyecto", "actividad"])
    expect(Object.keys(camposPermitidos("ENTREGABLES"))).toEqual(["entregable", "indicador"])
  })
})
