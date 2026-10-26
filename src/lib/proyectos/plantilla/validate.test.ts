// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
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
  vH2,
  w01,
  w02,
  validarPlantilla,
  type ContextoValidacion,
} from "./validate"
import { generarPlantilla } from "./generate"
import { MAX_MESES, parsePlantilla, type Celda, type Fila, type ParsedTemplate } from "./parse"
import { HOJAS, MAX_FILAS_HOJA } from "./columns"
import { toCents } from "../money"
import { fixtureContextoFX1, fixtureF_X1, plantillaFormatoAnterior } from "../__fixtures__/plantilla-cedetextil"

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

  it("rejects a code longer than 50 characters", async () => {
    const parsed = await parsedValido()
    parsed.objetivos[0].celdas["Código"].valor = "x".repeat(51)
    const error = v05(parsed, contexto()).find((e) => e.regla === "V-05" && e.hoja === HOJAS.objetivos)
    expect(error?.mensaje).toMatch(/50 caracteres/)
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

  it("enforces the 2000-char Descripción limit", async () => {
    const limite = await parsedValido()
    limite.entregables[0].celdas["Descripción"].valor = "x".repeat(2000)
    expect(vH1(limite, contexto()).some((e) => e.regla === "V-H1" && /Descripción/.test(e.mensaje))).toBe(false)

    const excedido = await parsedValido()
    excedido.entregables[0].celdas["Descripción"].valor = "x".repeat(2001)
    expect(vH1(excedido, contexto()).some((e) => e.regla === "V-H1" && /Descripción.*2000/.test(e.mensaje))).toBe(true)
  })

  it("does not ask for Tipo de medio exigido nor the indicator Unidad (PO 2026-10-23)", async () => {
    const parsed = await parsedValido()
    expect(parsed.encabezados.entregables).not.toContain("Tipo de medio exigido")
    expect(parsed.encabezados.indicadores).not.toContain("Unidad")
    const vacios = await parsePlantilla(
      await plantillaFormatoAnterior(bufferValido, { tipoMedio: "", unidadIndicador: "" }),
    )
    expect(validarPlantilla(vacios, contexto()).errores).toEqual([])
  })

  it("accepts a template downloaded in the previous layout", async () => {
    const anterior = await parsePlantilla(await plantillaFormatoAnterior(bufferValido))
    expect(validarPlantilla(anterior, contexto()).errores).toEqual([])
  })

  it("enforces the 200-char Tipo de medio exigido limit of the previous layout", async () => {
    const limite = await parsePlantilla(await plantillaFormatoAnterior(bufferValido))
    limite.entregables[0].celdas["Tipo de medio exigido"].valor = "x".repeat(200)
    expect(vH1(limite, contexto()).some((e) => e.regla === "V-H1" && /Tipo de medio exigido/.test(e.mensaje))).toBe(false)

    const excedido = await parsePlantilla(await plantillaFormatoAnterior(bufferValido))
    excedido.entregables[0].celdas["Tipo de medio exigido"].valor = "x".repeat(201)
    expect(vH1(excedido, contexto()).some((e) => e.regla === "V-H1" && /Tipo de medio exigido.*200/.test(e.mensaje))).toBe(true)
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

/** The parsed F-X1 with every "Valor asignado" set to zero. */
async function parsedSinPresupuesto(): Promise<ParsedTemplate> {
  const parsed = await parsedValido()
  for (const filaPres of parsed.presupuesto) filaPres.celdas["Valor asignado"].valor = 0
  return parsed
}

describe("V-12 an empty budget cannot back the project total", () => {
  it("accepts the generated F-X1", async () => {
    expect(v12(await parsedValido(), contexto())).toEqual([])
  })

  it("does not block a funded budget that differs from the total (PO feedback 2026-10-23)", async () => {
    expect(v12(await parsePlantilla(bufferV12), contexto())).toEqual([])
  })

  it("reports a budget that sums $0 against a positive total", async () => {
    const errores = v12(await parsedSinPresupuesto(), contexto())
    expect(errores).toHaveLength(1)
    expect(errores[0].regla).toBe("V-12")
    expect(errores[0].hoja).toBe(HOJAS.presupuesto)
    expect(errores[0].valor).toBe("177360000.00")
    expect(toCents(errores[0].valor ?? "0")).toBe(toCents("177360000"))
    expect(errores[0].mensaje).toContain("177.360.000")
  })
})

describe("W-02 the budget sum replaces a different project total", () => {
  it("is silent when the budget equals the total", async () => {
    expect(w02(await parsedValido(), contexto())).toEqual([])
  })

  it("is silent for an empty budget (V-12 reports it)", async () => {
    expect(w02(await parsedSinPresupuesto(), contexto())).toEqual([])
  })

  it("warns that the CedeTextil budget becomes the total, with the difference to the cent", async () => {
    const advertencias = w02(await parsePlantilla(bufferV12), contexto())
    expect(advertencias).toHaveLength(1)
    expect(advertencias[0].regla).toBe("W-02")
    expect(advertencias[0].hoja).toBe(HOJAS.proyecto)
    expect(advertencias[0].columna).toBe("B")
    expect(advertencias[0].valor).toBe("177410000.00")
    expect(advertencias[0].mensaje).toContain("diferencia")
    expect(advertencias[0].mensaje).toContain("50.000")
    expect(advertencias[0].mensaje).toMatch(/Se importará .*177\.360\.000 como valor total del proyecto\.$/)
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

describe("F1 — scientific-notation and non-finite cells never throw", () => {
  it("reports 1e21 in Valor total instead of throwing", async () => {
    const parsed = await parsedValido()
    parsed.proyecto.valorTotal.valor = 1e21
    expect(() => validarPlantilla(parsed, contexto())).not.toThrow()
    expect(v03(parsed, contexto()).some((e) => e.regla === "V-03" && /no es un monto válido/.test(e.mensaje))).toBe(true)
  })

  it("reports 1e-7 in Cantidad and 1e21 in Peso instead of throwing", async () => {
    const parsed = await parsedValido()
    parsed.entregables[0].celdas["Cantidad"].valor = 1e-7
    parsed.actividades[0].celdas["Peso (opcional)"].valor = 1e21
    expect(() => validarPlantilla(parsed, contexto())).not.toThrow()
    const errores = v09(parsed, contexto()).filter((e) => e.regla === "V-09")
    expect(errores.some((e) => /cantidad no es un número válido/.test(e.mensaje))).toBe(true)
    expect(errores.some((e) => /peso no es un número válido/.test(e.mensaje))).toBe(true)
  })
})

describe("F2 — V-H2 workbook limits and Excel error cells", () => {
  it("reports the rows an oversized sheet dropped", async () => {
    const workbook = new ExcelJS.Workbook()
    const hoja = workbook.addWorksheet(HOJAS.objetivos)
    hoja.addRow(["Código", "Descripción"])
    for (let i = 0; i < MAX_FILAS_HOJA + 5; i++) hoja.addRow([`OE${i}`, "x"])
    const parsed = await parsePlantilla((await workbook.xlsx.writeBuffer()) as never)
    const error = vH2(parsed, contexto()).find((e) => e.regla === "V-H2" && e.hoja === HOJAS.objetivos)
    expect(error?.valor).toBe("5")
  })

  it("reports the month columns past MAX_MESES", async () => {
    const workbook = new ExcelJS.Workbook()
    const hoja = workbook.addWorksheet(HOJAS.programacion)
    const meses = Array.from(
      { length: MAX_MESES + 3 },
      (_, i) => `Mes ${i + 1} (2026-${String((i % 12) + 1).padStart(2, "0")})`,
    )
    hoja.addRow(["Código rubro", "Rubro", ...meses, "Total", "Control"])
    hoja.addRow(["R01", "Personal", ...meses.map(() => 0), 0, 0])
    const parsed = await parsePlantilla((await workbook.xlsx.writeBuffer()) as never)
    const error = vH2(parsed, contexto()).find((e) => e.regla === "V-H2" && e.hoja === HOJAS.programacion)
    expect(error?.valor).toBe("3")
  })

  it("is wired into validarPlantilla", async () => {
    const workbook = new ExcelJS.Workbook()
    const hoja = workbook.addWorksheet(HOJAS.objetivos)
    hoja.addRow(["Código", "Descripción"])
    for (let i = 0; i < MAX_FILAS_HOJA + 1; i++) hoja.addRow([`OE${i}`, "x"])
    const parsed = await parsePlantilla((await workbook.xlsx.writeBuffer()) as never)
    expect(validarPlantilla(parsed, contexto()).errores.some((e) => e.regla === "V-H2")).toBe(true)
  })

  it("reports #REF! in a text input cell as valor no válido", async () => {
    const parsed = await parsedValido()
    parsed.entregables[0].celdas["Descripción"].valor = "#REF!"
    const error = vH2(parsed, contexto()).find(
      (e) => e.regla === "V-H2" && e.hoja === HOJAS.entregables && e.fila === parsed.entregables[0].fila,
    )
    expect(error?.valor).toBe("#REF!")
    expect(error?.mensaje).toMatch(/valor no válido/)
  })

  it("reports #DIV/0! in a numeric cell that would otherwise parse as 0", async () => {
    const parsed = await parsedValido()
    parsed.entregables[0].celdas["Cantidad"].valor = "#DIV/0!"
    expect(vH2(parsed, contexto()).some((e) => e.regla === "V-H2" && e.valor === "#DIV/0!")).toBe(true)
  })
})

describe("F3 — V-01 gates the project sheet", () => {
  it("treats a missing required label row as structural and suppresses V-03", async () => {
    const parsed = await parsedValido()
    parsed.proyecto.valorTotal.fila = 0
    parsed.proyecto.valorTotal.valor = null
    expect(
      v01(parsed, contexto()).some((e) => e.regla === "V-01" && e.hoja === HOJAS.proyecto && /Valor total/.test(e.mensaje)),
    ).toBe(true)
    expect(v03(parsed, contexto())).toEqual([])
    expect(validarPlantilla(parsed, contexto()).errores.some((e) => e.regla === "V-03")).toBe(false)
  })
})

describe("F6 — column ordering past Z", () => {
  it("orders Z before AA by Excel column index", async () => {
    const parsed = await parsedValido()
    parsed.programacion.meses = [
      { encabezado: "Mes 24 (2028-08)", columna: "Z", periodo: null },
      { encabezado: "Mes 25 (2028-09)", columna: "AA", periodo: null },
    ]
    for (const fila of parsed.programacion.filas) {
      fila.celdas["Mes 24 (2028-08)"] = { hoja: HOJAS.programacion, fila: fila.fila, columna: "Z", valor: "x" }
      fila.celdas["Mes 25 (2028-09)"] = { hoja: HOJAS.programacion, fila: fila.fila, columna: "AA", valor: "x" }
    }
    const fila1 = validarPlantilla(parsed, contexto()).errores.filter((e) => e.fila === 1)
    expect(fila1.map((e) => e.columna)).toEqual(["Z", "AA"])
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

  it("lets a budget that differs from the total through with only the W-02 warning", async () => {
    const resultado = validarPlantilla(await parsePlantilla(bufferV12), contexto())
    expect(resultado.errores).toEqual([])
    expect(resultado.advertencias.map((e) => e.regla)).toEqual(["W-02"])
    expect(resultado.resumen).toEqual({ "W-02": 1 })
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
      }),
    )
    const resultado = validarPlantilla(parsed, contexto())
    expect(resultado.errores).toHaveLength(500)
    expect(resultado.truncado).toBe(true)
    expect(resultado.resumen["V-06"]).toBe(501)
  })

  it("counts every finding in resumen before the cap and flips truncado at 501", async () => {
    const conMalos = async (n: number): Promise<ParsedTemplate> => {
      const parsed = await parsedValido()
      parsed.entregables = Array.from({ length: n }, (_, i) =>
        fila(HOJAS.entregables, i + 2, {
          Código: `E${i + 1}`,
          "Código actividad": "NOPE",
          Descripción: "x",
          Cantidad: 1,
          Unidad: "Informe",
        }),
      )
      return parsed
    }

    // 496 bad rows + the 4 V-08 (activities left without deliverables) = 500.
    const limite = validarPlantilla(await conMalos(496), contexto())
    expect(limite.truncado).toBe(false)
    expect(limite.errores).toHaveLength(500)
    expect(limite.resumen["V-06"]).toBe(496)
    expect(limite.resumen["V-08"]).toBe(4)

    // One more row crosses the cap: resumen still counts all 497 V-06.
    const truncado = validarPlantilla(await conMalos(497), contexto())
    expect(truncado.truncado).toBe(true)
    expect(truncado.errores).toHaveLength(500)
    expect(truncado.resumen["V-06"]).toBe(497)
    expect(truncado.resumen["V-08"]).toBe(4)
  })

  it("orders findings by sheet, then row, then column index", async () => {
    const parsed = await parsedValido()
    parsed.objetivos[0].celdas["Descripción"].valor = ""
    parsed.actividades[3].celdas["Semana fin"].valor = 19
    const r12 = parsed.programacion.filas.find((f) => f.celdas["Código rubro"].valor === "R12")!
    r12.celdas[parsed.programacion.meses[0].encabezado].valor = -1

    const { errores } = validarPlantilla(parsed, contexto())
    expect(errores.map((e) => `${e.hoja}|${e.fila}|${e.columna}`)).toEqual([
      `${HOJAS.objetivos}|2|B`,
      `${HOJAS.actividades}|${parsed.actividades[3].fila}|E`,
      `${HOJAS.programacion}|${r12.fila}|A`,
      `${HOJAS.programacion}|${r12.fila}|${parsed.programacion.meses[0].columna}`,
    ])
  })
})
