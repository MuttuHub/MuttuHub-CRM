import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import {
  ARCHIVO_ILEGIBLE,
  SIN_ACTIVIDADES,
  parseEstructuraPO,
  type ResultadoEstructuraPO,
} from "./parse"

type Celdas = (string | number | null)[]

const IND = ["Objetivo especifico", "Resultados (indicador)", "Resultados (meta)"]
const ACT = ["Objetivo especifico", "Actividad", "Entregables", "Inicio (semana)", "Fin (semana)", "Cantidad", "Unidad"]

const OBJ1 = "Formalizar las unidades productivas."
const OBJ2 = "Desarrollar el modelo de negocio."

async function libro(hojas: Record<string, Celdas[]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  for (const [nombre, filas] of Object.entries(hojas)) {
    const ws = wb.addWorksheet(nombre)
    for (const fila of filas) ws.addRow(fila)
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

async function parse(hojas: Record<string, Celdas[]>, duracionSemanas: number | null = 20): Promise<ResultadoEstructuraPO> {
  return parseEstructuraPO(await libro(hojas), { duracionSemanas })
}

function mensajes(r: ResultadoEstructuraPO): string[] {
  return r.errores.map((e) => e.mensaje)
}

describe("parseEstructuraPO", () => {
  it("builds the plan with generated codes, grouping one row per entregable (T2, T6)", async () => {
    const r = await parse({
      Modelo0: [IND],
      Modelo1: [ACT],
      Ejemplo0: [IND, [OBJ1, "Asociaciones constituidas", 2], [OBJ2, "Modelos de negocio", 2], [OBJ2, "Identidades de marca", "3"]],
      Ejemplo1: [
        ACT,
        [OBJ1, "Levantar línea base", "Memorias de socialización", null, null, 2, "memorias"],
        [OBJ1, "Levantar línea base", "Informe de línea base", 1, 1, 1, "informe"],
        [OBJ1, "Gestionar la formalización", "Estatutos aprobados", 3, 6, 2, "estatutos"],
        [OBJ2, "Estructurar el modelo de negocio", "Modelos Lean Canvas", 7, 9, "2,5", "modelos"],
      ],
    })

    expect(r.errores).toEqual([])
    expect(r.plan.objetivos).toEqual([
      { codigo: "O1", descripcion: OBJ1 },
      { codigo: "O2", descripcion: OBJ2 },
    ])
    expect(r.plan.indicadores).toEqual([
      { codigo: "IND-01", objetivoCodigo: "O1", nombre: "Asociaciones constituidas", meta: "2.00" },
      { codigo: "IND-02", objetivoCodigo: "O2", nombre: "Modelos de negocio", meta: "2.00" },
      { codigo: "IND-03", objetivoCodigo: "O2", nombre: "Identidades de marca", meta: "3.00" },
    ])
    expect(r.plan.actividades).toEqual([
      { codigo: "A1.1", objetivoCodigo: "O1", nombre: "Levantar línea base", semanaInicio: 1, semanaFin: 1 },
      { codigo: "A1.2", objetivoCodigo: "O1", nombre: "Gestionar la formalización", semanaInicio: 3, semanaFin: 6 },
      { codigo: "A2.1", objetivoCodigo: "O2", nombre: "Estructurar el modelo de negocio", semanaInicio: 7, semanaFin: 9 },
    ])
    expect(r.plan.entregables).toEqual([
      { codigo: "E1.1.1", actividadCodigo: "A1.1", descripcion: "Memorias de socialización", cantidadMeta: "2.00", unidad: "memorias" },
      { codigo: "E1.1.2", actividadCodigo: "A1.1", descripcion: "Informe de línea base", cantidadMeta: "1.00", unidad: "informe" },
      { codigo: "E1.2.1", actividadCodigo: "A1.2", descripcion: "Estatutos aprobados", cantidadMeta: "2.00", unidad: "estatutos" },
      { codigo: "E2.1.1", actividadCodigo: "A2.1", descripcion: "Modelos Lean Canvas", cantidadMeta: "2.50", unidad: "modelos" },
    ])
    expect(r.resumen).toEqual({ objetivos: 2, indicadores: 3, actividades: 3, entregables: 4, errores: 0 })
    expect(r.truncado).toBe(false)
  })

  it("matches objetivos and actividades by normalized text, and keeps the first spelling", async () => {
    const r = await parse({
      Ejemplo1: [
        ACT,
        [OBJ1, "Levantar línea base", "Uno", 1, 2, 1, "u"],
        ["  formalizar las UNIDADES productivas  ", "levantar linea base.", "Dos", 2, 3, 1, "u"],
      ],
    })
    expect(r.errores).toEqual([])
    expect(r.plan.objetivos).toEqual([{ codigo: "O1", descripcion: OBJ1 }])
    expect(r.plan.actividades).toEqual([
      { codigo: "A1.1", objetivoCodigo: "O1", nombre: "Levantar línea base", semanaInicio: 1, semanaFin: 3 },
    ])
    expect(r.plan.entregables.map((e) => e.codigo)).toEqual(["E1.1.1", "E1.1.2"])
  })

  it("keeps the same actividad text under two objetivos as two actividades", async () => {
    const r = await parse({
      Hoja: [ACT, [OBJ1, "Socializar", "Uno", 1, 1, 1, "u"], [OBJ2, "Socializar", "Dos", 2, 2, 1, "u"]],
    })
    expect(r.plan.actividades.map((a) => [a.codigo, a.objetivoCodigo])).toEqual([
      ["A1.1", "O1"],
      ["A2.1", "O2"],
    ])
  })

  it("adds objetivos that only appear in the indicators sheet, indicators sheet first", async () => {
    const r = await parse({
      Ejemplo1: [ACT, [OBJ2, "Estructurar", "Uno", 1, 1, 1, "u"]],
      Ejemplo0: [IND, [OBJ1, "Asociaciones", 2]],
    })
    expect(r.plan.objetivos.map((o) => [o.codigo, o.descripcion])).toEqual([
      ["O1", OBJ1],
      ["O2", OBJ2],
    ])
    expect(r.plan.actividades[0].objetivoCodigo).toBe("O2")
  })

  it("finds the headers in any column order and below a title row", async () => {
    const r = await parse({
      Hoja: [
        ["Plan de trabajo del proyecto"],
        ["UNIDAD", "Fin semana", "Entregable", "Cantidad", "Actividad", "Inicio semana", "Objetivo específico"],
        ["informe", 4, "Informe", 1, "Diagnosticar", 2, OBJ1],
      ],
    })
    expect(r.errores).toEqual([])
    expect(r.plan.actividades).toEqual([
      { codigo: "A1.1", objetivoCodigo: "O1", nombre: "Diagnosticar", semanaInicio: 2, semanaFin: 4 },
    ])
    expect(r.plan.entregables[0]).toMatchObject({ cantidadMeta: "1.00", unidad: "informe" })
  })

  it("reports the missing Cantidad and Unidad columns and never reads the quantity from the text (T1)", async () => {
    const r = await parse({
      Ejemplo1: [
        ["Objetivo especifico", "Actividad", "Entregables", "Inicio (semana)", "Fin (semana)"],
        [OBJ1, "Levantar línea base", "2 Memorias de socialización", 1, 1],
      ],
    })
    expect(mensajes(r)).toEqual([
      "La hoja «Ejemplo1» no tiene la columna «Cantidad»: agrégala con la cantidad de cada entregable.",
      "La hoja «Ejemplo1» no tiene la columna «Unidad»: agrégala con la unidad de cada entregable.",
    ])
    expect(r.errores[0]).toMatchObject({ hoja: "Ejemplo1", fila: null, columna: null })
    expect(r.plan.entregables).toEqual([])
  })

  it("rejects two filled sheets of the same kind", async () => {
    const r = await parse({
      Modelo1: [ACT, [OBJ1, "Uno", "Uno", 1, 1, 1, "u"]],
      Ejemplo1: [ACT, [OBJ1, "Dos", "Dos", 1, 1, 1, "u"]],
    })
    expect(mensajes(r)).toEqual([
      "Las hojas «Modelo1» y «Ejemplo1» tienen actividades: deja los datos en una sola hoja.",
    ])
  })

  it("requires a sheet with actividades", async () => {
    const r = await parse({ Ejemplo0: [IND, [OBJ1, "Asociaciones", 2]], Ejemplo1: [ACT] })
    expect(mensajes(r)).toEqual([SIN_ACTIVIDADES])
  })

  it("reports an unreadable file", async () => {
    const r = await parseEstructuraPO(Buffer.from("not a workbook"), { duracionSemanas: 10 })
    expect(mensajes(r)).toEqual([ARCHIVO_ILEGIBLE])
  })

  it("lists every row error with its sheet, row and column", async () => {
    const r = await parse({
      Ejemplo0: [IND, [OBJ1, "", 2], [OBJ1, "Sin meta", null], [OBJ1, "Meta cero", 0], [OBJ1, "Meta texto", "dos"]],
      Ejemplo1: [
        ACT,
        ["", "Act", "Ent", 1, 1, 1, "u"],
        [OBJ1, "", "Ent", 1, 1, 1, "u"],
        [OBJ1, "Act", "", 1, 1, 1, "u"],
        [OBJ1, "Act", "Sin cantidad", 1, 1, null, "u"],
        [OBJ1, "Act", "Cantidad negativa", 1, 1, -1, "u"],
        [OBJ1, "Act", "Sin unidad", 1, 1, 1, ""],
        [OBJ1, "Act", "Semana texto", "dos", 1, 1, "u"],
        [OBJ1, "Act", "Semana decimal", 1, 1.5, 1, "u"],
      ],
    })
    expect(r.errores).toEqual([
      { hoja: "Ejemplo0", fila: 2, columna: "B", mensaje: "Falta el indicador." },
      { hoja: "Ejemplo0", fila: 3, columna: "C", mensaje: "La meta es obligatoria." },
      { hoja: "Ejemplo0", fila: 4, columna: "C", mensaje: "La meta debe ser mayor que cero." },
      { hoja: "Ejemplo0", fila: 5, columna: "C", mensaje: "La meta no es un número válido." },
      { hoja: "Ejemplo1", fila: 2, columna: "A", mensaje: "Falta el objetivo específico." },
      { hoja: "Ejemplo1", fila: 3, columna: "B", mensaje: "Falta la actividad." },
      { hoja: "Ejemplo1", fila: 4, columna: "C", mensaje: "Falta el entregable." },
      { hoja: "Ejemplo1", fila: 5, columna: "F", mensaje: "La cantidad es obligatoria." },
      { hoja: "Ejemplo1", fila: 6, columna: "F", mensaje: "La cantidad debe ser mayor que cero." },
      { hoja: "Ejemplo1", fila: 7, columna: "G", mensaje: "Falta la unidad." },
      { hoja: "Ejemplo1", fila: 8, columna: "D", mensaje: "La semana de inicio debe ser un número entero." },
      { hoja: "Ejemplo1", fila: 9, columna: "E", mensaje: "La semana de fin debe ser un número entero." },
    ])
    expect(r.resumen.errores).toBe(12)
  })

  it("checks each actividad's weeks after grouping its rows", async () => {
    const r = await parse(
      {
        Ejemplo1: [
          ACT,
          [OBJ1, "Sin inicio", "Uno", null, 2, 1, "u"],
          [OBJ1, "Sin fin", "Uno", 2, null, 1, "u"],
          [OBJ1, "Al revés", "Uno", 5, 3, 1, "u"],
          [OBJ1, "Muy larga", "Uno", 1, 9, 1, "u"],
          [OBJ1, "Completa", "Uno", null, 4, 1, "u"],
          [OBJ1, "Completa", "Dos", 2, null, 1, "u"],
        ],
      },
      8,
    )
    expect(r.errores).toEqual([
      { hoja: "Ejemplo1", fila: 2, columna: "D", mensaje: "La actividad «Sin inicio» no tiene semana de inicio en ninguna de sus filas." },
      { hoja: "Ejemplo1", fila: 3, columna: "E", mensaje: "La actividad «Sin fin» no tiene semana de fin en ninguna de sus filas." },
      { hoja: "Ejemplo1", fila: 4, columna: "E", mensaje: "La semana final no puede ser anterior a la inicial." },
      { hoja: "Ejemplo1", fila: 5, columna: "E", mensaje: "La semana final no puede superar la duración del proyecto (8 semanas)." },
    ])
    expect(r.plan.actividades.find((a) => a.nombre === "Completa")).toMatchObject({ semanaInicio: 2, semanaFin: 4 })
  })

  it("does not bound the weeks when the project has no dates yet", async () => {
    const r = await parse({ Ejemplo1: [ACT, [OBJ1, "Larga", "Uno", 1, 200, 1, "u"]] }, null)
    expect(r.errores).toEqual([])
  })

  it("bounds every text by its column limit", async () => {
    const r = await parse({
      Ejemplo1: [ACT, [OBJ1, "x".repeat(301), "Ent", 1, 1, 1, "u".repeat(101)]],
    })
    expect(r.errores).toEqual([
      { hoja: "Ejemplo1", fila: 2, columna: "B", mensaje: "La actividad supera los 300 caracteres." },
      { hoja: "Ejemplo1", fila: 2, columna: "G", mensaje: "La unidad supera los 100 caracteres." },
    ])
  })

  it("skips empty rows and rejects a sheet with too many rows", async () => {
    const vacias = await parse({ Ejemplo1: [ACT, [], [null, null, null], [OBJ1, "Act", "Ent", 1, 1, 1, "u"]] })
    expect(vacias.errores).toEqual([])
    expect(vacias.plan.entregables).toHaveLength(1)

    const filas: Celdas[] = [ACT]
    for (let i = 0; i < 1001; i++) filas.push([OBJ1, "Act", `Ent ${i}`, 1, 1, 1, "u"])
    const largo = await parse({ Ejemplo1: filas })
    expect(mensajes(largo)).toEqual(["La hoja «Ejemplo1» tiene más de 1000 filas con datos."])
  })
})
