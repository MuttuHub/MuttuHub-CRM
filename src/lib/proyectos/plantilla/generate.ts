/**
 * S7 U1 (RF-03) — build the official nine-sheet Excel template.
 *
 * Node-only (`exceljs` must never reach a `"use client"` module). The workbook
 * is written from a pure `PlantillaInput`, so the route that downloads it and
 * the fixture tests share one code path. Every formula cell is written with a
 * cached `result`: `exceljs` drops the result when no value is available, and
 * the parser (U2) reads `.result`, never the `Total`/`Control` text.
 */
import ExcelJS from "exceljs"
import { randomUUID } from "node:crypto"
import { toCents } from "../money"
import { projectPeriods, type IsoDate, type Periodo } from "../weeks"
import {
  CATALOGOS,
  ENCABEZADO_PROYECTO,
  ENCABEZADOS,
  ENCABEZADOS_PROGRAMACION,
  ETIQUETAS_PROYECTO,
  HOJAS,
  MAX_FILAS_HOJA,
  NOMBRES_RANGO,
  PLANTILLA_VERSION,
  UNIDADES_SUGERIDAS,
} from "./columns"

export type ObjetivoInput = { codigo: string; descripcion: string }

export type ActividadInput = {
  codigo: string
  objetivoCodigo: string
  nombre: string
  semanaInicio: number
  semanaFin: number
  responsable: string | null
  /** Explicit weight; `null` means "the default duration in weeks". */
  peso: string | null
}

export type EntregableInput = {
  codigo: string
  actividadCodigo: string
  descripcion: string
  cantidad: string
  unidad: string
}

export type IndicadorInput = {
  codigo: string
  objetivoCodigo: string
  nombre: string
  meta: string
  lineaBase: string | null
}

export type PlantillaInput = {
  proyecto: {
    codigo: string
    cliente: string
    fechaInicio: IsoDate
    fechaFin: IsoDate
    valorTotal: string | null
    beneficiariosMeta: number | null
    lineas: { codigo: string; nombre: string; principal: boolean }[]
    municipios: { nombre: string; departamento: string }[]
  }
  catalogo: {
    rubros: { codigo: string; nombre: string }[]
    lineas: { codigo: string; nombre: string }[]
    municipios: { nombre: string; departamento: string; codigoDane: string | null }[]
  }
  estructura: {
    objetivos: ObjetivoInput[]
    actividades: ActividadInput[]
    entregables: EntregableInput[]
    indicadores: IndicadorInput[]
  }
  /** Rubro code -> assigned amount as a decimal string. Missing codes mean 0. */
  presupuesto: Record<string, string>
  /** Rubro code -> period -> programmed amount as a decimal string. */
  programacion: Record<string, Record<Periodo, string>>
}

/** The subset of `exceljs` the typed surface omits (present at runtime). */
type WorksheetConValidaciones = ExcelJS.Worksheet & {
  dataValidations: { add(range: string, dv: Partial<ExcelJS.DataValidation>): void }
}

