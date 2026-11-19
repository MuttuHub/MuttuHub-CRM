/**
 * Reads the expenses workbook (one row per distribution line, B8) into rows that follow the SAME rules as the
 * single-expense form: `GASTO_FILA_SCHEMA` (required texts and limits), `evaluarMontosGasto` (Subtotal > 0,
 * IVA >= 0 and may be 0, max two decimals), a rubro with an assigned value and `evaluarPeriodo` (a month of the
 * project). The file carries no support: those come separately (S2).
 *
 * S9/T14.3: the sheet also names the «Código de actividad» of each row, so the pair activity + rubro pins ONE
 * budget line of the project, and the rows of one document — same normalized third-party id and document number —
 * are read as ONE distributed invoice, never as duplicates: their amounts must add up to the «Total» the document
 * states. An invoice with any bad row, or whose rows do not add up, is rejected as a whole.
 *
 * Pure and Node-only (`exceljs`, same boundary as `../excel-celdas.ts`, whose cell and rubro
 * helpers it reuses). The caller passes everything the rules need (`ContextoImportGastos`), so there
 * is no database access here. Never throws on bad input: file-level problems come back in
 * `erroresArchivo` and row problems in each row's `error`.
 */
import ExcelJS from "exceljs"
import {
  GASTO_FILA_SCHEMA,
  IVA_NEGATIVO_MESSAGE,
  REPARTO_SUMA_MESSAGE,
  RUBRO_SIN_ASIGNADO_MESSAGE,
  clavesNormalizadas,
  evaluarPeriodo,
  evaluarMontosGasto,
  type GastoProyecto,
} from "@/lib/api/gastos"
import { rubroDeshabilitadoMessage } from "@/lib/api/rubros-proyecto"
import { formatCOP, fromCents, sumCents, type Cents } from "../money"
import {
  ARCHIVO_ILEGIBLE,
  indiceCatalogo,
  leerCelda,
  normalizarTexto,
  parseMontoCelda,
  vacio,
  type RubroCatalogo,
  type ValorCelda,
} from "../excel-celdas"

export { ARCHIVO_ILEGIBLE }

/** Data rows read after the header; a longer sheet is a file error (DoS guard). */
export const MAX_FILAS_GASTOS = 200
/** Rows scanned from the top of each sheet looking for the header row. */
const FILAS_BUSQUEDA_ENCABEZADO = 10
/** Columns scanned in each row. */
const MAX_COLUMNAS = 20

/** S9: a distribution of several rows has to state the total of its document on the first row. */
export const SIN_TOTAL_DISTRIBUCION_MESSAGE = "«Total»: escribe el total de la factura que reparten sus filas."
/** S9: one document has one date, one period and one support type, whatever its distribution. */
export const FACTURA_NO_COINCIDE_MESSAGE =
  "Las filas de una misma factura deben coincidir en la fecha, el periodo y el tipo de soporte."
/** S9: half an invoice is never written: one bad row takes the whole document with it. */
export const facturaIncompleta = (fila: number) =>
  `La fila ${fila} de esta factura tiene un error: corrige la factura completa.`
/** The pre-AJ-04 template had a single «Valor (COP)» column: it is never read as Subtotal with IVA 0. */
export const PLANTILLA_ANTERIOR_MESSAGE = "Esta plantilla es anterior: descarga la nueva, que separa Subtotal e IVA."
export const SIN_FILAS_GASTOS = "El archivo no tiene filas con datos: agrega al menos un gasto debajo de los encabezados."

/**
 * Headers of the template, in order. Required: Rubro, Fecha, Tipo de soporte, Tercero, Número de documento,
 * Descripción, Subtotal and IVA. «Código de actividad» (S9/T14.3) goes last and is optional as a header, so a
 * file written with the previous template still imports exactly as before.
 */
export const ENCABEZADOS_GASTOS = [
  "Rubro",
  "Fecha del documento",
  "Tipo de soporte",
  "Tercero",
  "Tipo de identificación",
  "Número de identificación",
  "Número de documento",
  "Descripción",
  "Subtotal",
  "IVA",
  "Total",
  "Periodo",
  "Enlace del soporte",
  "Código de actividad",
] as const

