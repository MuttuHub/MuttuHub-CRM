/**
 * Reads the PO's project workbook (`proyecto.xlsx`) into a structure plan with
 * system-generated codes (B3; decisions T1, T2 and T6 of the v2 launch).
 *
 * Two sheet kinds, recognized by their header row in any of the first rows and
 * in any column order:
 * - indicators: `Objetivo especifico | Resultados (indicador) | Resultados (meta)`;
 * - activities: `Objetivo especifico | Actividad | Entregables | Inicio (semana) |
 *   Fin (semana) | Cantidad | Unidad`, one row per entregable.
 * Only one sheet of each kind may carry data rows (the PO's file has empty
 * `Modelo*` sheets next to the filled `Ejemplo*` ones). Objetivos and actividades
 * are matched by normalized text; codes are O{n}, A{o}.{n}, E{o}.{a}.{n} and
 * IND-{nn} in order of appearance, indicators sheet first. The quantity is
 * never read out of the entregable text (T1).
 *
 * Pure and Node-only (`exceljs`, same boundary as `../presupuesto-po/parse.ts`).
 * Never throws on bad input: every problem comes back in `errores`.
 */
import ExcelJS from "exceljs"
import { toCents } from "../money"
import { validarSemanas } from "../actividad"
import { MAX_ERRORES, MAX_FILAS_HOJA } from "../plantilla/columns"
import { MONTO_MAXIMO_CENTS, decimalDeCelda, enteroDeCelda, redondear2 } from "../plantilla/validate"
import { ARCHIVO_ILEGIBLE, leerCelda, normalizarTexto, vacio } from "../presupuesto-po/parse"

export { ARCHIVO_ILEGIBLE }

export const SIN_ACTIVIDADES =
  "No encontramos actividades: el archivo debe tener una hoja con las columnas «Objetivo especifico», «Actividad», " +
  "«Entregables», «Inicio (semana)», «Fin (semana)», «Cantidad» y «Unidad», con al menos una fila."

export type ErrorEstructuraPO = { hoja: string | null; fila: number | null; columna: string | null; mensaje: string }

export type PlanEstructuraPO = {
  objetivos: { codigo: string; descripcion: string }[]
  indicadores: { codigo: string; objetivoCodigo: string; nombre: string; meta: string }[]
  actividades: { codigo: string; objetivoCodigo: string; nombre: string; semanaInicio: number; semanaFin: number }[]
  entregables: { codigo: string; actividadCodigo: string; descripcion: string; cantidadMeta: string; unidad: string }[]
}

export type ResultadoEstructuraPO = {
  /** Built from the rows without errors; only a result with no `errores` may be imported. */
  plan: PlanEstructuraPO
  errores: ErrorEstructuraPO[]
  /** `errores` was cut at `MAX_ERRORES`. */
  truncado: boolean
  resumen: { objetivos: number; indicadores: number; actividades: number; entregables: number; errores: number }
}

/** Rows scanned from the top of each sheet looking for the header row. */
const FILAS_BUSQUEDA_ENCABEZADO = 10
/** Columns scanned in each row. */
const MAX_COLUMNAS = 30
const ZERO = toCents("0")

type Campo = "objetivo" | "indicador" | "meta" | "actividad" | "entregable" | "inicio" | "fin" | "cantidad" | "unidad"

/** Normalized header text -> field. */
const ENCABEZADOS: Record<string, Campo> = {
  "objetivo especifico": "objetivo",
  "objetivos especificos": "objetivo",
  objetivo: "objetivo",
  "resultados indicador": "indicador",
  indicador: "indicador",
  indicadores: "indicador",
  "resultados meta": "meta",
  meta: "meta",
  metas: "meta",
  actividad: "actividad",
  actividades: "actividad",
  entregable: "entregable",
  entregables: "entregable",
  "inicio semana": "inicio",
  "semana inicio": "inicio",
  inicio: "inicio",
  "fin semana": "fin",
  "semana fin": "fin",
  fin: "fin",
  cantidad: "cantidad",
  unidad: "unidad",
}

