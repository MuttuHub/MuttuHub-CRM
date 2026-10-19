/**
 * S7 U2 (RF-04) — read a filled template back into a transportable shape.
 *
 * Pure and Node-only (same `exceljs` boundary as `generate.ts`). The parser is
 * deliberately dumb: it reads cells, keeps their sheet/row/column identity and
 * reads a formula's cached `.result` (never recomputes). All business rules
 * live in the validators (U3/U4). `parsePlantilla` accepts only the nine known
 * sheets by name and caps every sheet at `MAX_FILAS_HOJA` rows.
 */
import ExcelJS from "exceljs"
import { assertIsoDate, type IsoDate, type Periodo } from "../weeks"
import { HOJAS, MAX_FILAS_HOJA, type HojaKey } from "./columns"

export type Celda = { hoja: string; fila: number; columna: string; valor: string | number | Date | null }

/**
 * One data row keyed by its header text (row 1). When a column has no header
 * (a malformed sheet), the key falls back to its column letter.
 */
export type Fila = { fila: number; celdas: Record<string, Celda> }

export type ParsedTemplate = {
  version: string | null
  hojasPresentes: string[]
  encabezados: Record<string, string[]>
  proyecto: {
    codigo: Celda
    lineas: Celda
    municipios: Celda
    fechaInicio: Celda
    fechaFin: Celda
    valorTotal: Celda
    metaBeneficiarios: Celda
  }
  objetivos: Fila[]
  actividades: Fila[]
  entregables: Fila[]
  indicadores: Fila[]
  presupuesto: Fila[]
  programacion: {
    meses: { encabezado: string; columna: string; periodo: Periodo | null }[]
    filas: Fila[]
  }
  /**
   * Data rows dropped per sheet because they exceeded `MAX_FILAS_HOJA`, keyed by
   * the sheet name. Empty when nothing was dropped; `vH2` turns it into a finding
   * so truncation is reported instead of silent (the rows are still not loaded).
   */
  excesoFilas: Record<string, number>
  /** Month columns dropped because they exceeded `MAX_MESES`. */
  excesoMeses: number
}