type Campo =
  | "rubro"
  | "fecha"
  | "tipoSoporte"
  | "tercero"
  | "tipoId"
  | "numeroId"
  | "numeroDocumento"
  | "descripcion"
  | "subtotal"
  | "iva"
  | "total"
  | "periodo"
  /** AJ-06 (S2, S3), optional: one or more links, separated by `;`, each http(s)://. */
  | "enlaces"
  /** S9/T14.3, optional: the código (or the name) of the activity the row belongs to. */
  | "actividad"
  /** Header only: the old single amount column, which makes the file an old template. */
  | "valorAnterior"

/** Accepted spellings of each header, normalized (`normalizarTexto`). */
const ALIAS: Record<Campo, readonly string[]> = {
  rubro: ["rubro"],
  fecha: ["fecha del documento", "fecha documento", "fecha"],
  tipoSoporte: ["tipo de soporte", "tipo soporte"],
  tercero: ["tercero", "nombre del tercero", "proveedor"],
  tipoId: ["tipo de identificacion", "tipo identificacion"],
  numeroId: ["numero de identificacion", "numero identificacion", "identificacion"],
  numeroDocumento: ["numero de documento", "numero documento", "documento"],
  descripcion: ["descripcion"],
  subtotal: ["subtotal", "sub total"],
  iva: ["iva"],
  total: ["total", "total cop"],
  valorAnterior: ["valor cop", "valor", "monto"],
  periodo: ["periodo"],
  enlaces: ["enlace del soporte", "enlace de soporte", "enlaces del soporte", "enlaces"],
  actividad: ["codigo de actividad", "codigo actividad", "codigo de la actividad", "actividad"],
}

const ETIQUETA: Record<Campo, string> = {
  rubro: "Rubro",
  fecha: "Fecha del documento",
  tipoSoporte: "Tipo de soporte",
  tercero: "Tercero",
  tipoId: "Tipo de identificación",
  numeroId: "Número de identificación",
  numeroDocumento: "Número de documento",
  descripcion: "Descripción",
  subtotal: "Subtotal",
  iva: "IVA",
  total: "Total",
  valorAnterior: "Valor (COP)",
  periodo: "Periodo",
  enlaces: "Enlace del soporte",
  actividad: "Código de actividad",
}

const OBLIGATORIOS: readonly Campo[] = ["rubro", "fecha", "tipoSoporte", "tercero", "numeroDocumento", "descripcion", "subtotal", "iva"]

/** The columns that carry row data (the old amount column is only a header marker). */
const CAMPOS_DATOS = (Object.keys(ALIAS) as Campo[]).filter((campo) => campo !== "valorAnterior")

const TIPOS_SOPORTE: Record<string, string> = {
  "factura de proveedor": "FACTURA_PROVEEDOR",
  "factura proveedor": "FACTURA_PROVEEDOR",
  factura: "FACTURA_PROVEEDOR",
  "cuenta de cobro persona natural": "CUENTA_COBRO_PERSONA_NATURAL",
  "cuenta de cobro de persona natural": "CUENTA_COBRO_PERSONA_NATURAL",
  "cuenta cobro persona natural": "CUENTA_COBRO_PERSONA_NATURAL",
  "cuenta de cobro": "CUENTA_COBRO_PERSONA_NATURAL",
  otro: "OTRO",
}

const TIPOS_ID: Record<string, string> = {
  nit: "NIT",
  cc: "CC",
  "cedula de ciudadania": "CC",
  ce: "CE",
  "cedula de extranjeria": "CE",
}

export type ContextoImportGastos = {
  proyecto: Pick<GastoProyecto, "fecha_inicio" | "fecha_fin">
  /** Rubros a name in the file may match (the caller passes the active catalog plus the project's own). */
  rubros: readonly RubroCatalogo[]
  /**
   * S9/T14.3: the budget lines of the project, one per activity + rubro. A row that names its activity pins the
   * line of that pair; a row without an activity resolves through its rubro alone, as the file did before.
   */
  lineas: readonly LineaPresupuestoImport[]
  /** B6: ids of the rubros disabled for this project; a row on one is refused with the reason. */
  deshabilitados?: ReadonlySet<string>
}