/** Header name shown when a required column is missing. */
const NOMBRE_COLUMNA: Record<Campo, string> = {
  objetivo: "Objetivo especifico",
  indicador: "Resultados (indicador)",
  meta: "Resultados (meta)",
  actividad: "Actividad",
  entregable: "Entregables",
  inicio: "Inicio (semana)",
  fin: "Fin (semana)",
  cantidad: "Cantidad",
  unidad: "Unidad",
}

const COLUMNA_FALTANTE: Partial<Record<Campo, string>> = {
  cantidad: "agrégala con la cantidad de cada entregable",
  unidad: "agrégala con la unidad de cada entregable",
}

type Tipo = "indicadores" | "actividades"

const CAMPOS_TIPO: Record<Tipo, readonly Campo[]> = {
  indicadores: ["objetivo", "indicador", "meta"],
  actividades: ["objetivo", "actividad", "entregable", "inicio", "fin", "cantidad", "unidad"],
}

/** Text fields: message for a missing value, subject for a too-long one, DB limit. */
const TEXTOS: Partial<Record<Campo, { falta: string; largo: string; max: number }>> = {
  objetivo: { falta: "Falta el objetivo específico.", largo: "El objetivo específico", max: 2000 },
  indicador: { falta: "Falta el indicador.", largo: "El indicador", max: 300 },
  actividad: { falta: "Falta la actividad.", largo: "La actividad", max: 300 },
  entregable: { falta: "Falta el entregable.", largo: "El entregable", max: 2000 },
  unidad: { falta: "Falta la unidad.", largo: "La unidad", max: 100 },
}

type Valor = string | number | Date | null
type Valores = Partial<Record<Campo, Valor>>

type Hoja = {
  nombre: string
  tipo: Tipo
  columnas: Partial<Record<Campo, number>>
  letras: Partial<Record<Campo, string>>
  filas: { fila: number; valores: Valores }[]
}

function valorCelda(cell: ExcelJS.Cell): Valor {
  const valor = leerCelda(cell)
  return typeof valor === "boolean" ? String(valor) : valor
}

function texto(valor: Valor | undefined): string {
  if (valor === null || valor === undefined) return ""
  if (valor instanceof Date) return valor.toISOString()
  return String(valor).trim()
}

function tipoDeEncabezado(columnas: Partial<Record<Campo, number>>): Tipo | null {
  if (columnas.objetivo && columnas.actividad && columnas.entregable) return "actividades"
  if (columnas.objetivo && columnas.indicador && columnas.meta) return "indicadores"
  return null
}

/** The sheet's header row (first one that names a sheet kind) and its non-empty data rows. */
function leerHoja(ws: ExcelJS.Worksheet): Hoja | null {
  const ultima = Math.min(ws.rowCount, FILAS_BUSQUEDA_ENCABEZADO)
  for (let r = 1; r <= ultima; r++) {
    const row = ws.getRow(r)
    const columnas: Partial<Record<Campo, number>> = {}
    for (let c = 1; c <= MAX_COLUMNAS; c++) {
      const valor = leerCelda(row.getCell(c))
      if (typeof valor !== "string") continue
      const campo = ENCABEZADOS[normalizarTexto(valor)]
      if (campo && !columnas[campo]) columnas[campo] = c
    }
    const tipo = tipoDeEncabezado(columnas)
    if (!tipo) continue

    const letras: Partial<Record<Campo, string>> = {}
    for (const [campo, col] of Object.entries(columnas) as [Campo, number][]) letras[campo] = ws.getColumn(col).letter
    const filas: Hoja["filas"] = []
    for (let f = r + 1; f <= ws.rowCount; f++) {
      const dataRow = ws.getRow(f)
      const valores: Valores = {}
      let alguno = false
      for (const campo of CAMPOS_TIPO[tipo]) {
        const col = columnas[campo]
        if (!col) continue
        const valor = valorCelda(dataRow.getCell(col))
        valores[campo] = valor
        if (!vacio(valor)) alguno = true
      }
      if (alguno) filas.push({ fila: f, valores })
    }
    return { nombre: ws.name, tipo, columnas, letras, filas }
  }
  return null
}