/** Thrown when the buffer is not a readable xlsx at all (corrupt / not a zip). */
export class PlantillaIlegible extends Error {
  constructor(message = "El archivo no es una plantilla válida.") {
    super(message)
    this.name = "PlantillaIlegible"
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DMY_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
const MES_ENCABEZADO = /^Mes (\d+) \((\d{4}-\d{2})\)$/
/** Month columns read from `8. Programación`; anything beyond is ignored (DoS guard). */
export const MAX_MESES = 60

const HOJAS_CON_ENCABEZADO: readonly HojaKey[] = [
  "proyecto",
  "objetivos",
  "actividades",
  "entregables",
  "indicadores",
  "presupuesto",
  "programacion",
]

const ETIQUETAS_PROYECTO: Record<keyof ParsedTemplate["proyecto"], string> = {
  codigo: "Código",
  lineas: "Líneas estratégicas",
  municipios: "Municipios",
  fechaInicio: "Fecha de inicio",
  fechaFin: "Fecha de fin",
  valorTotal: "Valor total",
  metaBeneficiarios: "Meta de beneficiarios",
}

// The generator writes a format this parser accepts; the parity is tested.
const RUIDO_NUMERO = /[^\d.,-]/g

/**
 * Colombian-formatted number to a canonical decimal string, or `null` when the
 * text is not safely interpretable. A dot is a thousands separator, a comma the
 * decimal one; a single dot with 1-2 trailing digits is read as a decimal point
 * ("1.5"), while US-style comma grouping ("59,500,000") is ambiguous -> null.
 */
export function parseNumeroColombiano(texto: string): string | null {
  const raw = texto.replace(RUIDO_NUMERO, "").trim()
  if (raw === "") return null

  const negative = raw.startsWith("-")
  const body = negative ? raw.slice(1) : raw
  if (body === "" || body.includes("-")) return null

  const hasDot = body.includes(".")
  const hasComma = body.includes(",")
  let entero: string
  let decimal: string

  if (hasDot && hasComma) {
    if (body.lastIndexOf(",") < body.lastIndexOf(".")) return null
    const idx = body.lastIndexOf(",")
    const enteroConPuntos = body.slice(0, idx)
    decimal = body.slice(idx + 1)
    if (!/^\d{1,3}(\.\d{3})*$/.test(enteroConPuntos) || !/^\d{1,2}$/.test(decimal)) return null
    entero = enteroConPuntos.replace(/\./g, "")
  } else if (hasDot) {
    const partes = body.split(".")
    if (partes.length === 2 && /^\d+$/.test(partes[0]) && /^\d{1,2}$/.test(partes[1])) {
      entero = partes[0]
      decimal = partes[1]
    } else {
      if (!/^\d{1,3}(\.\d{3})+$/.test(body)) return null
      entero = body.replace(/\./g, "")
      decimal = ""
    }
  } else if (hasComma) {
    const partes = body.split(",")
    if (partes.length !== 2 || !/^\d+$/.test(partes[0]) || !/^\d{1,2}$/.test(partes[1])) return null
    entero = partes[0]
    decimal = partes[1]
  } else {
    if (!/^\d+$/.test(body)) return null
    entero = body
    decimal = ""
  }

  const canonical = entero.replace(/^0+(?=\d)/, "")
  return negative ? `-${decimal === "" ? canonical : `${canonical}.${decimal}`}` : decimal === "" ? canonical : `${canonical}.${decimal}`
}

function fechaValida(year: number, month: number, day: number): IsoDate | null {
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  try {
    assertIsoDate(iso)
    return iso
  } catch {
    return null
  }
}

/** Excel `Date` (UTC parts), `DD/MM/AAAA` or `AAAA-MM-DD` -> `IsoDate | null`. */
export function parseFechaCelda(valor: unknown): IsoDate | null {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null
    return fechaValida(valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate())
  }
  if (typeof valor === "string") {
    const texto = valor.trim()
    const iso = ISO_DATE.exec(texto)
    if (iso) return fechaValida(Number(iso[1]), Number(iso[2]), Number(iso[3]))
    const dmy = DMY_DATE.exec(texto)
    if (dmy) return fechaValida(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))
  }
  return null
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

/**
 * A cell's value, with formulas resolved to their cached `.result` (which may
 * legitimately be `0` even when `cell.value` drops it). An error cell returns
 * its error code so the validators can report it as invalid input.
 */
function leerValor(cell: ExcelJS.Cell): string | number | Date | null {
  const value = cell.value
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  if (typeof value === "number" || typeof value === "string") return value
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE"

  if (typeof value === "object") {
    const candidate = value as {
      formula?: unknown
      sharedFormula?: unknown
      error?: unknown
      text?: unknown
      richText?: unknown
    }
    if ("formula" in candidate || "sharedFormula" in candidate) {
      const result = cell.result as unknown
      if (result === undefined || result === null) return null
      if (result instanceof Date) return result
      if (typeof result === "number" || typeof result === "string") return result
      return null
    }
    if (typeof candidate.error === "string") return candidate.error
    if (typeof candidate.text === "string") return candidate.text
    if (Array.isArray(candidate.richText)) {
      return (candidate.richText as { text?: string }[]).map((run) => run.text ?? "").join("")
    }
  }
  return null
}

type Columna = { encabezado: string; columna: string }

function columnasEncabezado(hoja: ExcelJS.Worksheet): Columna[] {
  const fila = hoja.getRow(1)
  const columnas: Columna[] = []
  for (let c = 1; c <= hoja.columnCount; c++) {
    const valor = leerValor(fila.getCell(c))
    columnas.push({ encabezado: valor === null ? "" : String(valor).trim(), columna: columnLetter(c) })
  }
  return columnas
}

/** Data rows a sheet drops at `MAX_FILAS_HOJA` (row 1 is the header). */
function excesoDeFilas(hoja: ExcelJS.Worksheet): number {
  return Math.max(0, hoja.actualRowCount - (MAX_FILAS_HOJA + 1))
}

function leerFilas(hoja: ExcelJS.Worksheet, columnas: Columna[]): Fila[] {
  const filas: Fila[] = []
  const ultima = Math.min(hoja.actualRowCount, MAX_FILAS_HOJA + 1)
  for (let r = 2; r <= ultima; r++) {
    const fila = hoja.getRow(r)
    const celdas: Record<string, Celda> = {}
    let tieneDatos = false
    columnas.forEach((col, i) => {
      const valor = leerValor(fila.getCell(i + 1))
      if (valor !== null && !(typeof valor === "string" && valor.trim() === "")) tieneDatos = true
      celdas[col.encabezado === "" ? col.columna : col.encabezado] = {
        hoja: hoja.name,
        fila: r,
        columna: col.columna,
        valor,
      }
    })
    if (tieneDatos) filas.push({ fila: r, celdas })
  }
  return filas
}

function celdaProyecto(hoja: ExcelJS.Worksheet | undefined, etiqueta: string): Celda {
  if (hoja) {
    const ultima = Math.min(hoja.actualRowCount, MAX_FILAS_HOJA + 1)
    for (let r = 2; r <= ultima; r++) {
      const fila = hoja.getRow(r)
      const label = leerValor(fila.getCell(1))
      if (typeof label === "string" && label.trim() === etiqueta) {
        return { hoja: hoja.name, fila: r, columna: "B", valor: leerValor(fila.getCell(2)) }
      }
    }
  }
  return { hoja: HOJAS.proyecto, fila: 0, columna: "B", valor: null }
}

/**
 * Reads a generated/filled template. Throws `PlantillaIlegible` when the
 * buffer cannot be opened as xlsx; a readable workbook missing sheets simply
 * yields empty collections (the structural validator reports the gaps).
 */
export async function parsePlantilla(buffer: Buffer | ArrayBuffer): Promise<ParsedTemplate> {
  const bytes = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(bytes as never)
  } catch {
    throw new PlantillaIlegible()
  }

