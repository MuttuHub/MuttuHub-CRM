/**
 * S7 (RF-03/RF-04) — the Excel template's canonical constants.
 *
 * Single source of truth for the nine sheet names, the header rows and the
 * import caps, shared by `generate.ts` (U1) and `parse.ts` (U2) and consumed by
 * the validators/UI (U3+). No `exceljs` import here, so the file stays
 * framework-free and safe to reference from a Node-only generator.
 */

/** Bumped whenever the template layout changes; the parser rejects mismatches. */
export const PLANTILLA_VERSION = "2026.1"

/** The nine sheets, exact names, in the order they are written. */
export const HOJAS = {
  instrucciones: "1. Instrucciones",
  proyecto: "2. Proyecto",
  objetivos: "3. Objetivos",
  actividades: "4. Actividades",
  entregables: "5. Entregables",
  indicadores: "6. Indicadores",
  presupuesto: "7. Presupuesto",
  programacion: "8. Programación",
  catalogos: "9. Catálogos",
} as const

export type HojaKey = keyof typeof HOJAS

/** Data-sheet header rows (map §5), trimmed comparison happens in the parser. */
export const ENCABEZADOS: Record<
  "objetivos" | "actividades" | "entregables" | "indicadores" | "presupuesto",
  readonly string[]
> = {
  objetivos: ["Código", "Descripción"],
  actividades: [
    "Código",
    "Código objetivo",
    "Nombre",
    "Semana inicio",
    "Semana fin",
    "Responsable (correo)",
    "Peso (opcional)",
  ],
  entregables: ["Código", "Código actividad", "Descripción", "Cantidad", "Unidad", "Tipo de medio exigido"],
  indicadores: ["Código", "Código objetivo", "Nombre", "Meta", "Unidad", "Línea base"],
  presupuesto: ["Código rubro", "Rubro", "Valor asignado"],
}

export const ENCABEZADO_PROYECTO = ["Campo", "Valor"] as const

/** Sheet 2 rows, in order; the parser matches them by label, not by index. */
export const ETIQUETAS_PROYECTO = [
  "Código",
  "Cliente",
  "Líneas estratégicas",
  "Municipios",
  "Fecha de inicio",
  "Fecha de fin",
  "Valor total",
  "Meta de beneficiarios",
] as const

export const ENCABEZADOS_PROGRAMACION = {
  codigoRubro: "Código rubro",
  rubro: "Rubro",
  total: "Total",
  control: "Control",
} as const

/** Sheet 9 column headers; the ranges feed the named ranges and dropdowns. */
export const CATALOGOS = {
  rubros: "Rubros",
  lineas: "Líneas estratégicas",
  municipios: "Municipios",
  unidades: "Unidades",
} as const

/** Named-range names (map §2), reused by the data validations. */
export const NOMBRES_RANGO = {
  rubros: "Rubros",
  lineas: "Lineas",
  municipios: "Municipios",
  unidades: "Unidades",
} as const

/**
 * Suggested units for the `Unidad` columns. Free text stays valid: the
 * dropdown is a warning-style list (`showErrorMessage = false`), because the
 * DB stores `unidad` as free text.
 */
export const UNIDADES_SUGERIDAS: readonly string[] = [
  "Personas",
  "Unidades",
  "Informe",
  "Memoria",
  "Mapa",
  "Acta",
  "Estatuto",
  "Certificado",
  "RUT",
  "Documento",
  "Registro",
  "Kit",
  "Taller",
  "Jornada",
  "Servicio",
]

/** Hard multipart cap for the import route (D-6 / Vercel body limit). */
export const IMPORT_MAX_BYTES = 4 * 1024 * 1024

/** Data rows read per sheet; anything beyond is ignored (DoS guard). */
export const MAX_FILAS_HOJA = 1000

/** User-facing validation errors kept before truncating the report. */
export const MAX_ERRORES = 500