/** S9/T14.3: one budget line of the project, with the activity it belongs to. */
export type LineaPresupuestoImport = {
  id: string
  rubro_id: string
  /** Código of the activity of the line; null on a legacy line («Sin actividad», D4). */
  actividad_codigo: string | null
  /** Name of the activity: accepted in the column where its código goes. */
  actividad_nombre: string | null
  /** The line takes expenses only while its assigned amount is above zero. */
  asignado: boolean
}

/** What one valid row writes: the fields of a single expense, the amount in exact cents. */
type DatosGastoImport = {
  rubro_id: string
  /** S9/T14.3: the budget line (activity + rubro) the row resolves to; it is its distribution row. */
  linea_id: string
  /** The «Total» as written: the total of the document this row belongs to, or null when the cell is empty. */
  total_documento: Cents | null
  fecha_documento: string
  periodo: string
  tipo_soporte: "FACTURA_PROVEEDOR" | "CUENTA_COBRO_PERSONA_NATURAL" | "OTRO"
  tercero_nombre: string
  tercero_tipo_id: "NIT" | "CC" | "CE" | null
  tercero_numero_id: string | null
  numero_documento: string
  descripcion: string
  subtotal: Cents
  iva: Cents
  /** The Total of THIS row (Subtotal + IVA): its share of the invoice. */
  cents: Cents
  /** AJ-06 (S2, S3): the valid http(s) links read from «Enlace del soporte», empty when the cell is blank. */
  enlaces: string[]
}

/** One document of the file: a single-row invoice, or one distributed across several rows (S9/T14.3). */
export type DatosFacturaImport = {
  fecha_documento: string
  periodo: string
  tipo_soporte: "FACTURA_PROVEEDOR" | "CUENTA_COBRO_PERSONA_NATURAL" | "OTRO"
  tercero_nombre: string
  tercero_tipo_id: "NIT" | "CC" | "CE" | null
  tercero_numero_id: string | null
  numero_documento: string
  descripcion: string
  /** Sum of the subtotals of its rows. */
  subtotal: Cents
  /** Sum of the IVA of its rows. */
  iva: Cents
  /** The total of the invoice (subtotal + IVA): the sum its rows must add up to. */
  cents: Cents
  /** The distribution: one row per Excel row, in file order; the first one is the line of the header. */
  /** EV-05: each line with its share of the total and of the IVA (the rows' own IVA). */
  repartos: readonly { linea_id: string; valor: Cents; iva: Cents }[]
  /** The support links of every row, once each, in file order. */
  enlaces: string[]
}

export type FacturaGastoImport = {
  /** Excel rows of the document, in file order; the first one carries the identity of the header. */
  filas: number[]
  /** Null when the invoice (or one of its rows) is invalid: nothing of it is written. */
  datos: DatosFacturaImport | null
  error: string | null
}

export type FilaGastoImport = {
  /** Excel row number (1-based). */
  fila: number
  /** The rubro as written in the file. */
  rubroTexto: string
  rubroId: string | null
  /** The activity as written in the file (empty when the column is missing or the cell is blank). */
  actividadTexto: string
  /** Null when the row has an error. */
  datos: DatosGastoImport | null
  error: string | null
}

export type ResultadoGastosImport = {
  filas: FilaGastoImport[]
  /** S9/T14.3: the documents of the file, one per tercero + número de documento, in file order. */
  facturas: FacturaGastoImport[]
  /** Errors of the whole file (unreadable, missing headers, no rows, too many rows); `filas` is empty then. */
  erroresArchivo: string[]
  resumen: { validas: number; errores: number }
}

function resultadoArchivo(error: string): ResultadoGastosImport {
  return { filas: [], facturas: [], erroresArchivo: [error], resumen: { validas: 0, errores: 0 } }
}