  const nombres = new Set(workbook.worksheets.map((hoja) => hoja.name))
  const hojasPresentes = Object.values(HOJAS).filter((nombre) => nombres.has(nombre))

  const excesoFilas: Record<string, number> = {}
  const registrarExceso = (hoja: ExcelJS.Worksheet | undefined): void => {
    if (!hoja) return
    const exceso = excesoDeFilas(hoja)
    if (exceso > 0) excesoFilas[hoja.name] = exceso
  }

  const encabezados: Record<string, string[]> = {}
  for (const key of HOJAS_CON_ENCABEZADO) {
    const hoja = workbook.getWorksheet(HOJAS[key])
    if (hoja) encabezados[key] = columnasEncabezado(hoja).map((col) => col.encabezado)
  }

  const hojaProyecto = workbook.getWorksheet(HOJAS.proyecto)
  registrarExceso(hojaProyecto)
  const proyecto = {
    codigo: celdaProyecto(hojaProyecto, ETIQUETAS_PROYECTO.codigo),
    lineas: celdaProyecto(hojaProyecto, ETIQUETAS_PROYECTO.lineas),
    municipios: celdaProyecto(hojaProyecto, ETIQUETAS_PROYECTO.municipios),
    fechaInicio: celdaProyecto(hojaProyecto, ETIQUETAS_PROYECTO.fechaInicio),
    fechaFin: celdaProyecto(hojaProyecto, ETIQUETAS_PROYECTO.fechaFin),
    valorTotal: celdaProyecto(hojaProyecto, ETIQUETAS_PROYECTO.valorTotal),
    metaBeneficiarios: celdaProyecto(hojaProyecto, ETIQUETAS_PROYECTO.metaBeneficiarios),
  }

  const leerHoja = (key: "objetivos" | "actividades" | "entregables" | "indicadores" | "presupuesto"): Fila[] => {
    const hoja = workbook.getWorksheet(HOJAS[key])
    if (!hoja) return []
    registrarExceso(hoja)
    return leerFilas(hoja, columnasEncabezado(hoja))
  }

  const hojaProgramacion = workbook.getWorksheet(HOJAS.programacion)
  const meses: { encabezado: string; columna: string; periodo: Periodo | null }[] = []
  let filasProgramacion: Fila[] = []
  let excesoMeses = 0
  if (hojaProgramacion) {
    registrarExceso(hojaProgramacion)
    const columnas = columnasEncabezado(hojaProgramacion)
    const columnasMes = columnas.slice(2).filter((col) => MES_ENCABEZADO.test(col.encabezado))
    excesoMeses = Math.max(0, columnasMes.length - MAX_MESES)
    for (const col of columnasMes.slice(0, MAX_MESES)) {
      const match = MES_ENCABEZADO.exec(col.encabezado)
      if (match) meses.push({ encabezado: col.encabezado, columna: col.columna, periodo: match[2] })
    }
    filasProgramacion = leerFilas(hojaProgramacion, columnas)
  }

  const instrucciones = workbook.getWorksheet(HOJAS.instrucciones)
  const versionValor = instrucciones ? leerValor(instrucciones.getCell("B2")) : null

  return {
    version: versionValor === null ? null : String(versionValor),
    hojasPresentes,
    encabezados,
    proyecto,
    objetivos: leerHoja("objetivos"),
    actividades: leerHoja("actividades"),
    entregables: leerHoja("entregables"),
    indicadores: leerHoja("indicadores"),
    presupuesto: leerHoja("presupuesto"),
    programacion: { meses, filas: filasProgramacion },
    excesoFilas,
    excesoMeses,
  }
}
