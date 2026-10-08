// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import { v01, v02, v03, v04, v05, v06, v07, vH1, type ContextoValidacion } from "./validate"
import { generarPlantilla } from "./generate"
import { parsePlantilla, type Celda, type Fila, type ParsedTemplate } from "./parse"
import { HOJAS } from "./columns"
import { fixtureContextoFX1, fixtureF_X1 } from "../__fixtures__/plantilla-cedetextil"

let bufferValido: Buffer

beforeAll(async () => {
  bufferValido = await generarPlantilla(fixtureF_X1())
})

async function parsedValido(): Promise<ParsedTemplate> {
  return parsePlantilla(bufferValido)
}

function contexto(): ContextoValidacion {
  return fixtureContextoFX1()
}

/** A minimal parsed row keyed by its header text, for mutation-style tests. */
function fila(hoja: string, numero: number, celdas: Record<string, string | number | null>): Fila {
  const mapa: Record<string, Celda> = {}
  let columna = 0
  for (const [encabezado, valor] of Object.entries(celdas)) {
    columna += 1
    mapa[encabezado] = { hoja, fila: numero, columna: String.fromCharCode(64 + columna), valor }
  }
  return { fila: numero, celdas: mapa }
}

describe("V-01 structural", () => {
  it("accepts the generated F-X1", async () => {
    expect(v01(await parsedValido(), contexto())).toEqual([])
  })

  it("reports a missing sheet by name", async () => {
    const parsed = await parsedValido()
    parsed.hojasPresentes = parsed.hojasPresentes.filter((nombre) => nombre !== HOJAS.entregables)
    const errores = v01(parsed, contexto())
    expect(errores.some((e) => e.regla === "V-01" && e.hoja === HOJAS.entregables)).toBe(true)
  })

  it("reports a header mismatch with expected and found", async () => {
    const parsed = await parsedValido()
    parsed.encabezados.entregables = parsed.encabezados.entregables.map((h) =>
      h === "Cantidad" ? "Cant." : h,
    )
    const errores = v01(parsed, contexto())
    const error = errores.find((e) => e.regla === "V-01" && e.hoja === HOJAS.entregables && e.fila === 1)
    expect(error?.mensaje).toMatch(/Cantidad/)
    expect(error?.valor).toBe("cant.")
  })

  it("rejects an old PLANTILLA_VERSION", async () => {
    const parsed = await parsedValido()
    parsed.version = "2025.3"
    const errores = v01(parsed, contexto())
    expect(errores.some((e) => e.regla === "V-01" && e.hoja === HOJAS.instrucciones && e.fila === 2)).toBe(true)
  })
})

describe("V-02 project identity and state", () => {
  it("accepts the generated F-X1", async () => {
    expect(v02(await parsedValido(), contexto())).toEqual([])
  })

  it("rejects a code of another project", async () => {
    const parsed = await parsedValido()
    parsed.proyecto.codigo.valor = "PRY-2026-009"
    expect(v02(parsed, contexto()).some((e) => e.regla === "V-02" && e.fila === parsed.proyecto.codigo.fila)).toBe(true)
  })

  it("rejects a non-BORRADOR project", async () => {
    const ctx = contexto()
    ctx.proyecto.estado = "EN_EJECUCION"
    expect(v02(await parsedValido(), ctx).some((e) => e.regla === "V-02")).toBe(true)
  })
})

describe("V-03 project dates, value and beneficiaries", () => {
  it("accepts the generated F-X1", async () => {
    expect(v03(await parsedValido(), contexto())).toEqual([])
  })

  it("rejects inicio >= fin", async () => {
    const parsed = await parsedValido()
    parsed.proyecto.fechaInicio.valor = new Date(Date.UTC(2027, 1, 1))
    parsed.proyecto.fechaFin.valor = new Date(Date.UTC(2027, 0, 29))
    expect(v03(parsed, contexto()).some((e) => e.regla === "V-03")).toBe(true)
  })

  it("rejects a non-positive total, too many decimals and a fractional meta", async () => {
    const parsed = await parsedValido()
    parsed.proyecto.valorTotal.valor = 0
    parsed.proyecto.metaBeneficiarios.valor = 12.5
    const reglas = v03(parsed, contexto()).filter((e) => e.regla === "V-03")
    expect(reglas.length).toBeGreaterThanOrEqual(2)

    const decimales = await parsedValido()
    decimales.proyecto.valorTotal.valor = 1773600.001
    expect(v03(decimales, contexto()).some((e) => e.regla === "V-03" && /decimales/.test(e.mensaje))).toBe(true)
  })
})