type Encabezado = { hoja: ExcelJS.Worksheet; fila: number; columnas: Partial<Record<Campo, number>> }

function buscarEncabezado(workbook: ExcelJS.Workbook): {
  encabezado: Encabezado | null
  faltan: Campo[]
  /** A header row has the old «Valor (COP)» column and no «Subtotal»: the pre-AJ-04 template. */
  anterior: boolean
} {
  let anterior = false
  let mejor: Encabezado | null = null
  let mejorFaltan: Campo[] = [...OBLIGATORIOS]
  for (const hoja of workbook.worksheets) {
    const ultima = Math.min(hoja.rowCount, FILAS_BUSQUEDA_ENCABEZADO)
    for (let r = 1; r <= ultima; r++) {
      const columnas: Partial<Record<Campo, number>> = {}
      for (let c = 1; c <= MAX_COLUMNAS; c++) {
        const valor = leerCelda(hoja.getRow(r).getCell(c))
        if (typeof valor !== "string") continue
        const texto = normalizarTexto(valor)
        const campo = (Object.keys(ALIAS) as Campo[]).find((k) => !columnas[k] && ALIAS[k].includes(texto))
        if (campo) columnas[campo] = c
      }
      if (columnas.valorAnterior && !columnas.subtotal) anterior = true
      const faltan = OBLIGATORIOS.filter((campo) => !columnas[campo])
      if (faltan.length === 0) return { encabezado: { hoja, fila: r, columnas }, faltan: [], anterior: false }
      if (faltan.length < mejorFaltan.length) {
        mejor = { hoja, fila: r, columnas }
        mejorFaltan = faltan
      }
    }
  }
  return { encabezado: mejor && mejorFaltan.length === 0 ? mejor : null, faltan: mejorFaltan, anterior }
}

const comillas = (campos: readonly Campo[]) => campos.map((c) => `«${ETIQUETA[c]}»`).join(", ")

/** A cell as the trimmed text the form would have received; numbers keep their integer digits. */
function textoDe(valor: ValorCelda): string | undefined {
  if (valor === null) return undefined
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)
  const texto = String(valor)
  const limpio = texto.trim()
  return limpio === "" ? undefined : limpio
}

