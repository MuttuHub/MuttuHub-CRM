// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import { construirPlan } from "./mapear"
import { generarPlantilla } from "./generate"
import { parsePlantilla } from "./parse"
import { toCents } from "../money"
import { fixtureContextoFX1, fixtureF_X1 } from "../__fixtures__/plantilla-cedetextil"

let bufferValido: Buffer

beforeAll(async () => {
  bufferValido = await generarPlantilla(fixtureF_X1())
})

async function plan() {
  return construirPlan(await parsePlantilla(bufferValido), fixtureContextoFX1())
}

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

  it("derives the default activity weights 1/1/1/4", async () => {
    const p = await plan()
    expect(p.actividades.map((a) => Number(a.peso))).toEqual([1, 1, 1, 4])
    expect(p.actividades.every((a) => a.pesoManual === false)).toBe(true)
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
      tipoMedio: "Documento PDF",
    })
    expect(p.indicadores[0]).toMatchObject({
      codigo: "IND-01",
      objetivoCodigo: "OE1",
      meta: "30.00",
      unidad: "Unidades",
      lineaBase: "0.00",
    })
  })

  it("fills every active rubro and the monthly programming in exact cents", async () => {
    const p = await plan()
    expect(p.presupuesto).toHaveLength(15)
    expect(p.presupuesto.find((r) => r.rubroCodigo === "R01")?.cents).toBe(toCents("59500000"))
    expect(p.presupuesto.find((r) => r.rubroCodigo === "R02")?.cents).toBe(toCents("0"))
    expect(p.programacion).toHaveLength(8 * 4)
    const r01oct = p.programacion.find((c) => c.rubroCodigo === "R01" && c.periodo === "2026-10")
    expect(r01oct?.cents).toBe(toCents("14875000"))
  })

  it("marks an explicit weight as manual", async () => {
    const input = fixtureF_X1()
    input.estructura.actividades[0].peso = "2.5"
    const parsed = await parsePlantilla(await generarPlantilla(input))
    const p = construirPlan(parsed, fixtureContextoFX1())
    expect(p.actividades[0].pesoManual).toBe(true)
    expect(p.actividades[0].peso).toBe("2.50")
  })
})