function resultadoVacio(errores: ErrorEstructuraPO[]): ResultadoEstructuraPO {
  return {
    plan: { objetivos: [], indicadores: [], actividades: [], entregables: [] },
    errores,
    truncado: false,
    resumen: { objetivos: 0, indicadores: 0, actividades: 0, entregables: 0, errores: errores.length },
  }
}

function errorArchivo(mensaje: string, hoja: string | null = null): ErrorEstructuraPO {
  return { hoja, fila: null, columna: null, mensaje }
}

function listaHojas(nombres: string[]): string {
  const citados = nombres.map((n) => `«${n}»`)
  return citados.length <= 1 ? citados.join("") : `${citados.slice(0, -1).join(", ")} y ${citados[citados.length - 1]}`
}

type Numero = { ok: true; dec: string } | { ok: false; mensaje: string }

/** A positive quantity or meta, rounded half-up to two decimals (same rule as V-09). */
function positivo(valor: Valor | undefined, etiqueta: string): Numero {
  if (texto(valor) === "") return { ok: false, mensaje: `${etiqueta} es obligatoria.` }
  const dec = decimalDeCelda(valor ?? null)
  if (dec === null) return { ok: false, mensaje: `${etiqueta} no es un número válido.` }
  const redondeado = redondear2(dec)
  const cents = toCents(redondeado)
  if (cents <= ZERO) return { ok: false, mensaje: `${etiqueta} debe ser mayor que cero.` }
  if (cents > MONTO_MAXIMO_CENTS) return { ok: false, mensaje: `${etiqueta} es demasiado alta.` }
  return { ok: true, dec: redondeado }
}

/** A week cell: blank is allowed (another row of the actividad may carry it). */
function semana(valor: Valor | undefined): { ok: true; semana: number | null } | { ok: false } {
  if (texto(valor) === "") return { ok: true, semana: null }
  const entero = enteroDeCelda(valor ?? null)
  return entero === null ? { ok: false } : { ok: true, semana: entero }
}

type Objetivo = { codigo: string; descripcion: string; actividades: number }
type ActividadAcumulada = {
  codigo: string
  objetivoCodigo: string
  nombre: string
  primeraFila: number
  inicio: number | null
  fin: number | null
  entregables: number
}

/** Sheet-level problems: two filled sheets of one kind, no actividades, too many rows, missing columns. */
function erroresDeHojas(conDatos: Record<Tipo, Hoja[]>): ErrorEstructuraPO[] {
  const errores: ErrorEstructuraPO[] = []
  for (const tipo of ["indicadores", "actividades"] as const) {
    if (conDatos[tipo].length > 1) {
      const nombres = conDatos[tipo].map((h) => h.nombre)
      errores.push(errorArchivo(`Las hojas ${listaHojas(nombres)} tienen ${tipo}: deja los datos en una sola hoja.`))
    }
  }
  if (errores.length) return errores
  if (conDatos.actividades.length === 0) return [errorArchivo(SIN_ACTIVIDADES)]

  for (const hoja of [...conDatos.indicadores, ...conDatos.actividades]) {
    if (hoja.filas.length > MAX_FILAS_HOJA) {
      errores.push(errorArchivo(`La hoja «${hoja.nombre}» tiene más de ${MAX_FILAS_HOJA} filas con datos.`, hoja.nombre))
      continue
    }
    for (const campo of CAMPOS_TIPO[hoja.tipo]) {
      if (hoja.columnas[campo]) continue
      const ayuda = COLUMNA_FALTANTE[campo]
      errores.push(
        errorArchivo(`La hoja «${hoja.nombre}» no tiene la columna «${NOMBRE_COLUMNA[campo]}»${ayuda ? `: ${ayuda}` : ""}.`, hoja.nombre),
      )
    }
  }
  return errores
}

