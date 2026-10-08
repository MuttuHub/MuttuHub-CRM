// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import {
  v01,
  v02,
  v03,
  v04,
  v05,
  v06,
  v07,
  v08,
  v09,
  v10,
  v11,
  v12,
  v13,
  v14,
  vH1,
  w01,
  validarPlantilla,
  type ContextoValidacion,
} from "./validate"
import { generarPlantilla } from "./generate"
import { parsePlantilla, type Celda, type Fila, type ParsedTemplate } from "./parse"
import { HOJAS } from "./columns"
import { toCents } from "../money"
import { fixtureContextoFX1, fixtureF_X1 } from "../__fixtures__/plantilla-cedetextil"

let bufferValido: Buffer
let bufferV12: Buffer

beforeAll(async () => {
  bufferValido = await generarPlantilla(fixtureF_X1("valido"))
  bufferV12 = await generarPlantilla(fixtureF_X1("v12"))
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

describe("V-08 activities without deliverables", () => {
  it("accepts the generated F-X1", async () => {
    expect(v08(await parsedValido(), contexto())).toEqual([])
  })

  it("reports activities without deliverables", async () => {
    const parsed = await parsedValido()
    parsed.entregables = parsed.entregables.filter((e) => e.celdas["Código actividad"].valor !== "1.2")
    const errores = v08(parsed, contexto()).filter((e) => e.regla === "V-08")
    expect(errores).toHaveLength(1)
    expect(errores[0].valor).toBe("1.2")
  })
})

describe("V-09 positive quantities, metas and weights", () => {
  it("accepts the generated F-X1", async () => {
    expect(v09(await parsedValido(), contexto())).toEqual([])
  })

  it("rejects non-positive quantities, metas and weights", async () => {
    const parsed = await parsedValido()
    parsed.entregables[0].celdas["Cantidad"].valor = 0
    parsed.indicadores[0].celdas["Meta"].valor = 0
    parsed.indicadores[1].celdas["Línea base"].valor = -1
    parsed.actividades[0].celdas["Peso (opcional)"].valor = -1
    const errores = v09(parsed, contexto()).filter((e) => e.regla === "V-09")
    expect(errores.length).toBeGreaterThanOrEqual(4)
  })
})

describe("V-10 objectives without activities", () => {
  it("accepts the generated F-X1", async () => {
    expect(v10(await parsedValido(), contexto())).toEqual([])
  })

  it("reports objectives without activities", async () => {
    const parsed = await parsedValido()
    parsed.objetivos = [...parsed.objetivos, fila(HOJAS.objetivos, 3, { Código: "OE2", Descripción: "Sin actividades" })]
    expect(v10(parsed, contexto()).some((e) => e.regla === "V-10" && e.valor === "OE2")).toBe(true)
  })
})

describe("V-11 budget rubros", () => {
  it("accepts the generated F-X1", async () => {
    expect(v11(await parsedValido(), contexto())).toEqual([])
  })

  it("rejects unknown, suspended or repeated rubros and negatives", async () => {
    const desconocido = await parsedValido()
    desconocido.presupuesto[0].celdas["Código rubro"].valor = "R16"
    expect(v11(desconocido, contexto()).some((e) => e.regla === "V-11")).toBe(true)

    const suspendido = await parsedValido()
    const ctx = contexto()
    ctx.rubros = ctx.rubros.map((r) => (r.codigo === "R01" ? { ...r, activo: false } : r))
    expect(v11(suspendido, ctx).some((e) => e.regla === "V-11")).toBe(true)

    const repetido = await parsedValido()
    repetido.presupuesto = [...repetido.presupuesto, fila(HOJAS.presupuesto, 17, { "Código rubro": "R01", "Valor asignado": 1 })]
    expect(v11(repetido, contexto()).some((e) => e.regla === "V-11")).toBe(true)

    const negativo = await parsedValido()
    negativo.presupuesto[0].celdas["Valor asignado"].valor = -5
    expect(v11(negativo, contexto()).some((e) => e.regla === "V-11")).toBe(true)
  })
})

describe("V-12 budget sum equals the project total", () => {
  it("accepts the generated F-X1", async () => {
    expect(v12(await parsedValido(), contexto())).toEqual([])
  })

  it("reports the CedeTextil $50.000 difference to the cent", async () => {
    const errores = v12(await parsePlantilla(bufferV12), contexto()).filter((e) => e.regla === "V-12")
    expect(errores).toHaveLength(1)
    expect(errores[0].valor).toBe("50000.00")
    expect(toCents(errores[0].valor ?? "0")).toBe(toCents("50000"))
    expect(errores[0].mensaje).toContain("50.000")
  })
})

describe("V-13 programming sums per rubro", () => {
  it("accepts the generated F-X1", async () => {
    expect(v13(await parsedValido(), contexto())).toEqual([])
  })

  it("reports control ≠ 0 per rubro", async () => {
    const parsed = await parsedValido()
    const r12 = parsed.programacion.filas.find((f) => f.celdas["Código rubro"].valor === "R12")!
    r12.celdas[parsed.programacion.meses[0].encabezado].valor = 5000000
    const errores = v13(parsed, contexto()).filter((e) => e.regla === "V-13")
    expect(errores).toHaveLength(1)
    expect(errores[0].valor).toBe("R12")
  })
})

describe("V-14 months inside the project period", () => {
  it("accepts the generated F-X1", async () => {
    expect(v14(await parsedValido(), contexto())).toEqual([])
  })

  it("rejects months outside the project period and negative values", async () => {
    const fuera = await parsedValido()
    fuera.programacion.meses[0].periodo = "2027-02"
    expect(v14(fuera, contexto()).some((e) => e.regla === "V-14")).toBe(true)

    const negativa = await parsedValido()
    negativa.programacion.filas[0].celdas[negativa.programacion.meses[0].encabezado].valor = -1
    expect(v14(negativa, contexto()).some((e) => e.regla === "V-14")).toBe(true)
  })
})

describe("W-01 responsable emails", () => {
  it("accepts a known responsable without warnings", async () => {
    expect(w01(await parsedValido(), contexto())).toEqual([])
  })

  it("warns on unknown responsable emails without blocking", async () => {
    const parsed = await parsedValido()
    parsed.actividades[0].celdas["Responsable (correo)"].valor = "nadie@muttu.co"
    const advertencias = w01(parsed, contexto()).filter((e) => e.regla === "W-01")
    expect(advertencias).toHaveLength(1)
    expect(advertencias[0].hoja).toBe(HOJAS.actividades)
  })
})

describe("validarPlantilla", () => {
  it("accepts the generated F-X1 with no findings", async () => {
    const resultado = validarPlantilla(await parsedValido(), contexto())
    expect(resultado.errores).toEqual([])
    expect(resultado.advertencias).toEqual([])
    expect(resultado.truncado).toBe(false)
  })

  it("returns all errors sorted by sheet and row", async () => {
    const parsed = await parsedValido()
    parsed.actividades[3].celdas["Semana fin"].valor = 19
    const r12 = parsed.programacion.filas.find((f) => f.celdas["Código rubro"].valor === "R12")!
    r12.celdas[parsed.programacion.meses[0].encabezado].valor = 5000000

    const { errores } = validarPlantilla(parsed, contexto())
    expect(errores.some((e) => e.regla === "V-07")).toBe(true)
    expect(errores.some((e) => e.regla === "V-13")).toBe(true)

    const hojas: string[] = Object.values(HOJAS)
    const indices = errores.map((e) => hojas.indexOf(e.hoja))
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
    for (let i = 1; i < errores.length; i++) {
      if (errores[i].hoja === errores[i - 1].hoja && errores[i].fila !== null && errores[i - 1].fila !== null) {
        expect((errores[i].fila ?? 0)).toBeGreaterThanOrEqual(errores[i - 1].fila ?? 0)
      }
    }
  })

  it("keeps W-01 out of errores and counts it in advertencias", async () => {
    const parsed = await parsedValido()
    parsed.actividades[0].celdas["Responsable (correo)"].valor = "nadie@muttu.co"
    const resultado = validarPlantilla(parsed, contexto())
    expect(resultado.errores.some((e) => e.regla === "W-01")).toBe(false)
    expect(resultado.advertencias.some((e) => e.regla === "W-01")).toBe(true)
  })

  it("caps the report at 500 errors and sets truncado", async () => {
    const parsed = await parsedValido()
    parsed.entregables = Array.from({ length: 501 }, (_, i) =>
      fila(HOJAS.entregables, i + 2, {
        Código: `E${i + 1}`,
        "Código actividad": "NOPE",
        Descripción: "x",
        Cantidad: 1,
        Unidad: "Informe",
        "Tipo de medio exigido": "Documento PDF",
      }),
    )
    const resultado = validarPlantilla(parsed, contexto())
    expect(resultado.errores).toHaveLength(500)
    expect(resultado.truncado).toBe(true)
  })
})
