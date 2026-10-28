/**
 * Reads the expenses workbook (one row per expense, B8) into rows that follow the SAME rules as the
 * single-expense form: `GASTO_FILA_SCHEMA` (required texts and limits), `evaluarValorGasto` (> 0, max
 * two decimals), a rubro with an assigned value and `evaluarPeriodo` (a month of the project). The
 * file carries no support: those come separately (S2).
 *
 * Pure and Node-only (`exceljs`, same boundary as `../presupuesto-po/parse.ts`, whose cell and rubro
 * helpers it reuses). The caller passes everything the rules need (`ContextoImportGastos`), so there
 * is no database access here. Never throws on bad input: file-level problems come back in
 * `erroresArchivo` and row problems in each row's `error`.
 */
import ExcelJS from "exceljs"
import {
  GASTO_FILA_SCHEMA,
  RUBRO_SIN_ASIGNADO_MESSAGE,
  clavesNormalizadas,
  evaluarPeriodo,
  evaluarValorGasto,
  type GastoProyecto,
} from "@/lib/api/gastos"
import { fromCents, type Cents } from "../money"
import {
  ARCHIVO_ILEGIBLE,
  indiceCatalogo,
  leerCelda,
  normalizarTexto,
  parseMontoCelda,
  vacio,
  type RubroCatalogo,
  type ValorCelda,
} from "../presupuesto-po/parse"

export { ARCHIVO_ILEGIBLE }

/** Data rows read after the header; a longer sheet is a file error (DoS guard). */
export const MAX_FILAS_GASTOS = 200
/** Rows scanned from the top of each sheet looking for the header row. */
const FILAS_BUSQUEDA_ENCABEZADO = 10
/** Columns scanned in each row. */
const MAX_COLUMNAS = 20

export const DUPLICADO_EN_ARCHIVO_MESSAGE = "Duplicado dentro del archivo"
export const SIN_FILAS_GASTOS = "El archivo no tiene filas con datos: agrega al menos un gasto debajo de los encabezados."

/** Headers of the template, in order (the first seven are required; the other three optional). */
export const ENCABEZADOS_GASTOS = [
  "Rubro",
  "Fecha del documento",
  "Tipo de soporte",
  "Tercero",
  "Tipo de identificación",
  "Número de identificación",
  "Número de documento",
  "Descripción",
  "Valor (COP)",
  "Periodo",
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
  | "valor"
  | "periodo"

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
  valor: ["valor cop", "valor", "monto"],
  periodo: ["periodo"],
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
  valor: "Valor (COP)",
  periodo: "Periodo",
}

const OBLIGATORIOS: readonly Campo[] = ["rubro", "fecha", "tipoSoporte", "tercero", "numeroDocumento", "descripcion", "valor"]

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
  /** Rubro ids whose budget line in this project has an assigned value above zero. */
  rubrosConAsignado: ReadonlySet<string>
}

/** What one valid row writes: the fields of a single expense, the amount in exact cents. */
export type DatosGastoImport = {
  rubro_id: string
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
  /** The Total (Subtotal + IVA): the executed amount. */
  cents: Cents
}

export type FilaGastoImport = {
  /** Excel row number (1-based). */
  fila: number
  /** The rubro as written in the file. */
  rubroTexto: string
  rubroId: string | null
  /** Null when the row has an error. */
  datos: DatosGastoImport | null
  error: string | null
}

export type ResultadoGastosImport = {
  filas: FilaGastoImport[]
  /** Errors of the whole file (unreadable, missing headers, no rows, too many rows); `filas` is empty then. */
  erroresArchivo: string[]
  resumen: { validas: number; errores: number }
}

function resultadoArchivo(error: string): ResultadoGastosImport {
  return { filas: [], erroresArchivo: [error], resumen: { validas: 0, errores: 0 } }
}

type Encabezado = { hoja: ExcelJS.Worksheet; fila: number; columnas: Partial<Record<Campo, number>> }

function buscarEncabezado(workbook: ExcelJS.Workbook): { encabezado: Encabezado | null; faltan: Campo[] } {
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
      const faltan = OBLIGATORIOS.filter((campo) => !columnas[campo])
      if (faltan.length === 0) return { encabezado: { hoja, fila: r, columnas }, faltan: [] }
      if (faltan.length < mejorFaltan.length) {
        mejor = { hoja, fila: r, columnas }
        mejorFaltan = faltan
      }
    }
  }
  return { encabezado: mejor && mejorFaltan.length === 0 ? mejor : null, faltan: mejorFaltan }
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

