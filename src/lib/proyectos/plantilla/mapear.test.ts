// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import { construirPlan } from "./mapear"
import { generarPlantilla } from "./generate"
import { parsePlantilla } from "./parse"
import ExcelJS from "exceljs"
import { toCents } from "../money"
import { HOJAS } from "./columns"
import { F_X1_LINEAS, fixtureContextoFX1, fixtureF_X1, plantillaFormatoAnterior } from "../__fixtures__/plantilla-cedetextil"

let bufferValido: Buffer

beforeAll(async () => {
  bufferValido = await generarPlantilla(fixtureF_X1())
})

/** Appends the «Peso (opcional)» column the old layout had, with a value the rule must ignore. */
async function conColumnaPeso(buffer: Buffer): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const hoja = workbook.getWorksheet(HOJAS.actividades)
  if (!hoja) throw new Error("Missing sheet Actividades")
  const columna = (hoja.actualColumnCount ?? 0) + 1
  hoja.getCell(1, columna).value = "Peso (opcional)"
  for (let fila = 2; fila <= hoja.actualRowCount; fila++) hoja.getCell(fila, columna).value = "2,5"
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

async function plan() {
  return construirPlan(await parsePlantilla(bufferValido), fixtureContextoFX1())
}

describe("construirPlan project total", () => {
  it("takes the budget sum when the template total differs (PO feedback 2026-10-23)", async () => {
    const p = construirPlan(await parsePlantilla(await generarPlantilla(fixtureF_X1("v12"))), fixtureContextoFX1())
    expect(p.proyecto.valorTotalCents).toBe(toCents("177360000"))
  })

  it("takes the sum of the lines, never the typed total (S2)", async () => {
    const parsed = await parsePlantilla(bufferValido)
    parsed.presupuesto[0].celdas["Valor"].valor = 1000
    parsed.proyecto.valorTotal.valor = 999
    expect(construirPlan(parsed, fixtureContextoFX1()).proyecto.valorTotalCents).toBe(
      toCents("177360000") - toCents("59500000") + toCents("1000"),
    )
  })
})

describe("construirPlan of the valid F-X1", () => {
  it("maps the project identity, total and beneficiaries", async () => {
    const p = await plan()
    expect(p.proyecto.fechaInicio).toBe("2026-10-05")
    expect(p.proyecto.fechaFin).toBe("2027-01-29")
    expect(p.proyecto.valorTotalCents).toBe(toCents("177360000"))
    expect(p.proyecto.beneficiariosMeta).toBe(500)
    expect(p.proyecto.lineas).toEqual([
      { id: "linea-LE03", principal: true },
      { id: "linea-LE02", principal: false },
    ])
    expect(p.proyecto.municipioIds).toEqual(["municipio-23001", "municipio-23162"])
  })

  it("maps one objective, four activities, seven deliverables and two indicators", async () => {
    const p = await plan()
    expect(p.objetivos).toHaveLength(1)
    expect(p.objetivos[0]).toMatchObject({ codigo: "OE1", orden: 1 })
    expect(p.objetivos[0].descripcion).toContain("capacidades productivas")
    expect(p.actividades).toHaveLength(4)
    expect(p.entregables).toHaveLength(7)
    expect(p.indicadores).toHaveLength(2)
  })

  it("carries no weight: it is derived from the weeks wherever it is needed (AJ-02)", async () => {
    const p = await plan()
    expect(p.actividades).toHaveLength(4)
    for (const actividad of p.actividades) {
      expect(actividad).not.toHaveProperty("peso")
      expect(actividad).not.toHaveProperty("pesoManual")
    }
  })

  it("resolves the responsable and the cross references", async () => {
    const p = await plan()
    expect(p.actividades[0]).toMatchObject({
      codigo: "1.1",
      objetivoCodigo: "OE1",
      semanaInicio: 1,
      semanaFin: 1,
      responsableId: "usuario-ana",
    })
    expect(p.entregables[0]).toMatchObject({
      codigo: "1.1-E1",
      actividadCodigo: "1.1",
      cantidadMeta: "1.00",
      unidad: "Informe",
      tipoMedio: "",
    })
    expect(p.indicadores[0]).toMatchObject({
      codigo: "IND-01",
      objetivoCodigo: "OE1",
      meta: "30.00",
      unidad: "",
      lineaBase: "0.00",
    })
  })

  it("keeps the medium and the indicator unit of a template in the previous layout", async () => {
    const anterior = await plantillaFormatoAnterior(await generarPlantilla(fixtureF_X1()))
    const p = construirPlan(await parsePlantilla(anterior), fixtureContextoFX1())
    expect(p.entregables[0]).toMatchObject({ codigo: "1.1-E1", unidad: "Informe", tipoMedio: "Documento PDF" })
    expect(p.indicadores[0]).toMatchObject({ codigo: "IND-01", unidad: "Unidades", lineaBase: "0.00" })
  })

  it("plans one line per sheet row: activity, rubro code and exact cents, with no programming (S3, S4)", async () => {
    const p = await plan()
    expect(p.presupuesto).toEqual(
      F_X1_LINEAS.map((l) => ({ actividadCodigo: l.actividadCodigo, rubroCodigo: l.rubroCodigo, cents: toCents(l.valor) })),
    )
    // S6: one activity with two rubros keeps both lines.
    expect(p.presupuesto.filter((l) => l.actividadCodigo === "1.2").map((l) => l.rubroCodigo)).toEqual(["R08", "R12"])
    expect(p).not.toHaveProperty("programacion")
  })

  it("reads a bare rubro code as well as the «código - nombre» dropdown text", async () => {
    const parsed = await parsePlantilla(bufferValido)
    parsed.presupuesto[0].celdas["Rubro"].valor = "R01"
    expect(construirPlan(parsed, fixtureContextoFX1()).presupuesto[0]).toMatchObject({ actividadCodigo: "1.1", rubroCodigo: "R01" })
  })

  it("ignores a «Peso (opcional)» column still present in a template filled with the previous layout", async () => {
    // AJ-02 removed the column from the sheet the system downloads; a file already filled in with
    // the older layout keeps importing, and its weight cells no longer reach the plan.
    const anterior = await conColumnaPeso(await generarPlantilla(fixtureF_X1()))
    const p = construirPlan(await parsePlantilla(anterior), fixtureContextoFX1())

    expect(p.actividades).toHaveLength(4)
    expect(p.actividades[0]).not.toHaveProperty("peso")
    expect(p.actividades[0]).toMatchObject({ codigo: "1.1", semanaInicio: 1, semanaFin: 1 })
  })

  it("rejects a scientific-notation total with a domain error, not a RangeError", async () => {
    const parsed = await parsePlantilla(bufferValido)
    parsed.proyecto.valorTotal.valor = 1e21
    expect(() => construirPlan(parsed, fixtureContextoFX1())).toThrow(
      "La plantilla no tiene valor total o meta de beneficiarios válidos.",
    )
  })
})