describe("V-04 strategic lines and municipios", () => {
  it("accepts the generated F-X1", async () => {
    expect(v04(await parsedValido(), contexto())).toEqual([])
  })

  it("rejects unknown or suspended lines", async () => {
    const parsed = await parsedValido()
    parsed.proyecto.lineas.valor = "LE99 - No existe"
    expect(v04(parsed, contexto()).some((e) => e.regla === "V-04" && e.valor === "LE99 - No existe")).toBe(true)

    const suspendida = contexto()
    suspendida.lineas = suspendida.lineas.map((l) => (l.codigo === "LE03" ? { ...l, activo: false } : l))
    expect(v04(await parsedValido(), suspendida).some((e) => e.regla === "V-04")).toBe(true)
  })

  it("rejects a suspended municipio", async () => {
    const parsed = await parsedValido()
    parsed.proyecto.municipios.valor = "Montería (Córdoba)"
    const ctx = contexto()
    ctx.municipios = ctx.municipios.map((m) => (m.codigoDane === "23001" ? { ...m, activo: false } : m))
    expect(v04(parsed, ctx).some((e) => e.regla === "V-04")).toBe(true)
  })
})

describe("V-05 unique codes per sheet", () => {
  it("accepts the generated F-X1", async () => {
    expect(v05(await parsedValido(), contexto())).toEqual([])
  })

  it("reports repeated codes with all their rows", async () => {
    const parsed = await parsedValido()
    parsed.objetivos = [
      fila(HOJAS.objetivos, 2, { Código: "OE1", Descripción: "Primero" }),
      fila(HOJAS.objetivos, 4, { Código: "OE1", Descripción: "Repetido" }),
    ]
    const errores = v05(parsed, contexto()).filter((e) => e.regla === "V-05" && e.hoja === HOJAS.objetivos)
    expect(errores.map((e) => e.fila).sort()).toEqual([2, 4])
  })
})

describe("V-06 cross-sheet references", () => {
  it("accepts the generated F-X1", async () => {
    expect(v06(await parsedValido(), contexto())).toEqual([])
  })

  it("reports dangling objective and activity references", async () => {
    const parsed = await parsedValido()
    parsed.actividades[0].celdas["Código objetivo"].valor = "OE9"
    expect(v06(parsed, contexto()).some((e) => e.regla === "V-06" && e.hoja === HOJAS.actividades)).toBe(true)

    const parsed2 = await parsedValido()
    parsed2.entregables[0].celdas["Código actividad"].valor = "1.9"
    expect(v06(parsed2, contexto()).some((e) => e.regla === "V-06" && e.hoja === HOJAS.entregables)).toBe(true)
  })
})

describe("V-07 weeks inside the project duration", () => {
  it("accepts the generated F-X1", async () => {
    expect(v07(await parsedValido(), contexto())).toEqual([])
  })

  it("reports weeks outside 1..duración", async () => {
    const parsed = await parsedValido()
    parsed.actividades[3].celdas["Semana fin"].valor = 19
    const errores = v07(parsed, contexto()).filter((e) => e.regla === "V-07")
    expect(errores).toHaveLength(1)
    expect(errores[0].hoja).toBe(HOJAS.actividades)
    expect(errores[0].fila).toBe(parsed.actividades[3].fila)
  })
})

describe("V-H1 required text and DB limits", () => {
  it("accepts the generated F-X1", async () => {
    expect(vH1(await parsedValido(), contexto())).toEqual([])
  })

  it("reports empty required text cells", async () => {
    const parsed = await parsedValido()
    parsed.entregables[0].celdas["Unidad"].valor = null
    const error = vH1(parsed, contexto()).find((e) => e.regla === "V-H1" && e.hoja === HOJAS.entregables)
    expect(error?.fila).toBe(parsed.entregables[0].fila)
    expect(error?.mensaje).toMatch(/Unidad/)
  })

  it("reports text over the DB limit", async () => {
    const parsed = await parsedValido()
    parsed.actividades[0].celdas["Nombre"].valor = "x".repeat(301)
    expect(vH1(parsed, contexto()).some((e) => e.regla === "V-H1" && e.hoja === HOJAS.actividades)).toBe(true)
  })
})