/** ISO date from a Date cell, `AAAA-MM-DD` or `DD/MM/AAAA`; anything else goes through as typed (the schema rejects it). */
function fechaDe(valor: ValorCelda): string | undefined {
  const texto = textoDe(valor)
  if (texto === undefined) return undefined
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texto)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`
  return texto
}

function periodoDe(valor: ValorCelda): string | undefined {
  if (valor instanceof Date) return valor.toISOString().slice(0, 7)
  return textoDe(valor)
}

function mapear(valor: ValorCelda, tabla: Record<string, string>): string | undefined {
  const texto = textoDe(valor)
  if (texto === undefined) return undefined
  return tabla[normalizarTexto(texto)] ?? texto
}

type FilaCruda = { fila: number } & Record<Exclude<Campo, "valorAnterior">, ValorCelda>

const enColumna = (campo: Campo, mensaje: string) => `«${ETIQUETA[campo]}»: ${mensaje}`
const IVA_VACIO_MESSAGE = "Ingresa el IVA (puede ser 0)."
const ACTIVIDAD_NO_TEXTO_MESSAGE = enColumna(
  "actividad",
  "escríbelo como texto (por ejemplo 1.10); Excel lo convirtió en número o fecha.",
)

type MontosFila =
  | { ok: true; subtotal: Cents; iva: Cents; total: Cents; totalDocumento: Cents | null }
  | { ok: false; message: string }

/**
 * Subtotal and IVA through the same rules as the single expense (`evaluarMontosGasto`); the IVA must be
 * written (an empty cell is an error, 0 is fine) and the optional «Total» must be a well formed amount.
 *
 * S9/T14.3: «Total» is the total of the DOCUMENT, so it is not compared here against Subtotal + IVA of one
 * row — a distributed invoice states it once, on its first row, and every row must add up to it. That check
 * is the invoice's (`cerrarFactura`), which keeps the pre-existing rule for a one-row document intact.
 * Every message names its column; the caller reports it with the Excel row.
 */
function leerMontos(cruda: FilaCruda): MontosFila {
  const subtotal = parseMontoCelda(cruda.subtotal)
  if (!subtotal.ok) return { ok: false, message: enColumna("subtotal", subtotal.message) }
  if (vacio(cruda.iva)) return { ok: false, message: enColumna("iva", IVA_VACIO_MESSAGE) }
  const iva = parseMontoCelda(cruda.iva)
  if (!iva.ok) return { ok: false, message: enColumna("iva", iva.message.includes("negativo") ? IVA_NEGATIVO_MESSAGE : iva.message) }
  const evaluados = evaluarMontosGasto(fromCents(subtotal.cents), fromCents(iva.cents))
  if (!evaluados.ok) {
    return { ok: false, message: enColumna(evaluados.campo === "Subtotal" ? "subtotal" : evaluados.campo === "IVA" ? "iva" : "total", evaluados.message) }
  }
  let totalDocumento: Cents | null = null
  if (!vacio(cruda.total)) {
    const total = parseMontoCelda(cruda.total)
    if (!total.ok) return { ok: false, message: enColumna("total", total.message) }
    totalDocumento = total.cents
  }
  return { ...evaluados, totalDocumento }
}

type EnlacesFila = { ok: true; enlaces: string[] } | { ok: false; message: string }

/**
 * AJ-06 (S2, S3): several links in the same cell, separated by `;`; each non-empty piece must start
 * with http:// or https:// (case-insensitive).
 *
 * S2/T6: the template carries no file column, so the link is the only support an imported row can hold
 * and the row is rejected without it. A file exported before AJ-06 has no such column, so every one of
 * its rows now falls on this rule.
 */
function leerEnlaces(valor: ValorCelda): EnlacesFila {
  const texto = textoDe(valor)
  const piezas = (texto ?? "")
    .split(";")
    .map((pieza) => pieza.trim())
    .filter((pieza) => pieza !== "")
  if (piezas.length === 0) return { ok: false, message: enColumna("enlaces", "es obligatorio.") }
  for (const pieza of piezas) {
    if (!/^https?:\/\//i.test(pieza)) {
      return { ok: false, message: enColumna("enlaces", `"${pieza}" no empieza por http:// o https://.`) }
    }
  }
  return { ok: true, enlaces: piezas }
}

type IndiceLineas = {
  /** Every line of a rubro, assigned or not. */
  porRubro: Map<string, LineaPresupuestoImport[]>
  /** Every line whose activity código or name matches, normalized. */
  porActividad: Map<string, LineaPresupuestoImport[]>
}

function acumularLinea(mapa: Map<string, LineaPresupuestoImport[]>, clave: string, linea: LineaPresupuestoImport) {
  const actuales = mapa.get(clave)
  if (actuales) actuales.push(linea)
  else mapa.set(clave, [linea])
}

function indiceLineas(lineas: readonly LineaPresupuestoImport[]): IndiceLineas {
  const porRubro = new Map<string, LineaPresupuestoImport[]>()
  const porActividad = new Map<string, LineaPresupuestoImport[]>()
  for (const linea of lineas) {
    acumularLinea(porRubro, linea.rubro_id, linea)
    if (linea.actividad_codigo) acumularLinea(porActividad, normalizarTexto(linea.actividad_codigo), linea)
    if (linea.actividad_nombre) acumularLinea(porActividad, normalizarTexto(linea.actividad_nombre), linea)
  }
  return { porRubro, porActividad }
}

type LineaResuelta = { ok: true; linea: LineaPresupuestoImport } | { ok: false; error: string }

/**
 * S9/T14.3: the line a row writes to. With an activity, the pair activity + rubro pins it; without one, the
 * rubro alone does — and only while exactly one of its lines has an assigned amount, because guessing between
 * two activities is how a distribution ends up on the wrong one. The last case asks for the activity out loud.
 */