/** 1 -> "A", 27 -> "AA". */
function columnLetter(index: number): string {
  let n = index
  let letters = ""
  while (n > 0) {
    const remainder = (n - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

/** An ISO calendar date as a UTC-midnight `Date`, so Excel stores a real date. */
function isoToDate(iso: IsoDate): Date {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function sheetRef(name: string): string {
  return `'${name}'`
}

function centsToNumber(cents: bigint): number {
  return Number(cents) / 100
}

function escribirInstrucciones(workbook: ExcelJS.Workbook, input: PlantillaInput): ExcelJS.Worksheet {
  const hoja = workbook.addWorksheet(HOJAS.instrucciones)
  hoja.getCell("A1").value = `Plantilla de importación de proyectos — ${input.proyecto.codigo}`
  hoja.getCell("B2").value = PLANTILLA_VERSION
  const texto = [
    "Cómo diligenciar esta plantilla",
    "1. No cambies los nombres de las hojas ni los encabezados de la fila 1.",
    "2. Los códigos deben ser únicos dentro de cada hoja (3 a 6).",
    "3. Usa punto y coma (;) para separar varias líneas estratégicas o municipios.",
    "4. Las semanas van de 1 al total de semanas del proyecto.",
    "5. Los montos aceptan formato colombiano (59.500.000 o 1.440.000,50).",
    "6. Revisa la hoja 9. Catálogos para los valores permitidos.",
  ]
  texto.forEach((linea, i) => {
    hoja.getCell(`A${i + 4}`).value = linea
  })
  return hoja
}

function escribirProyecto(workbook: ExcelJS.Workbook, input: PlantillaInput): ExcelJS.Worksheet {
  const hoja = workbook.addWorksheet(HOJAS.proyecto)
  hoja.addRow([...ENCABEZADO_PROYECTO])

  const lineas = input.proyecto.lineas.map((l) => `${l.codigo} - ${l.nombre}`).join("; ")
  const municipios = input.proyecto.municipios.map((m) => `${m.nombre} (${m.departamento})`).join("; ")
  const valores: ExcelJS.CellValue[] = [
    input.proyecto.codigo,
    input.proyecto.cliente,
    lineas,
    municipios,
    isoToDate(input.proyecto.fechaInicio),
    isoToDate(input.proyecto.fechaFin),
    input.proyecto.valorTotal === null ? null : Number(input.proyecto.valorTotal),
    input.proyecto.beneficiariosMeta,
  ]
  ETIQUETAS_PROYECTO.forEach((etiqueta, i) => {
    hoja.addRow([etiqueta, valores[i]])
  })
  return hoja
}

function escribirObjetivos(workbook: ExcelJS.Workbook, input: PlantillaInput): ExcelJS.Worksheet {
  const hoja = workbook.addWorksheet(HOJAS.objetivos)
  hoja.addRow([...ENCABEZADOS.objetivos])
  for (const objetivo of input.estructura.objetivos) {
    hoja.addRow([objetivo.codigo, objetivo.descripcion])
  }
  return hoja
}

function escribirActividades(workbook: ExcelJS.Workbook, input: PlantillaInput): ExcelJS.Worksheet {
  const hoja = workbook.addWorksheet(HOJAS.actividades)
  hoja.addRow([...ENCABEZADOS.actividades])
  for (const actividad of input.estructura.actividades) {
    hoja.addRow([
      actividad.codigo,
      actividad.objetivoCodigo,
      actividad.nombre,
      actividad.semanaInicio,
      actividad.semanaFin,
      actividad.responsable,
      actividad.peso === null ? null : Number(actividad.peso),
    ])
  }
  return hoja
}

function escribirEntregables(workbook: ExcelJS.Workbook, input: PlantillaInput): ExcelJS.Worksheet {
  const hoja = workbook.addWorksheet(HOJAS.entregables)
  hoja.addRow([...ENCABEZADOS.entregables])
  for (const entregable of input.estructura.entregables) {
    hoja.addRow([
      entregable.codigo,
      entregable.actividadCodigo,
      entregable.descripcion,
      Number(entregable.cantidad),
      entregable.unidad,
    ])
  }
  return hoja
}

function escribirIndicadores(workbook: ExcelJS.Workbook, input: PlantillaInput): ExcelJS.Worksheet {
  const hoja = workbook.addWorksheet(HOJAS.indicadores)
  hoja.addRow([...ENCABEZADOS.indicadores])
  for (const indicador of input.estructura.indicadores) {
    hoja.addRow([
      indicador.codigo,
      indicador.objetivoCodigo,
      indicador.nombre,
      Number(indicador.meta),
      indicador.lineaBase === null ? null : Number(indicador.lineaBase),
    ])
  }
  return hoja
}

function escribirPresupuesto(workbook: ExcelJS.Workbook, input: PlantillaInput): ExcelJS.Worksheet {
  const hoja = workbook.addWorksheet(HOJAS.presupuesto)
  hoja.addRow([...ENCABEZADOS.presupuesto])
  for (const rubro of input.catalogo.rubros) {
    hoja.addRow([rubro.codigo, rubro.nombre, Number(input.presupuesto[rubro.codigo] ?? "0")])
  }
  return hoja
}

function escribirProgramacion(workbook: ExcelJS.Workbook, input: PlantillaInput): ExcelJS.Worksheet {
  const hoja = workbook.addWorksheet(HOJAS.programacion)
  const periodos = projectPeriods(input.proyecto.fechaInicio, input.proyecto.fechaFin)
  hoja.addRow([
    ENCABEZADOS_PROGRAMACION.codigoRubro,
    ENCABEZADOS_PROGRAMACION.rubro,
    ...periodos.map((periodo, i) => `Mes ${i + 1} (${periodo})`),
    ENCABEZADOS_PROGRAMACION.total,
    ENCABEZADOS_PROGRAMACION.control,
  ])

  const primeraColumnaMes = columnLetter(3)
  const ultimaColumnaMes = columnLetter(2 + periodos.length)
  const columnaTotal = columnLetter(3 + periodos.length)
  const columnaControl = columnLetter(4 + periodos.length)

  for (const rubro of input.catalogo.rubros) {
    const asignado = toCents(input.presupuesto[rubro.codigo] ?? "0")
    const meses = periodos.map((periodo) => {
      const valor = input.programacion[rubro.codigo]?.[periodo]
      return valor === undefined ? null : Number(valor)
    })
    const totalCents = meses.reduce<bigint>(
      (suma, valor) => (valor === null ? suma : suma + toCents(String(valor))),
      toCents("0"),
    )

    const fila = hoja.addRow([rubro.codigo, rubro.nombre, ...meses])

    const celdaTotal = hoja.getCell(`${columnaTotal}${fila.number}`)
    celdaTotal.value = {
      formula: `SUM(${primeraColumnaMes}${fila.number}:${ultimaColumnaMes}${fila.number})`,
      result: centsToNumber(totalCents),
    }

    const celdaControl = hoja.getCell(`${columnaControl}${fila.number}`)
    celdaControl.value = {
      formula: `${columnaTotal}${fila.number}-VLOOKUP(A${fila.number},${sheetRef(HOJAS.presupuesto)}!A:C,3,FALSE)`,
      result: centsToNumber(totalCents - asignado),
    }
  }
  return hoja
}

async function escribirCatalogos(workbook: ExcelJS.Workbook, input: PlantillaInput): Promise<ExcelJS.Worksheet> {
  const hoja = workbook.addWorksheet(HOJAS.catalogos)
  hoja.addRow([CATALOGOS.rubros, CATALOGOS.lineas, CATALOGOS.municipios, CATALOGOS.unidades])

  input.catalogo.rubros.forEach((rubro, i) => {
    hoja.getCell(i + 2, 1).value = rubro.codigo
  })
  input.catalogo.lineas.forEach((linea, i) => {
    hoja.getCell(i + 2, 2).value = `${linea.codigo} - ${linea.nombre}`
  })
  input.catalogo.municipios.forEach((municipio, i) => {
    hoja.getCell(i + 2, 3).value = `${municipio.nombre} (${municipio.departamento})`
  })
  UNIDADES_SUGERIDAS.forEach((unidad, i) => {
    hoja.getCell(i + 2, 4).value = unidad
  })

  // Anchor every range on the first data row (row 2). An empty catalog used to
  // produce a reversed range (`$C$2:$C$1`) that ExcelJS rewrites as
  // `$C$1:$C$2`, wrongly including the header; clamping the last row to row 2
  // yields a valid single-cell range instead.
  const ref = (columna: string, count: number) => {
    const filaFin = Math.max(2, 1 + count)
    return `${sheetRef(HOJAS.catalogos)}!$${columna}$2:$${columna}$${filaFin}`
  }
  workbook.definedNames.add(ref("A", input.catalogo.rubros.length), NOMBRES_RANGO.rubros)
  workbook.definedNames.add(ref("B", input.catalogo.lineas.length), NOMBRES_RANGO.lineas)
  workbook.definedNames.add(ref("C", input.catalogo.municipios.length), NOMBRES_RANGO.municipios)
  workbook.definedNames.add(ref("D", UNIDADES_SUGERIDAS.length), NOMBRES_RANGO.unidades)

  // Random per-download password, never stored: protects the catalog sheet
  // against accidental edits without leaking a shared secret anywhere.
  await hoja.protect(randomUUID(), { selectLockedCells: false, selectUnlockedCells: true })
  return hoja
}

function addValidation(sheet: ExcelJS.Worksheet, range: string, dv: Partial<ExcelJS.DataValidation>): void {
  ;(sheet as WorksheetConValidaciones).dataValidations.add(range, dv)
}

function aplicarValidaciones(hojas: {
  objetivos: ExcelJS.Worksheet
  actividades: ExcelJS.Worksheet
  entregables: ExcelJS.Worksheet
  indicadores: ExcelJS.Worksheet
  presupuesto: ExcelJS.Worksheet
  programacion: ExcelJS.Worksheet
}): void {
  const ultima = MAX_FILAS_HOJA + 1
  const referenciaObjetivos = `${sheetRef(HOJAS.objetivos)}!$A$2:$A$200`
  const referenciaActividades = `${sheetRef(HOJAS.actividades)}!$A$2:$A$200`

  addValidation(hojas.presupuesto, `A2:A${ultima}`, {
    type: "list",
    allowBlank: true,
    formulae: [`=${NOMBRES_RANGO.rubros}`],
  })
  addValidation(hojas.presupuesto, `C2:C${ultima}`, {
    type: "decimal",
    operator: "greaterThanOrEqual",
    allowBlank: true,
    formulae: [0],
  })
  addValidation(hojas.programacion, `A2:A${ultima}`, {
    type: "list",
    allowBlank: true,
    formulae: [`=${NOMBRES_RANGO.rubros}`],
  })
  addValidation(hojas.actividades, `B2:B${ultima}`, {
    type: "list",
    allowBlank: true,
    formulae: [`=${referenciaObjetivos}`],
  })
  addValidation(hojas.actividades, `D2:E${ultima}`, {
    type: "whole",
    operator: "greaterThanOrEqual",
    allowBlank: true,
    formulae: [1],
  })
  addValidation(hojas.actividades, `G2:G${ultima}`, {
    type: "decimal",
    operator: "greaterThanOrEqual",
    allowBlank: true,
    formulae: [0],
  })
  addValidation(hojas.entregables, `B2:B${ultima}`, {
    type: "list",
    allowBlank: true,
    formulae: [`=${referenciaActividades}`],
  })
  addValidation(hojas.entregables, `D2:D${ultima}`, {
    type: "decimal",
    operator: "greaterThan",
    allowBlank: true,
    formulae: [0],
  })
  // Units are free text in the DB: the dropdown warns, it does not block.
  addValidation(hojas.entregables, `E2:E${ultima}`, {
    type: "list",
    allowBlank: true,
    showErrorMessage: false,
    formulae: [`=${NOMBRES_RANGO.unidades}`],
  })
  addValidation(hojas.indicadores, `B2:B${ultima}`, {
    type: "list",
    allowBlank: true,
    formulae: [`=${referenciaObjetivos}`],
  })
  addValidation(hojas.indicadores, `D2:D${ultima}`, {
    type: "decimal",
    operator: "greaterThan",
    allowBlank: true,
    formulae: [0],
  })
}

/**
 * Builds the whole workbook and returns it as an xlsx `Buffer`. Pure: no DB,
 * no filesystem, no clock-dependent data beyond the workbook timestamps.
 */
export async function generarPlantilla(input: PlantillaInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Muttu Hub"
  workbook.title = `Plantilla de proyecto ${input.proyecto.codigo}`
  workbook.created = new Date()
  workbook.modified = new Date()

  escribirInstrucciones(workbook, input)
  escribirProyecto(workbook, input)
  const objetivos = escribirObjetivos(workbook, input)
  const actividades = escribirActividades(workbook, input)
  const entregables = escribirEntregables(workbook, input)
  const indicadores = escribirIndicadores(workbook, input)
  const presupuesto = escribirPresupuesto(workbook, input)
  const programacion = escribirProgramacion(workbook, input)
  await escribirCatalogos(workbook, input)

  aplicarValidaciones({ objetivos, actividades, entregables, indicadores, presupuesto, programacion })

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
