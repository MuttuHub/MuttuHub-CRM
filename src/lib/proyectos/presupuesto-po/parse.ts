/**
 * Reads the PO's simple budget workbook (`rubro | valor (COP)`) into rows matched
 * against the rubro catalog (decisions T4/T6 of the v2 launch: only rubro and
 * value, no codes typed by the PO, rubros matched by normalized name).
 *
 * Pure and Node-only (`exceljs`, same boundary as `../plantilla/parse.ts`). The
 * caller passes the catalog it accepts (the API passes the ACTIVE rubros), so a
 * name outside it is an unknown rubro. Amounts are exact cents (`bigint`): a
 * numeric cell or es-CO text (`1.500.000,50`); an empty cell is $0.
 */
import ExcelJS from "exceljs"
import { parseMontoInput } from "@/components/proyectos/presupuesto-ui"
import { sumCents, toCents, type Cents } from "../money"

export type RubroCatalogo = { id: string; codigo: string | null; nombre: string }

export type FilaPresupuestoPO = {
  /** Excel row number (1-based). */
  fila: number
  /** The rubro name as written in the file. */
  rubroTexto: string
  rubroId: string | null
  cents: Cents | null
  error: string | null
}

export type ResultadoPresupuestoPO = {
  filas: FilaPresupuestoPO[]
  /** Errors of the whole file (unreadable, no headers, too many rows); `filas` is empty then. */
  erroresArchivo: string[]
  /** Sum and count of the valid rows; `errores` counts the rows with an error. */
  resumen: { sumaCents: Cents; rubros: number; errores: number }
}

/** Data rows read after the header; a longer sheet is a file error (DoS guard). */
export const MAX_FILAS_PRESUPUESTO_PO = 100
/** Rows scanned from the top of each sheet looking for the header row. */
const FILAS_BUSQUEDA_ENCABEZADO = 10
/** Columns scanned in each row. */
const MAX_COLUMNAS = 20
/** Largest amount a `Decimal(15,2)` column holds (mirrors `MONTO_MAXIMO_CENTS` in `src/lib/api/presupuesto.ts`). */
const MONTO_MAXIMO_CENTS = toCents("9999999999999.99")

export const ARCHIVO_ILEGIBLE = "El archivo no es un archivo de Excel válido."
export const SIN_ENCABEZADOS =
  "No encontramos las columnas «Rubro» y «Valor (COP)». Usa la plantilla: la primera fila con datos debe tener esos dos encabezados."

const ZERO = toCents("0")

/** `"  Promoción   y DIVULGACIÓN."` -> `"promocion y divulgacion"`. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

type ValorCelda = string | number | Date | boolean | null

/** A cell's value, with formulas resolved to their cached result and rich text joined. */
function leerCelda(cell: ExcelJS.Cell): ValorCelda {
  const value = cell.value
  if (value === null || value === undefined) return null
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  if (value instanceof Date) return value
  if (typeof value === "object") {
    const v = value as { formula?: unknown; sharedFormula?: unknown; result?: unknown; error?: unknown; text?: unknown; richText?: unknown }
    if ("formula" in v || "sharedFormula" in v) {
      const result = v.result
      if (typeof result === "number" || typeof result === "string") return result
      if (result && typeof result === "object" && "error" in result) return String((result as { error: unknown }).error)
      return null
    }
    if (typeof v.error === "string") return v.error
    if (typeof v.text === "string") return v.text
    if (Array.isArray(v.richText)) return (v.richText as { text?: string }[]).map((run) => run.text ?? "").join("")
  }
  return null
}

type Monto = { ok: true; cents: Cents } | { ok: false; message: string }

const MONTO_INVALIDO = "El valor no es un monto válido: usa números sin letras, con punto de miles y coma decimal (1.500.000,50)."
const MONTO_NEGATIVO = "El valor no puede ser negativo."
const MONTO_ALTO = "El valor es demasiado alto."

function dentroDelMaximo(cents: Cents): Monto {
  return cents > MONTO_MAXIMO_CENTS ? { ok: false, message: MONTO_ALTO } : { ok: true, cents }
}

/** A value cell to exact cents: numeric, es-CO text (`$` allowed) or empty ($0). */
export function parseMontoCelda(valor: ValorCelda): Monto {
  if (valor === null) return { ok: true, cents: ZERO }
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return { ok: false, message: MONTO_INVALIDO }
    if (valor < 0) return { ok: false, message: MONTO_NEGATIVO }
    if (valor > 1e15) return { ok: false, message: MONTO_ALTO }
    const redondeado = Math.round(valor * 100) / 100
    // More than two decimals is a typo, not something to round silently.
    if (Math.abs(redondeado - valor) > 1e-6) return { ok: false, message: MONTO_INVALIDO }
    return dentroDelMaximo(toCents(redondeado.toFixed(2)))
  }
  if (typeof valor !== "string") return { ok: false, message: MONTO_INVALIDO }

  const texto = valor.replace(/\$|COP/gi, "").replace(/\s+/g, "")
  if (texto === "") return { ok: true, cents: ZERO }
  if (texto.startsWith("-")) {
    return parseMontoInput(texto.slice(1)) === null
      ? { ok: false, message: MONTO_INVALIDO }
      : { ok: false, message: MONTO_NEGATIVO }
  }
  const decimal = parseMontoInput(texto)
  if (decimal === null) return { ok: false, message: MONTO_INVALIDO }
  return dentroDelMaximo(toCents(decimal))
}