function lineaDeLaFila(rubro: RubroCatalogo, actividadTexto: string, indice: IndiceLineas): LineaResuelta {
  let candidatas: readonly LineaPresupuestoImport[]
  if (actividadTexto === "") {
    candidatas = indice.porRubro.get(rubro.id) ?? []
  } else {
    const conocidas = indice.porActividad.get(normalizarTexto(actividadTexto))
    if (!conocidas) {
      return { ok: false, error: enColumna("actividad", `no encontramos la actividad «${actividadTexto}» en el proyecto.`) }
    }
    candidatas = conocidas.filter((linea) => linea.rubro_id === rubro.id)
  }
  const asignadas = candidatas.filter((linea) => linea.asignado)
  if (asignadas.length === 0) return { ok: false, error: RUBRO_SIN_ASIGNADO_MESSAGE }
  if (asignadas.length > 1) {
    return { ok: false, error: enColumna("actividad", "el rubro está en varias actividades: escribe el código de la que corresponde.") }
  }
  return { ok: true, linea: asignadas[0] }
}

/**
 * The document key of a raw row: the same normalization the API stores and `buscarDuplicados` reads, computed
 * before the row is validated so a bad row still belongs to its invoice and takes it down with it.
 * Null when the row cannot carry an identity (no document number, or no third-party identification).
 */
function claveDeFactura(cruda: FilaCruda): string | null {
  const documento = textoDe(cruda.numeroDocumento)
  if (documento === undefined) return null
  const claves = clavesNormalizadas({
    tercero_tipo_id: (mapear(cruda.tipoId, TIPOS_ID) ?? null) as "NIT" | "CC" | "CE" | null,
    tercero_numero_id: textoDe(cruda.numeroId) ?? null,
    numero_documento: documento,
  })
  if (claves.tercero_id_norm === null) return null
  return `${claves.tercero_id_norm}|${claves.numero_documento_norm}`
}

type FilaValidada = Omit<FilaGastoImport, "fila"> & { clave: string | null }

function validarFila(
  cruda: FilaCruda,
  contexto: ContextoImportGastos,
  indice: Map<string, RubroCatalogo>,
  lineas: IndiceLineas,
): FilaValidada {
  const rubroTexto = vacio(cruda.rubro) ? "" : String(cruda.rubro).trim()
  const actividadTexto = vacio(cruda.actividad) ? "" : String(cruda.actividad).trim()
  const clave = claveDeFactura(cruda)
  const falla = (error: string, rubroId: string | null = null) => ({
    rubroTexto,
    rubroId,
    actividadTexto,
    datos: null,
    error,
    clave,
  })

  if (rubroTexto === "") return falla("Falta el nombre del rubro.")
  const rubro = indice.get(normalizarTexto(rubroTexto))
  if (!rubro) return falla(`No encontramos el rubro «${rubroTexto}» en el catálogo.`)
  if (contexto.deshabilitados?.has(rubro.id)) return falla(rubroDeshabilitadoMessage(rubro), rubro.id)
  // Review of T14: a code Excel turned into a number (1.10 → 1.1) or a date cannot be trusted to name an activity.
  if (typeof cruda.actividad === "number" || cruda.actividad instanceof Date) {
    return falla(ACTIVIDAD_NO_TEXTO_MESSAGE, rubro.id)
  }
  const linea = lineaDeLaFila(rubro, actividadTexto, lineas)
  if (!linea.ok) return falla(linea.error, rubro.id)

  const montos = leerMontos(cruda)

  const tipoIdTexto = mapear(cruda.tipoId, TIPOS_ID)
  const candidato = {
    rubro_id: rubro.id,
    fecha_documento: fechaDe(cruda.fecha),
    periodo: periodoDe(cruda.periodo),
    tipo_soporte: mapear(cruda.tipoSoporte, TIPOS_SOPORTE),
    tercero_nombre: textoDe(cruda.tercero),
    tercero_tipo_id: tipoIdTexto ?? null,
    tercero_numero_id: textoDe(cruda.numeroId) ?? null,
    numero_documento: textoDe(cruda.numeroDocumento),
    descripcion: textoDe(cruda.descripcion),
    subtotal: montos.ok ? fromCents(montos.subtotal) : "0",
    iva: montos.ok ? fromCents(montos.iva) : "0",
  }
  const parsed = GASTO_FILA_SCHEMA.safeParse(candidato)
  if (!parsed.success) return falla(parsed.error.issues[0]?.message ?? "Datos no válidos.", rubro.id)
  if (!montos.ok) return falla(montos.message, rubro.id)
  const data = parsed.data

  const periodo = evaluarPeriodo(contexto.proyecto, data.fecha_documento, data.periodo)
  if (!periodo.ok) return falla(periodo.message, rubro.id)

  const enlaces = leerEnlaces(cruda.enlaces)
  if (!enlaces.ok) return falla(enlaces.message, rubro.id)

  const tercero = { tercero_tipo_id: data.tercero_tipo_id ?? null, tercero_numero_id: data.tercero_numero_id || null }
  return {
    rubroTexto,
    rubroId: rubro.id,
    actividadTexto,
    error: null,
    clave,
    datos: {
      rubro_id: rubro.id,
      linea_id: linea.linea.id,
      total_documento: montos.totalDocumento,
      fecha_documento: data.fecha_documento,
      periodo: periodo.value,
      tipo_soporte: data.tipo_soporte,
      tercero_nombre: data.tercero_nombre,
      ...tercero,
      numero_documento: data.numero_documento,
      descripcion: data.descripcion,
      subtotal: montos.subtotal,
      iva: montos.iva,
      cents: montos.total,
      enlaces: enlaces.enlaces,
    },
  }
}