type FilaCruda = { fila: number } & Record<Campo, ValorCelda>

function validarFila(
  cruda: FilaCruda,
  contexto: ContextoImportGastos,
  indice: Map<string, RubroCatalogo>,
): Omit<FilaGastoImport, "fila"> & { claves?: ReturnType<typeof clavesNormalizadas> } {
  const rubroTexto = vacio(cruda.rubro) ? "" : String(cruda.rubro).trim()
  const falla = (error: string, rubroId: string | null = null) => ({ rubroTexto, rubroId, datos: null, error })

  if (rubroTexto === "") return falla("Falta el nombre del rubro.")
  const rubro = indice.get(normalizarTexto(rubroTexto))
  if (!rubro) return falla(`No encontramos el rubro «${rubroTexto}» en el catálogo.`)
  if (!contexto.rubrosConAsignado.has(rubro.id)) return falla(RUBRO_SIN_ASIGNADO_MESSAGE, rubro.id)

  const monto = parseMontoCelda(cruda.valor)
  const valor = monto.ok ? evaluarValorGasto(fromCents(monto.cents)) : monto

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
    // Interim until the template carries Subtotal and IVA columns (T3): the old single amount is the Subtotal.
    subtotal: valor.ok ? fromCents(valor.cents) : "0",
    iva: "0",
  }
  const parsed = GASTO_FILA_SCHEMA.safeParse(candidato)
  if (!parsed.success) return falla(parsed.error.issues[0]?.message ?? "Datos no válidos.", rubro.id)
  if (!valor.ok) return falla(valor.message, rubro.id)
  const data = parsed.data

  const periodo = evaluarPeriodo(contexto.proyecto, data.fecha_documento, data.periodo)
  if (!periodo.ok) return falla(periodo.message, rubro.id)

  const tercero = { tercero_tipo_id: data.tercero_tipo_id ?? null, tercero_numero_id: data.tercero_numero_id || null }
  return {
    rubroTexto,
    rubroId: rubro.id,
    error: null,
    claves: clavesNormalizadas({ ...tercero, numero_documento: data.numero_documento }),
    datos: {
      rubro_id: rubro.id,
      fecha_documento: data.fecha_documento,
      periodo: periodo.value,
      tipo_soporte: data.tipo_soporte,
      tercero_nombre: data.tercero_nombre,
      ...tercero,
      numero_documento: data.numero_documento,
      descripcion: data.descripcion,
      subtotal: valor.cents,
      iva: BigInt(0),
      cents: valor.cents,
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

  const { encabezado, faltan } = buscarEncabezado(workbook)
  if (!encabezado) {
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
    for (const campo of Object.keys(ALIAS) as Campo[]) cruda[campo] = celda(r, campo)
    if ((Object.keys(ALIAS) as Campo[]).every((campo) => vacio(cruda[campo]))) continue
    if (crudas.length === MAX_FILAS_GASTOS) {
      return resultadoArchivo(`El archivo tiene más de ${MAX_FILAS_GASTOS} filas con datos: divídelo en varios archivos.`)
    }
    crudas.push(cruda)
  }
  if (crudas.length === 0) return resultadoArchivo(SIN_FILAS_GASTOS)

  const indice = indiceCatalogo(contexto.rubros)
  const vistos = new Map<string, number>()
  const filas = crudas.map((cruda): FilaGastoImport => {
    const { claves, ...fila } = validarFila(cruda, contexto, indice)
    if (fila.error === null && claves && claves.tercero_id_norm !== null) {
      const clave = `${claves.tercero_id_norm}|${claves.numero_documento_norm}`
      const previa = vistos.get(clave)
      if (previa !== undefined) {
        return { ...fila, fila: cruda.fila, datos: null, error: `${DUPLICADO_EN_ARCHIVO_MESSAGE} (ya aparece en la fila ${previa}).` }
      }
      vistos.set(clave, cruda.fila)
    }
    return { ...fila, fila: cruda.fila }
  })

  const validas = filas.filter((f) => f.error === null).length
  return { filas, erroresArchivo: [], resumen: { validas, errores: filas.length - validas } }
}
