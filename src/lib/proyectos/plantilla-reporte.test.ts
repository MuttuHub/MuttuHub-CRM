// @vitest-environment node
import { describe, expect, it } from "vitest"
import { agruparPorHoja, reporteACsv, type ReportePlantilla } from "./plantilla-reporte"

const error = (regla: string, hoja: string, fila: number | null, mensaje: string, valor: string | null = null) => ({
  regla,
  hoja,
  fila,
  columna: fila === null ? null : "C",
  valor,
  mensaje,
})

const REPORTE: ReportePlantilla = {
  errores: [
    error("V-07", "4. Actividades", 5, "La semana fin supera la duración.", "19"),
    error("V-12", "7. Presupuesto", null, "La suma no coincide con el valor total."),
    error("V-05", "4. Actividades", 3, "Código duplicado."),
  ],
  advertencias: [error("W-01", "4. Actividades", 2, "No encontramos al responsable.", "x@y.co")],
  resumen: { "V-07": 1, "V-12": 1, "V-05": 1, "W-01": 1 },
  truncado: false,
}

describe("agruparPorHoja", () => {
  it("groups the errors by sheet, keeping the order of first appearance", () => {
    const grupos = agruparPorHoja(REPORTE.errores)
    expect(grupos.map((g) => g.hoja)).toEqual(["4. Actividades", "7. Presupuesto"])
    expect(grupos[0]?.errores.map((e) => e.regla)).toEqual(["V-07", "V-05"])
  })

  it("returns no groups for an empty list", () => {
    expect(agruparPorHoja([])).toEqual([])
  })
})

describe("reporteACsv", () => {
  it("writes a BOM, a semicolon header and one row per error then per warning", () => {
    const csv = reporteACsv(REPORTE)
    const lineas = csv.replace("﻿", "").split("\r\n")
    expect(csv.startsWith("﻿")).toBe(true)
    expect(lineas[0]).toBe("Tipo;Regla;Hoja;Fila;Columna;Valor;Mensaje")
    expect(lineas).toHaveLength(1 + 3 + 1)
    expect(lineas[1]).toBe("Error;V-07;4. Actividades;5;C;19;La semana fin supera la duración.")
    expect(lineas[2]).toBe("Error;V-12;7. Presupuesto;;;;La suma no coincide con el valor total.")
    expect(lineas[4]).toBe("Advertencia;W-01;4. Actividades;2;C;x@y.co;No encontramos al responsable.")
  })

  it("quotes cells with separators, quotes or line breaks", () => {
    const csv = reporteACsv({
      ...REPORTE,
      errores: [error("V-09", "5. Entregables", 4, 'Dice "no"; y\nsigue', "1;2")],
      advertencias: [],
    })
    expect(csv).toContain('Error;V-09;5. Entregables;4;C;"1;2";"Dice ""no""; y\nsigue"')
  })

  it("neutralizes spreadsheet formulas coming from user cells", () => {
    const csv = reporteACsv({
      ...REPORTE,
      errores: [error("V-01", "2. Proyecto", 2, "Valor no válido.", "=HYPERLINK(\"http://x\")")],
      advertencias: [],
    })
    expect(csv).toContain(';"\'=HYPERLINK(')
    expect(csv).not.toMatch(/;"?=HYPERLINK/)
  })
})