/**
 * Review of T14: rows of one document on the same line (two items of the same rubro and activity) become one
 * distribution row with their sum, in first-appearance order, so the per-line overspend check sees the whole
 * amount that line receives.
 */
function unirPorLinea(datos: readonly DatosGastoImport[]): { linea_id: string; valor: Cents; iva: Cents }[] {
  const porLinea = new Map<string, { valor: Cents; iva: Cents }>()
  for (const cada of datos) {
    const previo = porLinea.get(cada.linea_id) ?? { valor: BigInt(0), iva: BigInt(0) }
    porLinea.set(cada.linea_id, { valor: previo.valor + cada.cents, iva: previo.iva + cada.iva })
  }
  return [...porLinea].map(([linea_id, { valor, iva }]) => ({ linea_id, valor, iva }))
}

/**
 * S9/T14.3: closes one document of the file. A row error rejects the whole invoice (half a document is worse
 * than none), its rows must agree on the date, the period and the support type of the single header they will
 * write, and their amounts must add up to the «Total» the document states. A one-row document keeps the rule it
 * always had: the optional «Total» equals its Subtotal + IVA.
 */
function cerrarFactura(grupo: readonly FilaGastoImport[]): { filas: FilaGastoImport[]; factura: FacturaGastoImport } {
  const filas = [...grupo]
  const numeros = filas.map((fila) => fila.fila)
  const rechazar = (error: string) => {
    for (let i = 0; i < filas.length; i++) {
      if (filas[i].error === null) filas[i] = { ...filas[i], datos: null, error }
    }
    return { filas, factura: { filas: numeros, datos: null, error } satisfies FacturaGastoImport }
  }

  const conError = filas.find((fila) => fila.error !== null)
  if (conError) return rechazar(facturaIncompleta(conError.fila))

  const datos = filas.map((fila) => fila.datos as DatosGastoImport)
  const primero = datos[0]
  const mismoDocumento = datos.every(
    (cada) =>
      cada.fecha_documento === primero.fecha_documento &&
      cada.periodo === primero.periodo &&
      cada.tipo_soporte === primero.tipo_soporte,
  )
  if (!mismoDocumento) return rechazar(FACTURA_NO_COINCIDE_MESSAGE)

  const subtotal = sumCents(datos.map((cada) => cada.subtotal))
  const iva = sumCents(datos.map((cada) => cada.iva))
  const total = subtotal + iva
  if (datos.length === 1) {
    if (primero.total_documento !== null && primero.total_documento !== total) {
      return rechazar(
        enColumna("total", `no coincide con Subtotal + IVA (${formatCOP(total)}). Corrígelo o deja la columna vacía.`),
      )
    }
  } else {
    if (primero.total_documento === null) return rechazar(SIN_TOTAL_DISTRIBUCION_MESSAGE)
    if (datos.some((cada) => cada.total_documento !== null && cada.total_documento !== total)) {
      return rechazar(REPARTO_SUMA_MESSAGE)
    }
  }

  return {
    filas,
    factura: {
      filas: numeros,
      error: null,
      datos: {
        fecha_documento: primero.fecha_documento,
        periodo: primero.periodo,
        tipo_soporte: primero.tipo_soporte,
        tercero_nombre: primero.tercero_nombre,
        tercero_tipo_id: primero.tercero_tipo_id,
        tercero_numero_id: primero.tercero_numero_id,
        numero_documento: primero.numero_documento,
        descripcion: primero.descripcion,
        subtotal,
        iva,
        cents: total,
        repartos: unirPorLinea(datos),
        enlaces: [...new Set(datos.flatMap((cada) => cada.enlaces))],
      },
    },
  }
}

