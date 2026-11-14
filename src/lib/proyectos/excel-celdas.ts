/**
 * Cell and rubro helpers shared by the Excel imports (structure, expenses): read a cell
 * as a plain value, normalize text for matching, parse an amount as exact cents and
 * index the rubro catalog by name and code.
 *
 * Pure and Node-only (`exceljs`).
 */
import type ExcelJS from "exceljs"
import { parseMontoInput } from "@/components/proyectos/presupuesto-ui"
import { toCents, type Cents } from "./money"

export type RubroCatalogo = { id: string; codigo: string | null; nombre: string }

/** Largest amount a `Decimal(15,2)` column holds (mirrors `MONTO_MAXIMO_CENTS` in `src/lib/api/presupuesto.ts`). */
const MONTO_MAXIMO_CENTS = toCents("9999999999999.99")

export const ARCHIVO_ILEGIBLE = "El archivo no es un archivo de Excel válido."

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

export type ValorCelda = string | number | Date | boolean | null

/** A cell's value, with formulas resolved to their cached result and rich text joined. */
export function leerCelda(cell: ExcelJS.Cell): ValorCelda {
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

export function vacio(valor: ValorCelda): boolean {
  return valor === null || (typeof valor === "string" && valor.trim() === "")
}

/** Index of the catalog by normalized name and by code. */
export function indiceCatalogo(rubros: readonly RubroCatalogo[]): Map<string, RubroCatalogo> {
  const indice = new Map<string, RubroCatalogo>()
  for (const rubro of rubros) {
    indice.set(normalizarTexto(rubro.nombre), rubro)
    if (rubro.codigo) indice.set(normalizarTexto(rubro.codigo), rubro)
  }
  return indice
}
