/**
 * S7 (RF-03/RF-04) — the Excel template's canonical constants.
 *
 * Single source of truth for the eight sheet names, the header rows and the
 * import caps, shared by `generate.ts` (U1) and `parse.ts` (U2) and consumed by
 * the validators/UI (U3+). No `exceljs` import here, so the file stays
 * framework-free and safe to reference from a Node-only generator.
 */

/** Bumped whenever the template layout changes; the parser rejects mismatches. */
export const PLANTILLA_VERSION = "2026.2"

/**
 * The eight sheets, exact names, in the order they are written. T11 (S4) removed the monthly
 * programming sheet: programming is edited on the web, line by line (S8).
 */
export const HOJAS = {
  instrucciones: "1. Instrucciones",
  proyecto: "2. Proyecto",
  objetivos: "3. Objetivos",
  actividades: "4. Actividades",
  entregables: "5. Entregables",
  indicadores: "6. Indicadores",
  presupuesto: "7. Presupuesto",
  catalogos: "8. Catálogos",
} as const

/** Sheet 8 of the templates before T11 (version 2026.1); its presence marks the old layout (A2). */
export const HOJA_PROGRAMACION_ANTERIOR = "8. Programación"

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
    // AJ-02: the weight is the duration in weeks, so the sheet no longer asks for it. A template
    // filled in with the previous layout still imports (see ENCABEZADOS_ANTERIORES): its weight
    // column is accepted and never read.
  ],
  // PO 2026-10-23: the templates no longer ask for "Tipo de medio exigido" (Entregables)
  // nor "Unidad" (Indicadores).
  entregables: ["Código", "Código actividad", "Descripción", "Cantidad", "Unidad"],
  indicadores: ["Código", "Código objetivo", "Nombre", "Meta", "Línea base"],
  // T11 (S3): one row per activity + rubro combination.
  presupuesto: ["Código de actividad", "Rubro", "Valor"],
}

/**
 * The budget header of the templates before T11 (one row per rubro). Never accepted: a rubro-only
 * row cannot be placed on an activity, so V-01 names the new layout instead (A2).
 */
export const ENCABEZADOS_PRESUPUESTO_POR_RUBRO: readonly string[] = ["Código rubro", "Rubro", "Valor asignado"]

/** What V-01 tells the user of a template downloaded before T11. */
export const FORMATO_NUEVO_MENSAJE =
  `Descarga la plantilla nueva (versión ${PLANTILLA_VERSION}): la hoja 7. Presupuesto lleva una fila por actividad y rubro, ` +
  "con las columnas Código de actividad, Rubro y Valor, y la programación mensual ya no va en la plantilla: se edita en la web."

/**
 * Header rows of templates downloaded before 2026-10-26. They are still accepted so a
 * template filled in with the previous layout imports as before; their extra columns
 * are optional.
 */
export const ENCABEZADOS_ANTERIORES: Partial<Record<keyof typeof ENCABEZADOS, readonly string[]>> = {
  entregables: ["Código", "Código actividad", "Descripción", "Cantidad", "Unidad", "Tipo de medio exigido"],
  indicadores: ["Código", "Código objetivo", "Nombre", "Meta", "Unidad", "Línea base"],
  // AJ-02: before the weight became the duration in weeks, the sheet asked for it.
  actividades: [
    "Código",
    "Código objetivo",
    "Nombre",
    "Semana inicio",
    "Semana fin",
    "Responsable (correo)",
    "Peso (opcional)",
  ],
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

/** Sheet 8 column headers; the ranges feed the named ranges and dropdowns. */
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