export async function parseGastosImport(
  bytes: Buffer | Uint8Array | ArrayBuffer,
  contexto: ContextoImportGastos,
): Promise<ResultadoGastosImport> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(bytes as never)
  } catch {
    return resultadoArchivo(ARCHIVO_ILEGIBLE)
  }

  const { encabezado, faltan, anterior } = buscarEncabezado(workbook)
  if (!encabezado) {
    if (anterior) return resultadoArchivo(PLANTILLA_ANTERIOR_MESSAGE)
    return resultadoArchivo(`Faltan las columnas obligatorias ${comillas(faltan)}. Usa la plantilla de gastos.`)
  }

  const { hoja, columnas } = encabezado
  const celda = (r: number, campo: Campo): ValorCelda => {
    const c = columnas[campo]
    return c ? leerCelda(hoja.getRow(r).getCell(c)) : null
  }

  const crudas: FilaCruda[] = []
  for (let r = encabezado.fila + 1; r <= hoja.rowCount; r++) {
    const cruda = { fila: r } as FilaCruda
    for (const campo of CAMPOS_DATOS) cruda[campo] = celda(r, campo)
    if (CAMPOS_DATOS.every((campo) => vacio(cruda[campo]))) continue
    if (crudas.length === MAX_FILAS_GASTOS) {
      return resultadoArchivo(`El archivo tiene más de ${MAX_FILAS_GASTOS} filas con datos: divídelo en varios archivos.`)
    }
    crudas.push(cruda)
  }
  if (crudas.length === 0) return resultadoArchivo(SIN_FILAS_GASTOS)

  const indice = indiceCatalogo(contexto.rubros)
  const lineas = indiceLineas(contexto.lineas)
  const porDocumento = new Map<string, FilaGastoImport[]>()
  for (const cruda of crudas) {
    const { clave, ...fila } = validarFila(cruda, contexto, indice, lineas)
    const completa: FilaGastoImport = { ...fila, fila: cruda.fila }
    // A row with no document identity of its own is its own invoice, as it always was.
    const documento = clave ?? `fila:${cruda.fila}`
    const actuales = porDocumento.get(documento)
    if (actuales) actuales.push(completa)
    else porDocumento.set(documento, [completa])
  }

  const cerradas = new Map<number, FilaGastoImport>()
  const facturas: FacturaGastoImport[] = []
  for (const grupo of porDocumento.values()) {
    const cerrada = cerrarFactura(grupo)
    for (const fila of cerrada.filas) cerradas.set(fila.fila, fila)
    facturas.push(cerrada.factura)
  }
  // Rows keep the Excel order whatever the order of the documents of the file.
  const filas = crudas.map((cruda) => cerradas.get(cruda.fila) as FilaGastoImport)

  const validas = filas.filter((f) => f.error === null).length
  return { filas, facturas, erroresArchivo: [], resumen: { validas, errores: filas.length - validas } }
}