/**
 * Parses the PO workbook. `duracionSemanas` bounds the actividad weeks (V-07);
 * `null` when the project has no dates yet.
 */
export async function parseEstructuraPO(
  bytes: Buffer | Uint8Array | ArrayBuffer,
  opciones: { duracionSemanas: number | null },
): Promise<ResultadoEstructuraPO> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(bytes as never)
  } catch {
    return resultadoVacio([errorArchivo(ARCHIVO_ILEGIBLE)])
  }

  const conDatos: Record<Tipo, Hoja[]> = { indicadores: [], actividades: [] }
  for (const ws of workbook.worksheets) {
    const hoja = leerHoja(ws)
    if (hoja && hoja.filas.length > 0) conDatos[hoja.tipo].push(hoja)
  }
  const erroresArchivo = erroresDeHojas(conDatos)
  if (erroresArchivo.length) return resultadoVacio(erroresArchivo)

  const errores: ErrorEstructuraPO[] = []
  const plan: PlanEstructuraPO = { objetivos: [], indicadores: [], actividades: [], entregables: [] }
  const objetivos = new Map<string, Objetivo>()
  const actividades = new Map<string, ActividadAcumulada>()

  function objetivoDe(descripcion: string): Objetivo {
    const clave = normalizarTexto(descripcion)
    let objetivo = objetivos.get(clave)
    if (!objetivo) {
      objetivo = { codigo: `O${objetivos.size + 1}`, descripcion, actividades: 0 }
      objetivos.set(clave, objetivo)
      plan.objetivos.push({ codigo: objetivo.codigo, descripcion })
    }
    return objetivo
  }

  /** Checks the row's text fields; their trimmed values, or null when one failed. */
  function textos(hoja: Hoja, fila: number, valores: Valores, campos: Campo[]): Partial<Record<Campo, string>> | null {
    const leidos: Partial<Record<Campo, string>> = {}
    let ok = true
    for (const campo of campos) {
      const regla = TEXTOS[campo]
      if (!regla) continue
      const valor = texto(valores[campo])
      const columna = hoja.letras[campo] ?? null
      if (normalizarTexto(valor) === "") {
        errores.push({ hoja: hoja.nombre, fila, columna, mensaje: regla.falta })
        ok = false
      } else if (valor.length > regla.max) {
        errores.push({ hoja: hoja.nombre, fila, columna, mensaje: `${regla.largo} supera los ${regla.max} caracteres.` })
        ok = false
      } else {
        leidos[campo] = valor
      }
    }
    return ok ? leidos : null
  }

  const hojaIndicadores = conDatos.indicadores[0]
  if (hojaIndicadores) {
    for (const { fila, valores } of hojaIndicadores.filas) {
      const leidos = textos(hojaIndicadores, fila, valores, ["objetivo", "indicador"])
      const meta = positivo(valores.meta, "La meta")
      if (!meta.ok) {
        errores.push({ hoja: hojaIndicadores.nombre, fila, columna: hojaIndicadores.letras.meta ?? null, mensaje: meta.mensaje })
      }
      if (!leidos || !meta.ok) continue
      const objetivo = objetivoDe(leidos.objetivo as string)
      const numero = String(plan.indicadores.length + 1).padStart(2, "0")
      plan.indicadores.push({ codigo: `IND-${numero}`, objetivoCodigo: objetivo.codigo, nombre: leidos.indicador as string, meta: meta.dec })
    }
  }

  const hoja = conDatos.actividades[0]
  for (const { fila, valores } of hoja.filas) {
    const leidos = textos(hoja, fila, valores, ["objetivo", "actividad", "entregable"])
    const inicio = semana(valores.inicio)
    if (!inicio.ok) {
      errores.push({ hoja: hoja.nombre, fila, columna: hoja.letras.inicio ?? null, mensaje: "La semana de inicio debe ser un número entero." })
    }
    const fin = semana(valores.fin)
    if (!fin.ok) {
      errores.push({ hoja: hoja.nombre, fila, columna: hoja.letras.fin ?? null, mensaje: "La semana de fin debe ser un número entero." })
    }
    const cantidad = positivo(valores.cantidad, "La cantidad")
    if (!cantidad.ok) errores.push({ hoja: hoja.nombre, fila, columna: hoja.letras.cantidad ?? null, mensaje: cantidad.mensaje })
    const unidad = textos(hoja, fila, valores, ["unidad"])
    if (!leidos || !inicio.ok || !fin.ok || !cantidad.ok || !unidad) continue

    const objetivo = objetivoDe(leidos.objetivo as string)
    const clave = `${normalizarTexto(objetivo.descripcion)}\u0000${normalizarTexto(leidos.actividad as string)}`
    let actividad = actividades.get(clave)
    if (!actividad) {
      objetivo.actividades += 1
      actividad = {
        codigo: `A${objetivo.codigo.slice(1)}.${objetivo.actividades}`,
        objetivoCodigo: objetivo.codigo,
        nombre: leidos.actividad as string,
        primeraFila: fila,
        inicio: null,
        fin: null,
        entregables: 0,
      }
      actividades.set(clave, actividad)
    }
    if (inicio.semana !== null) actividad.inicio = actividad.inicio === null ? inicio.semana : Math.min(actividad.inicio, inicio.semana)
    if (fin.semana !== null) actividad.fin = actividad.fin === null ? fin.semana : Math.max(actividad.fin, fin.semana)
    actividad.entregables += 1
    plan.entregables.push({
      codigo: `E${actividad.codigo.slice(1)}.${actividad.entregables}`,
      actividadCodigo: actividad.codigo,
      descripcion: leidos.entregable as string,
      cantidadMeta: cantidad.dec,
      unidad: unidad.unidad as string,
    })
  }

  // An actividad's weeks are checked once all its rows are in (S3).
  const duracion = opciones.duracionSemanas ?? Number.MAX_SAFE_INTEGER
  for (const actividad of actividades.values()) {
    const base = { hoja: hoja.nombre, fila: actividad.primeraFila }
    if (actividad.inicio === null) {
      errores.push({ ...base, columna: hoja.letras.inicio ?? null, mensaje: `La actividad «${actividad.nombre}» no tiene semana de inicio en ninguna de sus filas.` })
      continue
    }
    if (actividad.fin === null) {
      errores.push({ ...base, columna: hoja.letras.fin ?? null, mensaje: `La actividad «${actividad.nombre}» no tiene semana de fin en ninguna de sus filas.` })
      continue
    }
    const semanas = validarSemanas(actividad.inicio, actividad.fin, duracion)
    if (!semanas.ok) {
      errores.push({ ...base, columna: hoja.letras.fin ?? null, mensaje: semanas.message })
      continue
    }
    plan.actividades.push({
      codigo: actividad.codigo,
      objetivoCodigo: actividad.objetivoCodigo,
      nombre: actividad.nombre,
      semanaInicio: actividad.inicio,
      semanaFin: actividad.fin,
    })
  }

  return {
    plan,
    errores: errores.slice(0, MAX_ERRORES),
    truncado: errores.length > MAX_ERRORES,
    resumen: {
      objetivos: plan.objetivos.length,
      indicadores: plan.indicadores.length,
      actividades: plan.actividades.length,
      entregables: plan.entregables.length,
      errores: errores.length,
    },
  }
}