function esEncabezadoRubro(texto: string): boolean {
  return texto === "rubro" || texto === "rubros" || texto.startsWith("rubro ")
}

function esEncabezadoValor(texto: string): boolean {
  return /^(valor|valores|monto|montos)( |$)/.test(texto)
}

type Encabezado = { hoja: ExcelJS.Worksheet; fila: number; colRubro: number; colValor: number }

function buscarEncabezado(hoja: ExcelJS.Worksheet): Encabezado | null {
  const ultima = Math.min(hoja.rowCount, FILAS_BUSQUEDA_ENCABEZADO)
  for (let r = 1; r <= ultima; r++) {
    const fila = hoja.getRow(r)
    let colRubro = 0
    let colValor = 0
    for (let c = 1; c <= MAX_COLUMNAS; c++) {
      const valor = leerCelda(fila.getCell(c))
      if (typeof valor !== "string") continue
      const texto = normalizarTexto(valor)
      if (!colRubro && esEncabezadoRubro(texto)) colRubro = c
      else if (!colValor && esEncabezadoValor(texto)) colValor = c
    }
    if (colRubro && colValor) return { hoja, fila: r, colRubro, colValor }
  }
  return null
}

function vacio(valor: ValorCelda): boolean {
  return valor === null || (typeof valor === "string" && valor.trim() === "")
}

function resultadoArchivo(error: string): ResultadoPresupuestoPO {
  return { filas: [], erroresArchivo: [error], resumen: { sumaCents: ZERO, rubros: 0, errores: 0 } }
}

/** Index of the catalog by normalized name and by code. */
function indiceCatalogo(rubros: readonly RubroCatalogo[]): Map<string, RubroCatalogo> {
  const indice = new Map<string, RubroCatalogo>()
  for (const rubro of rubros) {
    indice.set(normalizarTexto(rubro.nombre), rubro)
    if (rubro.codigo) indice.set(normalizarTexto(rubro.codigo), rubro)
  }
  return indice
}

/**
 * Reads the first sheet that has the `Rubro` and `Valor` headers (in any of the
 * first rows, in any column order) and matches each data row to `rubros`.
 * Empty rows and a `Total` row are skipped. Never throws on bad input: an
 * unreadable workbook or missing headers come back in `erroresArchivo`.
 */
export async function parsePresupuestoPO(
  bytes: Buffer | Uint8Array | ArrayBuffer,
  rubros: readonly RubroCatalogo[],
): Promise<ResultadoPresupuestoPO> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(bytes as never)
  } catch {
    return resultadoArchivo(ARCHIVO_ILEGIBLE)
  }

  let encabezado: Encabezado | null = null
  for (const hoja of workbook.worksheets) {
    encabezado = buscarEncabezado(hoja)
    if (encabezado) break
  }
  if (!encabezado) return resultadoArchivo(SIN_ENCABEZADOS)

  const { hoja, colRubro, colValor } = encabezado
  const primera = encabezado.fila + 1
  const datos: { fila: number; rubro: ValorCelda; valor: ValorCelda }[] = []
  for (let r = primera; r <= hoja.rowCount; r++) {
    const fila = hoja.getRow(r)
    const rubro = leerCelda(fila.getCell(colRubro))
    const valor = leerCelda(fila.getCell(colValor))
    if (vacio(rubro) && vacio(valor)) continue
    if (typeof rubro === "string" && normalizarTexto(rubro) === "total") continue
    if (datos.length === MAX_FILAS_PRESUPUESTO_PO) {
      return resultadoArchivo(`El archivo tiene más de ${MAX_FILAS_PRESUPUESTO_PO} filas con datos: usa la plantilla de presupuesto.`)
    }
    datos.push({ fila: r, rubro, valor })
  }

  const indice = indiceCatalogo(rubros)
  const vistos = new Map<string, number>()
  const filas = datos.map(({ fila, rubro, valor }): FilaPresupuestoPO => {
    const rubroTexto = vacio(rubro) ? "" : String(rubro).trim()
    const monto = parseMontoCelda(valor)
    const base = { fila, rubroTexto, cents: monto.ok ? monto.cents : null }

    if (rubroTexto === "") return { ...base, rubroId: null, error: "Falta el nombre del rubro." }
    const encontrado = indice.get(normalizarTexto(rubroTexto))
    if (!encontrado) {
      return { ...base, rubroId: null, error: `No encontramos el rubro «${rubroTexto}» en el catálogo.` }
    }
    const repetido = vistos.get(encontrado.id)
    if (repetido !== undefined) {
      return { ...base, rubroId: encontrado.id, error: `El rubro ${encontrado.nombre} está repetido (ya aparece en la fila ${repetido}).` }
    }
    vistos.set(encontrado.id, fila)
    return { ...base, rubroId: encontrado.id, error: monto.ok ? null : monto.message }
  })

  const validas = filas.filter((f) => f.error === null)
  return {
    filas,
    erroresArchivo: [],
    resumen: {
      sumaCents: sumCents(validas.map((f) => f.cents as Cents)),
      rubros: validas.length,
      errores: filas.length - validas.length,
    },
  }
}
