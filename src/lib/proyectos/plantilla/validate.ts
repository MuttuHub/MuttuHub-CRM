/**
 * S7 U3/U4 (RF-04) — the template validators.
 *
 * Pure and framework-free: no `exceljs`, no Next, no Prisma, no DB. Every rule
 * is an exported function `vNN(p, c): ErrorPlantilla[]` that reads the parsed
 * workbook (U2) and the catalog context. `validarPlantilla` composes them,
 * sorts the report by sheet order then row, and caps the error list at
 * `MAX_ERRORES`. Money is compared as exact `bigint` cents (`toCents`), never
 * floats.
 *
 * Structural rule V-01 gates every other rule: when a sheet is missing or its
 * headers do not match, its downstream rules stay silent to avoid cascade noise.
 */
import {
  ENCABEZADOS,
  ENCABEZADO_PROYECTO,
  ENCABEZADOS_PROGRAMACION,
  HOJAS,
  MAX_ERRORES,
  MAX_FILAS_HOJA,
  PLANTILLA_VERSION,
  type HojaKey,
} from "./columns"
import {
  MAX_MESES,
  parseFechaCelda,
  parseNumeroColombiano,
  type Celda,
  type Fila,
  type ParsedTemplate,
} from "./parse"
import { formatCOP, fromCents, sumCents, toCents, type Cents } from "../money"
import { durationWeeks, projectPeriods, type Periodo } from "../weeks"
import { validarSemanas } from "../actividad"

/** The catalog data a template's project is validated against. */
export type ContextoValidacion = {
  proyecto: { codigo: string; estado: string }
  rubros: { codigo: string; activo: boolean }[]
  lineas: { id: string; codigo: string; nombre: string; activo: boolean }[]
  municipios: { id: string; nombre: string; departamento: string; codigoDane: string | null; activo: boolean }[]
  usuarios: { id: string; email: string }[]
}

/** One user-facing finding, located on the sheet (rows are 1-based Excel rows). */
export type ErrorPlantilla = {
  regla: string
  hoja: string
  fila: number | null
  columna: string | null
  valor: string | null
  mensaje: string
}

export type ResultadoValidacion = {
  errores: ErrorPlantilla[]
  advertencias: ErrorPlantilla[]
  resumen: Record<string, number>
  truncado: boolean
}

const ZERO = BigInt(0)
const MAX_META = 2_147_483_647
/** `Decimal(9,2)`, the activity weight ceiling. */
const MAX_PESO_CENTS = toCents("9999999.99")
/** `Decimal(15,2)`, duplicated here so the pure lib never imports the API layer. */
export const MONTO_MAXIMO_CENTS = toCents("9999999999999.99")

const MES_ENCABEZADO = /^mes \d+ \(\d{4}-\d{2}\)$/
const HOJAS_CODIGO = ["objetivos", "actividades", "entregables", "indicadores"] as const
const HOJAS_DATOS = ["objetivos", "actividades", "entregables", "indicadores", "presupuesto"] as const
const RE_ENTERO = /^-?\d+$/
/** A plain decimal; `String(1e21)`/`String(1e-7)` are rejected before `toCents`. */
const DECIMAL_PLANO = /^-?\d+(?:\.\d+)?$/
/** The project label rows V-01 requires (the parser exposes no `Cliente` field). */
const ETIQUETAS_PROYECTO_REQUERIDAS: [keyof ParsedTemplate["proyecto"], string][] = [
  ["codigo", "Código"],
  ["lineas", "Líneas estratégicas"],
  ["municipios", "Municipios"],
  ["fechaInicio", "Fecha de inicio"],
  ["fechaFin", "Fecha de fin"],
  ["valorTotal", "Valor total"],
  ["metaBeneficiarios", "Meta de beneficiarios"],
]

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

function error(
  regla: string,
  hoja: string,
  fila: number | null,
  columna: string | null,
  valor: unknown,
  mensaje: string,
): ErrorPlantilla {
  return { regla, hoja, fila, columna, valor: valorTexto(valor), mensaje }
}

function valorTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null
  if (valor instanceof Date) return valor.toISOString()
  return String(valor)
}

function celdaDe(fila: Fila, encabezado: string): Celda | undefined {
  return fila.celdas[encabezado]
}

function textoDe(valor: Celda["valor"] | undefined): string {
  if (valor === null || valor === undefined) return ""
  if (valor instanceof Date) return valor.toISOString()
  return String(valor).trim()
}

function textoCelda(fila: Fila, encabezado: string): string {
  return textoDe(celdaDe(fila, encabezado)?.valor)
}

/**
 * A cell's amount as a canonical decimal string, or `null` when not numeric.
 * A finite number is still rejected when `String` renders it in scientific
 * notation (`1e21` -> `"1e+21"`), which `toCents`/`BigInt` cannot read; those
 * cells are reported as invalid input instead of throwing.
 */
function decimalDeCelda(valor: Celda["valor"] | undefined): string | null {
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return null
    const texto = String(valor)
    return DECIMAL_PLANO.test(texto) ? texto : null
  }
  if (typeof valor === "string") return parseNumeroColombiano(valor)
  return null
}

function contarDecimales(dec: string): number {
  const punto = dec.indexOf(".")
  return punto === -1 ? 0 : dec.length - punto - 1
}

/** Integer cell, or `null` when blank or not an integer. */
function enteroDeCelda(valor: Celda["valor"] | undefined): number | null {
  const dec = decimalDeCelda(valor)
  if (dec === null || !RE_ENTERO.test(dec)) return null
  const numero = Number(dec)
  return Number.isSafeInteger(numero) ? numero : null
}

type DecimalLeido = { ok: true; dec: string; cents: Cents } | { ok: false; motivo: "vacio" | "no_numerico" | "decimales" }

/** Strict decimal (max two decimals), the money-column contract. */
function leerDecimal(valor: Celda["valor"] | undefined): DecimalLeido {
  const crudo = textoDe(valor)
  if (crudo === "") return { ok: false, motivo: "vacio" }
  const dec = decimalDeCelda(valor)
  if (dec === null) return { ok: false, motivo: "no_numerico" }
  if (contarDecimales(dec) > 2) return { ok: false, motivo: "decimales" }
  return { ok: true, dec, cents: toCents(dec) }
}

/** Rounds a canonical decimal string half-up to two decimals. */
function redondear2(dec: string): string {
  const negativo = dec.startsWith("-")
  const cuerpo = negativo ? dec.slice(1) : dec
  const [entero = "0", fraccion = ""] = cuerpo.split(".")
  const frac3 = `${fraccion}000`.slice(0, 3)
  const base = BigInt(entero) * BigInt(100) + BigInt(frac3.slice(0, 2))
  const total = Number(frac3[2]) >= 5 ? base + BigInt(1) : base
  return fromCents(negativo ? -total : total)
}

/** 1 -> "A", 27 -> "AA". */
function columnLetter(index: number): string {
  let n = index
  let letras = ""
  while (n > 0) {
    const resto = (n - 1) % 26
    letras = String.fromCharCode(65 + resto) + letras
    n = Math.floor((n - 1) / 26)
  }
  return letras
}

/** "A" -> 1, "Z" -> 26, "AA" -> 27; `null`/unknown -> 0 (sorts first). */
function columnIndex(letras: string | null): number {
  if (!letras) return 0
  let n = 0
  for (const caracter of letras.toUpperCase()) {
    const code = caracter.charCodeAt(0) - 64
    if (code < 1 || code > 26) return 0
    n = n * 26 + code
  }
  return n
}

function tokensLista(valor: Celda["valor"] | undefined): string[] {
  return textoDe(valor)
    .split(";")
    .map((token) => token.trim())
    .filter((token) => token !== "")
}

// ---------------------------------------------------------------------------
// Structural gate
// ---------------------------------------------------------------------------

function normalizarEncabezados(valores: string[] | undefined): string[] {
  if (!valores) return []
  const normal = valores.map((valor) => valor.trim().toLowerCase())
  while (normal.length > 0 && normal[normal.length - 1] === "") normal.pop()
  return normal
}

function encabezadosOk(p: ParsedTemplate, key: (typeof HOJAS_DATOS)[number]): boolean {
  const actual = normalizarEncabezados(p.encabezados[key])
  const esperado = ENCABEZADOS[key].map((valor) => valor.trim().toLowerCase())
  return actual.length === esperado.length && actual.every((valor, i) => valor === esperado[i])
}

function programacionEstructuraOk(p: ParsedTemplate): boolean {
  const normal = normalizarEncabezados(p.encabezados.programacion)
  if (normal.length < 4) return false
  if (normal[0] !== ENCABEZADOS_PROGRAMACION.codigoRubro.toLowerCase()) return false
  if (normal[1] !== ENCABEZADOS_PROGRAMACION.rubro.toLowerCase()) return false
  if (normal[normal.length - 2] !== ENCABEZADOS_PROGRAMACION.total.toLowerCase()) return false
  if (normal[normal.length - 1] !== ENCABEZADOS_PROGRAMACION.control.toLowerCase()) return false
  for (let i = 2; i < normal.length - 2; i++) {
    if (!MES_ENCABEZADO.test(normal[i] ?? "")) return false
  }
  return true
}

function estructuraOk(p: ParsedTemplate, key: HojaKey): boolean {
  if (!p.hojasPresentes.includes(HOJAS[key])) return false
  if (key === "proyecto") {
    const normal = normalizarEncabezados(p.encabezados.proyecto)
    if (normal[0] !== "campo" || normal[1] !== "valor") return false
    // A missing required label row is structural: suppress that sheet's rules.
    return ETIQUETAS_PROYECTO_REQUERIDAS.every(([campo]) => p.proyecto[campo].fila !== 0)
  }
  if (key === "programacion") return programacionEstructuraOk(p)
  if (key === "instrucciones" || key === "catalogos") return true
  return encabezadosOk(p, key)
}

function compararEncabezados(
  hoja: string,
  actual: string[] | undefined,
  esperado: readonly string[],
): ErrorPlantilla[] {
  const errores: ErrorPlantilla[] = []
  const normal = normalizarEncabezados(actual)
  const exp = esperado.map((valor) => valor.trim().toLowerCase())
  const total = Math.max(normal.length, exp.length)
  for (let i = 0; i < total; i++) {
    if (normal[i] !== exp[i]) {
      const columna = columnLetter(i + 1)
      errores.push(
        error(
          "V-01",
          hoja,
          1,
          columna,
          normal[i] ?? null,
          `El encabezado de la columna ${columna} debe ser «${esperado[i] ?? ""}».`,
        ),
      )
    }
  }
  return errores
}

function compararEncabezadoProgramacion(p: ParsedTemplate): ErrorPlantilla[] {
  const hoja = HOJAS.programacion
  const normal = normalizarEncabezados(p.encabezados.programacion)
  const errores: ErrorPlantilla[] = []
  if (normal.length < 4) {
    return [error("V-01", hoja, 1, null, null, "La hoja de programación no tiene las columnas esperadas.")]
  }
  const fija = (indice: number, esperado: string) => {
    if (normal[indice] !== esperado.toLowerCase()) {
      const columna = columnLetter(indice + 1)
      errores.push(
        error("V-01", hoja, 1, columna, normal[indice] ?? null, `El encabezado de la columna ${columna} debe ser «${esperado}».`),
      )
    }
  }
  fija(0, ENCABEZADOS_PROGRAMACION.codigoRubro)
  fija(1, ENCABEZADOS_PROGRAMACION.rubro)
  fija(normal.length - 2, ENCABEZADOS_PROGRAMACION.total)
  fija(normal.length - 1, ENCABEZADOS_PROGRAMACION.control)
  for (let i = 2; i < normal.length - 2; i++) {
    if (!MES_ENCABEZADO.test(normal[i] ?? "")) {
      const columna = columnLetter(i + 1)
      errores.push(
        error("V-01", hoja, 1, columna, normal[i] ?? null, `El encabezado «${normal[i]}» debe tener la forma «Mes k (AAAA-MM)».`),
      )
    }
  }
  return errores
}

// ---------------------------------------------------------------------------
// V-01 — structural
// ---------------------------------------------------------------------------

export function v01(p: ParsedTemplate, _c: ContextoValidacion): ErrorPlantilla[] {
  void _c
  const errores: ErrorPlantilla[] = []
  const presentes = new Set(p.hojasPresentes)

  for (const nombre of Object.values(HOJAS)) {
    if (!presentes.has(nombre)) {
      errores.push(error("V-01", nombre, null, null, null, `Falta la hoja «${nombre}».`))
    }
  }

  if (p.version !== PLANTILLA_VERSION) {
    errores.push(
      error("V-01", HOJAS.instrucciones, 2, "B", p.version, `La versión de la plantilla debe ser ${PLANTILLA_VERSION}.`),
    )
  }

  if (presentes.has(HOJAS.proyecto)) {
    errores.push(...compararEncabezados(HOJAS.proyecto, p.encabezados.proyecto, ENCABEZADO_PROYECTO))
    for (const [campo, etiqueta] of ETIQUETAS_PROYECTO_REQUERIDAS) {
      if (p.proyecto[campo].fila === 0) {
        errores.push(error("V-01", HOJAS.proyecto, null, "A", etiqueta, `Falta la fila «${etiqueta}» en la hoja ${HOJAS.proyecto}.`))
      }
    }
  }

  for (const key of HOJAS_DATOS) {
    if (presentes.has(HOJAS[key])) {
      errores.push(...compararEncabezados(HOJAS[key], p.encabezados[key], ENCABEZADOS[key]))
    }
  }

  if (presentes.has(HOJAS.programacion)) {
    errores.push(...compararEncabezadoProgramacion(p))
  }

  return errores
}

// ---------------------------------------------------------------------------
// V-02 — project identity and state
// ---------------------------------------------------------------------------

export function v02(p: ParsedTemplate, c: ContextoValidacion): ErrorPlantilla[] {
  if (!estructuraOk(p, "proyecto")) return []
  const errores: ErrorPlantilla[] = []

  const codigo = textoDe(p.proyecto.codigo.valor)
  if (codigo.toLowerCase() !== c.proyecto.codigo.trim().toLowerCase()) {
    errores.push(
      error(
        "V-02",
        HOJAS.proyecto,
        p.proyecto.codigo.fila,
        "B",
        codigo,
        `El código de la plantilla no coincide con el del proyecto (${c.proyecto.codigo}).`,
      ),
    )
  }

  if (c.proyecto.estado !== "BORRADOR") {
    errores.push(
      error(
        "V-02",
        HOJAS.proyecto,
        null,
        null,
        c.proyecto.estado,
        "Solo se puede importar la plantilla de un proyecto en Borrador.",
      ),
    )
  }

  return errores
}

// ---------------------------------------------------------------------------
// V-03 — dates, total value and beneficiaries
// ---------------------------------------------------------------------------

export function v03(p: ParsedTemplate, _c: ContextoValidacion): ErrorPlantilla[] {
  void _c
  if (!estructuraOk(p, "proyecto")) return []
  const errores: ErrorPlantilla[] = []

  const inicio = parseFechaCelda(p.proyecto.fechaInicio.valor)
  const fin = parseFechaCelda(p.proyecto.fechaFin.valor)

  if (!inicio) {
    errores.push(error("V-03", HOJAS.proyecto, p.proyecto.fechaInicio.fila, "B", textoDe(p.proyecto.fechaInicio.valor), "La fecha de inicio no es válida."))
  }
  if (!fin) {
    errores.push(error("V-03", HOJAS.proyecto, p.proyecto.fechaFin.fila, "B", textoDe(p.proyecto.fechaFin.valor), "La fecha de fin no es válida."))
  }
  if (inicio && fin && inicio >= fin) {
    errores.push(
      error(
        "V-03",
        HOJAS.proyecto,
        p.proyecto.fechaFin.fila,
        "B",
        textoDe(p.proyecto.fechaFin.valor),
        "La fecha de fin debe ser posterior a la fecha de inicio.",
      ),
    )
  }

  const total = leerDecimal(p.proyecto.valorTotal.valor)
  if (!total.ok) {
    const mensaje =
      total.motivo === "decimales"
        ? "El valor total admite máximo dos decimales."
        : "El valor total no es un monto válido."
    errores.push(error("V-03", HOJAS.proyecto, p.proyecto.valorTotal.fila, "B", textoDe(p.proyecto.valorTotal.valor), mensaje))
  } else if (total.cents <= ZERO) {
    errores.push(error("V-03", HOJAS.proyecto, p.proyecto.valorTotal.fila, "B", total.dec, "El valor total debe ser mayor que cero."))
  } else if (total.cents > MONTO_MAXIMO_CENTS) {
    errores.push(error("V-03", HOJAS.proyecto, p.proyecto.valorTotal.fila, "B", total.dec, "El valor total es demasiado alto."))
  }

  const meta = enteroDeCelda(p.proyecto.metaBeneficiarios.valor)
  if (meta === null || meta < 1 || meta > MAX_META) {
    errores.push(
      error(
        "V-03",
        HOJAS.proyecto,
        p.proyecto.metaBeneficiarios.fila,
        "B",
        textoDe(p.proyecto.metaBeneficiarios.valor),
        `La meta de beneficiarios debe ser un entero entre 1 y ${MAX_META}.`,
      ),
    )
  }

  return errores
}

// ---------------------------------------------------------------------------
// V-04 — strategic lines and municipios
// ---------------------------------------------------------------------------

export function resolverLineaToken(
  token: string,
  c: ContextoValidacion,
): { id: string } | null {
  const texto = token.trim()
  const codigo = texto.includes(" - ") ? texto.split(" - ")[0].trim() : texto
  const encontrada =
    c.lineas.find((linea) => linea.codigo.toLowerCase() === codigo.toLowerCase()) ??
    c.lineas.find((linea) => linea.nombre.toLowerCase() === texto.toLowerCase())
  if (!encontrada || !encontrada.activo) return null
  return { id: encontrada.id }
}

export function resolverMunicipioToken(
  token: string,
  c: ContextoValidacion,
): { id: string } | null {
  const texto = token.trim()
  const porDane = c.municipios.find(
    (municipio) => municipio.codigoDane !== null && municipio.codigoDane.toLowerCase() === texto.toLowerCase(),
  )
  if (porDane) return porDane.activo ? { id: porDane.id } : null

  const conDepartamento = /^(.*?)\s*\(([^)]*)\)$/.exec(texto)
  if (conDepartamento) {
    const nombre = conDepartamento[1].trim().toLowerCase()
    const departamento = conDepartamento[2].trim().toLowerCase()
    const encontrado = c.municipios.find(
      (municipio) => municipio.nombre.toLowerCase() === nombre && municipio.departamento.toLowerCase() === departamento,
    )
    if (!encontrado) return null
    return encontrado.activo ? { id: encontrado.id } : null
  }

  const porNombre = c.municipios.filter((municipio) => municipio.nombre.toLowerCase() === texto.toLowerCase())
  if (porNombre.length !== 1) return null
  return porNombre[0].activo ? { id: porNombre[0].id } : null
}

export function v04(p: ParsedTemplate, c: ContextoValidacion): ErrorPlantilla[] {
  if (!estructuraOk(p, "proyecto")) return []
  const errores: ErrorPlantilla[] = []

  const lineas = tokensLista(p.proyecto.lineas.valor)
  if (lineas.length === 0) {
    errores.push(error("V-04", HOJAS.proyecto, p.proyecto.lineas.fila, "B", null, "Selecciona al menos una línea estratégica."))
  }
  const idsLineas: string[] = []
  for (const token of lineas) {
    const resuelta = resolverLineaToken(token, c)
    if (!resuelta) {
      errores.push(
        error("V-04", HOJAS.proyecto, p.proyecto.lineas.fila, "B", token, `La línea estratégica «${token}» no existe o está suspendida.`),
      )
    } else if (idsLineas.includes(resuelta.id)) {
      errores.push(error("V-04", HOJAS.proyecto, p.proyecto.lineas.fila, "B", token, `La línea estratégica «${token}» está repetida.`))
    } else {
      idsLineas.push(resuelta.id)
    }
  }

  const municipios = tokensLista(p.proyecto.municipios.valor)
  if (municipios.length === 0) {
    errores.push(error("V-04", HOJAS.proyecto, p.proyecto.municipios.fila, "B", null, "Selecciona al menos un municipio."))
  }
  const idsMunicipios: string[] = []
  for (const token of municipios) {
    const resuelto = resolverMunicipioToken(token, c)
    if (!resuelto) {
      errores.push(
        error("V-04", HOJAS.proyecto, p.proyecto.municipios.fila, "B", token, `El municipio «${token}» no existe o está suspendido.`),
      )
    } else if (idsMunicipios.includes(resuelto.id)) {
      errores.push(error("V-04", HOJAS.proyecto, p.proyecto.municipios.fila, "B", token, `El municipio «${token}» está repetido.`))
    } else {
      idsMunicipios.push(resuelto.id)
    }
  }

  return errores
}

// ---------------------------------------------------------------------------
// V-05 — unique codes per sheet
// ---------------------------------------------------------------------------

export function v05(p: ParsedTemplate, _c: ContextoValidacion): ErrorPlantilla[] {
  void _c
  const errores: ErrorPlantilla[] = []

  for (const key of HOJAS_CODIGO) {
    if (!estructuraOk(p, key)) continue
    const filas = p[key]
    const porCodigo = new Map<string, number[]>()
    for (const fila of filas) {
      const celda = celdaDe(fila, "Código")
      const codigo = textoDe(celda?.valor)
      if (codigo === "") {
        errores.push(error("V-05", HOJAS[key], fila.fila, celda?.columna ?? "A", null, "El código no puede estar vacío."))
        continue
      }
      if (codigo.length > 50) {
        errores.push(error("V-05", HOJAS[key], fila.fila, celda?.columna ?? "A", codigo, "El código es demasiado largo (máximo 50 caracteres)."))
      }
      const clave = codigo.toLowerCase()
      porCodigo.set(clave, [...(porCodigo.get(clave) ?? []), fila.fila])
    }
    for (const filasCodigo of porCodigo.values()) {
      if (filasCodigo.length > 1) {
        for (const numero of filasCodigo) {
          errores.push(error("V-05", HOJAS[key], numero, "A", null, "El código está repetido en esta hoja."))
        }
      }
    }
  }

  return errores
}

// ---------------------------------------------------------------------------
// V-06 — cross-sheet references
// ---------------------------------------------------------------------------

function codigosDe(p: ParsedTemplate, key: (typeof HOJAS_CODIGO)[number]): Set<string> {
  return new Set(p[key].map((fila) => textoCelda(fila, "Código").toLowerCase()).filter((codigo) => codigo !== ""))
}

export function v06(p: ParsedTemplate, _c: ContextoValidacion): ErrorPlantilla[] {
  void _c
  const errores: ErrorPlantilla[] = []

  if (estructuraOk(p, "actividades") && estructuraOk(p, "objetivos")) {
    const objetivos = codigosDe(p, "objetivos")
    for (const fila of p.actividades) {
      const celda = celdaDe(fila, "Código objetivo")
      const referencia = textoDe(celda?.valor)
      if (!objetivos.has(referencia.toLowerCase())) {
        errores.push(
          error("V-06", HOJAS.actividades, fila.fila, celda?.columna ?? "B", referencia || null, `El objetivo «${referencia}» no existe en la hoja ${HOJAS.objetivos}.`),
        )
      }
    }
  }

  if (estructuraOk(p, "entregables") && estructuraOk(p, "actividades")) {
    const actividades = codigosDe(p, "actividades")
    for (const fila of p.entregables) {
      const celda = celdaDe(fila, "Código actividad")
      const referencia = textoDe(celda?.valor)
      if (!actividades.has(referencia.toLowerCase())) {
        errores.push(
          error("V-06", HOJAS.entregables, fila.fila, celda?.columna ?? "B", referencia || null, `La actividad «${referencia}» no existe en la hoja ${HOJAS.actividades}.`),
        )
      }
    }
  }

  if (estructuraOk(p, "indicadores") && estructuraOk(p, "objetivos")) {
    const objetivos = codigosDe(p, "objetivos")
    for (const fila of p.indicadores) {
      const celda = celdaDe(fila, "Código objetivo")
      const referencia = textoDe(celda?.valor)
      if (!objetivos.has(referencia.toLowerCase())) {
        errores.push(
          error("V-06", HOJAS.indicadores, fila.fila, celda?.columna ?? "B", referencia || null, `El objetivo «${referencia}» no existe en la hoja ${HOJAS.objetivos}.`),
        )
      }
    }
  }

  return errores
}

// ---------------------------------------------------------------------------
// V-07 — weeks inside the project duration
// ---------------------------------------------------------------------------

export function v07(p: ParsedTemplate, _c: ContextoValidacion): ErrorPlantilla[] {
  void _c
  if (!estructuraOk(p, "actividades") || !estructuraOk(p, "proyecto")) return []

  const inicio = parseFechaCelda(p.proyecto.fechaInicio.valor)
  const fin = parseFechaCelda(p.proyecto.fechaFin.valor)
  // V-03 already reports unusable dates; without a duration there is no bound.
  if (!inicio || !fin || inicio >= fin) return []
  const duracion = durationWeeks(inicio, fin)

  const errores: ErrorPlantilla[] = []
  for (const fila of p.actividades) {
    const celdaInicio = celdaDe(fila, "Semana inicio")
    const celdaFin = celdaDe(fila, "Semana fin")
    const semanaInicio = enteroDeCelda(celdaInicio?.valor)
    const semanaFin = enteroDeCelda(celdaFin?.valor)

    if (semanaInicio === null) {
      errores.push(error("V-07", HOJAS.actividades, fila.fila, celdaInicio?.columna ?? "D", textoDe(celdaInicio?.valor), "La semana inicial debe ser un número entero."))
    }
    if (semanaFin === null) {
      errores.push(error("V-07", HOJAS.actividades, fila.fila, celdaFin?.columna ?? "E", textoDe(celdaFin?.valor), "La semana final debe ser un número entero."))
    }
    if (semanaInicio === null || semanaFin === null) continue

    const resultado = validarSemanas(semanaInicio, semanaFin, duracion)
    if (!resultado.ok) {
      errores.push(error("V-07", HOJAS.actividades, fila.fila, celdaFin?.columna ?? "E", `${semanaInicio}-${semanaFin}`, resultado.message))
    }
  }

  return errores
}

// ---------------------------------------------------------------------------
// V-H1 — required text and DB length limits
// ---------------------------------------------------------------------------

const TEXTOS_REQUERIDOS: { key: (typeof HOJAS_CODIGO)[number]; encabezado: string; max: number }[] = [
  { key: "objetivos", encabezado: "Descripción", max: 2000 },
  { key: "actividades", encabezado: "Nombre", max: 300 },
  { key: "entregables", encabezado: "Descripción", max: 2000 },
  { key: "entregables", encabezado: "Unidad", max: 100 },
  { key: "entregables", encabezado: "Tipo de medio exigido", max: 200 },
  { key: "indicadores", encabezado: "Nombre", max: 300 },
  { key: "indicadores", encabezado: "Unidad", max: 100 },
]

export function vH1(p: ParsedTemplate, _c: ContextoValidacion): ErrorPlantilla[] {
  void _c
  const errores: ErrorPlantilla[] = []

  for (const { key, encabezado, max } of TEXTOS_REQUERIDOS) {
    if (!estructuraOk(p, key)) continue
    for (const fila of p[key]) {
      const celda = celdaDe(fila, encabezado)
      const texto = textoDe(celda?.valor)
      if (texto === "") {
        errores.push(error("V-H1", HOJAS[key], fila.fila, celda?.columna ?? null, null, `${encabezado} es obligatorio.`))
      } else if (texto.length > max) {
        errores.push(
          error("V-H1", HOJAS[key], fila.fila, celda?.columna ?? null, texto, `${encabezado} es demasiado largo (máximo ${max} caracteres).`),
        )
      }
    }
  }

  return errores
}

// ---------------------------------------------------------------------------
// V-H2 — workbook limits and Excel error cells
// ---------------------------------------------------------------------------

/** Excel error literals the parser can surface from an error or formula cell. */
const ERROR_EXCEL =
  /^#(?:NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|GETTING_DATA|SPILL!|CALC!|FIELD!|BLOCKED!|UNKNOWN!|CONNECT!|BUSY!)$/i

function esErrorExcel(valor: Celda["valor"] | undefined): boolean {
  return typeof valor === "string" && ERROR_EXCEL.test(valor.trim())
}

const CELDAS_PROYECTO: (keyof ParsedTemplate["proyecto"])[] = [
  "codigo",
  "lineas",
  "municipios",
  "fechaInicio",
  "fechaFin",
  "valorTotal",
  "metaBeneficiarios",
]

/**
 * Hub guard the SDD lacks (map §3): reports a sheet that exceeded
 * `MAX_FILAS_HOJA` (the parser drops the extra rows), a `8. Programación` that
 * exceeded `MAX_MESES` month columns, and any Excel error/formula cell
 * (`#REF!`, `#DIV/0!`, ...) found in an input cell.
 */
export function vH2(p: ParsedTemplate, _c: ContextoValidacion): ErrorPlantilla[] {
  void _c
  const errores: ErrorPlantilla[] = []

  for (const [hoja, exceso] of Object.entries(p.excesoFilas)) {
    if (exceso > 0) {
      errores.push(
        error(
          "V-H2",
          hoja,
          null,
          null,
          exceso,
          `La hoja tiene ${exceso} fila(s) más de las ${MAX_FILAS_HOJA} permitidas; las filas sobrantes no se importarán.`,
        ),
      )
    }
  }
  if (p.excesoMeses > 0) {
    errores.push(
      error(
        "V-H2",
        HOJAS.programacion,
        1,
        null,
        p.excesoMeses,
        `La programación tiene ${p.excesoMeses} columna(s) de mes más de las ${MAX_MESES} permitidas; las columnas sobrantes no se importarán.`,
      ),
    )
  }

  const revisarCelda = (celda: Celda): void => {
    if (esErrorExcel(celda.valor)) {
      errores.push(
        error(
          "V-H2",
          celda.hoja,
          celda.fila,
          celda.columna,
          celda.valor,
          `La celda contiene un error de Excel (${celda.valor}): valor no válido.`,
        ),
      )
    }
  }

  for (const key of CELDAS_PROYECTO) revisarCelda(p.proyecto[key])
  for (const filas of [p.objetivos, p.actividades, p.entregables, p.indicadores, p.presupuesto, p.programacion.filas]) {
    for (const fila of filas) for (const celda of Object.values(fila.celdas)) revisarCelda(celda)
  }

  return errores
}

// ---------------------------------------------------------------------------
// V-08 — every activity has at least one deliverable
// ---------------------------------------------------------------------------

export function v08(p: ParsedTemplate, _c: ContextoValidacion): ErrorPlantilla[] {
  void _c
  if (!estructuraOk(p, "actividades") || !estructuraOk(p, "entregables")) return []
  const conEntregables = new Set(p.entregables.map((fila) => textoCelda(fila, "Código actividad").toLowerCase()))
  const errores: ErrorPlantilla[] = []
  for (const fila of p.actividades) {
    const codigo = textoCelda(fila, "Código")
    if (!conEntregables.has(codigo.toLowerCase())) {
      errores.push(
        error("V-08", HOJAS.actividades, fila.fila, celdaDe(fila, "Código")?.columna ?? "A", codigo, `La actividad «${codigo}» no tiene entregables.`),
      )
    }
  }
  return errores
}

// ---------------------------------------------------------------------------
// V-09 — positive quantities, metas and weights
// ---------------------------------------------------------------------------

function revisarPositivo(
  fila: Fila,
  encabezado: string,
  hoja: string,
  etiqueta: string,
  columnaPorDefecto: string,
): ErrorPlantilla[] {
  const celda = celdaDe(fila, encabezado)
  const crudo = textoDe(celda?.valor)
  const columna = celda?.columna ?? columnaPorDefecto
  if (crudo === "") return [error("V-09", hoja, fila.fila, columna, null, `${etiqueta} es obligatoria.`)]
  const dec = decimalDeCelda(celda?.valor)
  if (dec === null) return [error("V-09", hoja, fila.fila, columna, crudo, `${etiqueta} no es un número válido.`)]
  const cents = toCents(redondear2(dec))
  if (cents <= ZERO) return [error("V-09", hoja, fila.fila, columna, crudo, `${etiqueta} debe ser mayor que cero.`)]
  if (cents > MONTO_MAXIMO_CENTS) return [error("V-09", hoja, fila.fila, columna, crudo, `${etiqueta} es demasiado alta.`)]
  return []
}

export function v09(p: ParsedTemplate, _c: ContextoValidacion): ErrorPlantilla[] {
  void _c
  const errores: ErrorPlantilla[] = []

  if (estructuraOk(p, "actividades")) {
    for (const fila of p.actividades) {
      const celda = celdaDe(fila, "Peso (opcional)")
      const crudo = textoDe(celda?.valor)
      if (crudo === "") continue
      const dec = decimalDeCelda(celda?.valor)
      const columna = celda?.columna ?? "G"
      if (dec === null) {
        errores.push(error("V-09", HOJAS.actividades, fila.fila, columna, crudo, "El peso no es un número válido."))
        continue
      }
      const cents = toCents(redondear2(dec))
      if (cents <= ZERO) {
        errores.push(error("V-09", HOJAS.actividades, fila.fila, columna, crudo, "El peso debe ser mayor que cero."))
      } else if (cents > MAX_PESO_CENTS) {
        errores.push(error("V-09", HOJAS.actividades, fila.fila, columna, crudo, "El peso es demasiado alto."))
      }
    }
  }

  if (estructuraOk(p, "entregables")) {
    for (const fila of p.entregables) {
      errores.push(...revisarPositivo(fila, "Cantidad", HOJAS.entregables, "La cantidad", "D"))
    }
  }

  if (estructuraOk(p, "indicadores")) {
    for (const fila of p.indicadores) {
      errores.push(...revisarPositivo(fila, "Meta", HOJAS.indicadores, "La meta", "D"))
      const celda = celdaDe(fila, "Línea base")
      const crudo = textoDe(celda?.valor)
      if (crudo === "") continue
      const dec = decimalDeCelda(celda?.valor)
      const columna = celda?.columna ?? "F"
      if (dec === null) {
        errores.push(error("V-09", HOJAS.indicadores, fila.fila, columna, crudo, "La línea base no es un número válido."))
        continue
      }
      const cents = toCents(redondear2(dec))
      if (cents < ZERO) {
        errores.push(error("V-09", HOJAS.indicadores, fila.fila, columna, crudo, "La línea base no puede ser negativa."))
      } else if (cents > MONTO_MAXIMO_CENTS) {
        errores.push(error("V-09", HOJAS.indicadores, fila.fila, columna, crudo, "La línea base es demasiado alta."))
      }
    }
  }

  return errores
}

// ---------------------------------------------------------------------------
// V-10 — every objective has at least one activity
// ---------------------------------------------------------------------------

export function v10(p: ParsedTemplate, _c: ContextoValidacion): ErrorPlantilla[] {
  void _c
  if (!estructuraOk(p, "objetivos") || !estructuraOk(p, "actividades")) return []
  const conActividades = new Set(p.actividades.map((fila) => textoCelda(fila, "Código objetivo").toLowerCase()))
  const errores: ErrorPlantilla[] = []
  for (const fila of p.objetivos) {
    const codigo = textoCelda(fila, "Código")
    if (!conActividades.has(codigo.toLowerCase())) {
      errores.push(
        error("V-10", HOJAS.objetivos, fila.fila, celdaDe(fila, "Código")?.columna ?? "A", codigo, `El objetivo «${codigo}» no tiene actividades.`),
      )
    }
  }
  return errores
}

// ---------------------------------------------------------------------------
// V-11 — budget rubros
// ---------------------------------------------------------------------------

export function v11(p: ParsedTemplate, c: ContextoValidacion): ErrorPlantilla[] {
  if (!estructuraOk(p, "presupuesto")) return []
  const activos = new Set(c.rubros.filter((rubro) => rubro.activo).map((rubro) => rubro.codigo))
  const vistos = new Set<string>()
  const errores: ErrorPlantilla[] = []

  for (const fila of p.presupuesto) {
    const celdaCodigo = celdaDe(fila, "Código rubro")
    const codigo = textoDe(celdaCodigo?.valor)
    const columna = celdaCodigo?.columna ?? "A"
    if (codigo === "") {
      errores.push(error("V-11", HOJAS.presupuesto, fila.fila, columna, null, "El código del rubro no puede estar vacío."))
    } else if (!activos.has(codigo)) {
      errores.push(error("V-11", HOJAS.presupuesto, fila.fila, columna, codigo, `El rubro «${codigo}» no existe o está suspendido.`))
    } else if (vistos.has(codigo)) {
      errores.push(error("V-11", HOJAS.presupuesto, fila.fila, columna, codigo, `El rubro «${codigo}» está repetido.`))
    } else {
      vistos.add(codigo)
    }

    const celdaValor = celdaDe(fila, "Valor asignado")
    const asignado = leerDecimal(celdaValor?.valor)
    const columnaValor = celdaValor?.columna ?? "C"
    if (!asignado.ok) {
      const mensaje =
        asignado.motivo === "decimales"
          ? "El valor asignado admite máximo dos decimales."
          : asignado.motivo === "vacio"
            ? "El valor asignado es obligatorio."
            : "El valor asignado no es un monto válido."
      errores.push(error("V-11", HOJAS.presupuesto, fila.fila, columnaValor, textoDe(celdaValor?.valor), mensaje))
    } else if (asignado.cents < ZERO) {
      errores.push(error("V-11", HOJAS.presupuesto, fila.fila, columnaValor, asignado.dec, "El valor asignado no puede ser negativo."))
    } else if (asignado.cents > MONTO_MAXIMO_CENTS) {
      errores.push(error("V-11", HOJAS.presupuesto, fila.fila, columnaValor, asignado.dec, "El valor asignado es demasiado alto."))
    }
  }

  return errores
}

// ---------------------------------------------------------------------------
// V-12 / W-02 — the budget sum against the project total
// ---------------------------------------------------------------------------

/** The template total and the budget sum, or `null` when either cannot be read. */
function totalYSuma(p: ParsedTemplate): { total: Cents; suma: Cents } | null {
  if (!estructuraOk(p, "presupuesto") || !estructuraOk(p, "proyecto")) return null
  const total = leerDecimal(p.proyecto.valorTotal.valor)
  if (!total.ok) return null

  const asignados: Cents[] = []
  for (const fila of p.presupuesto) {
    const asignado = leerDecimal(celdaDe(fila, "Valor asignado")?.valor)
    if (asignado.ok && asignado.cents >= ZERO) asignados.push(asignado.cents)
  }
  return { total: total.cents, suma: sumCents(asignados) }
}

function mensajeDiferencia(total: Cents, suma: Cents): string {
  return `El presupuesto suma ${formatCOP(suma)} y el valor total es ${formatCOP(total)} (diferencia ${formatCOP(total - suma)}).`
}

/**
 * V-12: an empty budget cannot back the project total. A funded budget that
 * differs from the total is not an error (PO feedback 2026-10-23): the executed
 * budget is the value the project tracks, so the import takes its sum (W-02).
 */
export function v12(p: ParsedTemplate, _c: ContextoValidacion): ErrorPlantilla[] {
  void _c
  const cifras = totalYSuma(p)
  if (!cifras || cifras.suma !== ZERO || cifras.total === ZERO) return []

  return [
    error("V-12", HOJAS.presupuesto, null, "C", fromCents(cifras.total - cifras.suma), mensajeDiferencia(cifras.total, cifras.suma)),
  ]
}

/** W-02 (warning, never blocking): the budget sum replaces a different template total. */
export function w02(p: ParsedTemplate, _c: ContextoValidacion): ErrorPlantilla[] {
  void _c
  const cifras = totalYSuma(p)
  if (!cifras || cifras.suma === ZERO || cifras.suma === cifras.total) return []

  return [
    error(
      "W-02",
      HOJAS.proyecto,
      p.proyecto.valorTotal.fila,
      "B",
      fromCents(cifras.total),
      `${mensajeDiferencia(cifras.total, cifras.suma)} Se importará ${formatCOP(cifras.suma)} como valor total del proyecto.`,
    ),
  ]
}

// ---------------------------------------------------------------------------
// V-13 — the monthly programming sums to the assigned amount
// ---------------------------------------------------------------------------

export function v13(p: ParsedTemplate, _c: ContextoValidacion): ErrorPlantilla[] {
  void _c
  if (!estructuraOk(p, "presupuesto") || !estructuraOk(p, "programacion")) return []

  const asignadoPorRubro = new Map<string, Cents>()
  for (const fila of p.presupuesto) {
    const codigo = textoDe(celdaDe(fila, "Código rubro")?.valor)
    const asignado = leerDecimal(celdaDe(fila, "Valor asignado")?.valor)
    if (codigo !== "" && asignado.ok) asignadoPorRubro.set(codigo, asignado.cents)
  }

  const errores: ErrorPlantilla[] = []
  for (const fila of p.programacion.filas) {
    const celda = celdaDe(fila, "Código rubro")
    const codigo = textoDe(celda?.valor)
    if (codigo === "") continue

    const celdas: Cents[] = []
    for (const mes of p.programacion.meses) {
      const dec = decimalDeCelda(fila.celdas[mes.encabezado]?.valor)
      if (dec !== null) celdas.push(toCents(redondear2(dec)))
    }
    const suma = sumCents(celdas)
    const asignado = asignadoPorRubro.get(codigo) ?? ZERO
    if (suma !== asignado) {
      const diferencia = asignado - suma
      errores.push(
        error(
          "V-13",
          HOJAS.programacion,
          fila.fila,
          celda?.columna ?? "A",
          codigo,
          `La programación de ${codigo} suma ${formatCOP(suma)} pero el presupuesto asigna ${formatCOP(asignado)} (diferencia ${formatCOP(diferencia)}).`,
        ),
      )
    }
  }

  return errores
}

// ---------------------------------------------------------------------------
// V-14 — month columns inside the project period
// ---------------------------------------------------------------------------

export function v14(p: ParsedTemplate, _c: ContextoValidacion): ErrorPlantilla[] {
  void _c
  if (!estructuraOk(p, "programacion") || !estructuraOk(p, "proyecto")) return []

  const inicio = parseFechaCelda(p.proyecto.fechaInicio.valor)
  const fin = parseFechaCelda(p.proyecto.fechaFin.valor)
  const periodosValidos =
    inicio && fin && inicio < fin ? new Set<Periodo>(projectPeriods(inicio, fin)) : null

  const errores: ErrorPlantilla[] = []

  const porEncabezado = new Map<string, number>()
  for (const mes of p.programacion.meses) {
    const clave = mes.encabezado.toLowerCase()
    porEncabezado.set(clave, (porEncabezado.get(clave) ?? 0) + 1)

    if (mes.periodo === null) {
      errores.push(error("V-14", HOJAS.programacion, 1, mes.columna, mes.encabezado, "El encabezado del mes no es válido."))
      continue
    }
    if (periodosValidos && !periodosValidos.has(mes.periodo)) {
      const conValor = p.programacion.filas.some((fila) => {
        const dec = decimalDeCelda(fila.celdas[mes.encabezado]?.valor)
        return dec !== null && toCents(redondear2(dec)) !== ZERO
      })
      if (conValor) {
        errores.push(
          error("V-14", HOJAS.programacion, 1, mes.columna, mes.encabezado, `El mes ${mes.periodo} está fuera del período del proyecto.`),
        )
      }
    }
  }
  for (const [encabezado, veces] of porEncabezado) {
    if (veces > 1) {
      errores.push(error("V-14", HOJAS.programacion, 1, null, encabezado, `El encabezado «${encabezado}» está repetido.`))
    }
  }

  for (const fila of p.programacion.filas) {
    for (const mes of p.programacion.meses) {
      const celda = fila.celdas[mes.encabezado]
      if (!celda) continue
      const crudo = textoDe(celda.valor)
      if (crudo === "") continue
      const dec = decimalDeCelda(celda.valor)
      if (dec === null) {
        errores.push(error("V-14", HOJAS.programacion, fila.fila, mes.columna, crudo, "El valor del mes no es un número válido."))
        continue
      }
      if (contarDecimales(dec) > 2) {
        errores.push(error("V-14", HOJAS.programacion, fila.fila, mes.columna, crudo, "El valor del mes admite máximo dos decimales."))
        continue
      }
      if (toCents(dec) < ZERO) {
        errores.push(error("V-14", HOJAS.programacion, fila.fila, mes.columna, crudo, "El valor del mes no puede ser negativo."))
      }
    }
  }

  return errores
}

// ---------------------------------------------------------------------------
// W-01 — responsable emails (warning, never blocking)
// ---------------------------------------------------------------------------

export function w01(p: ParsedTemplate, c: ContextoValidacion): ErrorPlantilla[] {
  if (!estructuraOk(p, "actividades")) return []
  const registrados = new Set(c.usuarios.map((usuario) => usuario.email.trim().toLowerCase()))
  const advertencias: ErrorPlantilla[] = []

  for (const fila of p.actividades) {
    const celda = celdaDe(fila, "Responsable (correo)")
    const email = textoDe(celda?.valor)
    if (email === "") continue
    if (!registrados.has(email.toLowerCase())) {
      advertencias.push(
        error(
          "W-01",
          HOJAS.actividades,
          fila.fila,
          celda?.columna ?? "F",
          email,
          `El responsable «${email}» no está registrado; la actividad se guardará sin responsable.`,
        ),
      )
    }
  }

  return advertencias
}

// ---------------------------------------------------------------------------
// The composed validator
// ---------------------------------------------------------------------------

const ORDEN_HOJAS: string[] = Object.values(HOJAS)

/** Errors sorted by sheet order, then row, then column. */
function compararError(a: ErrorPlantilla, b: ErrorPlantilla): number {
  const hojaA = ORDEN_HOJAS.indexOf(a.hoja)
  const hojaB = ORDEN_HOJAS.indexOf(b.hoja)
  if (hojaA !== hojaB) return hojaA - hojaB
  const filaA = a.fila ?? 0
  const filaB = b.fila ?? 0
  if (filaA !== filaB) return filaA - filaB
  return columnIndex(a.columna) - columnIndex(b.columna)
}

/**
 * Runs every rule, sorts the report and caps the error list at `MAX_ERRORES`.
 * `resumen` counts every finding (errors and warnings) by rule before the cap,
 * so a truncated list still reports the true per-rule totals.
 */
export function validarPlantilla(p: ParsedTemplate, c: ContextoValidacion): ResultadoValidacion {
  const reglas: ((p: ParsedTemplate, c: ContextoValidacion) => ErrorPlantilla[])[] = [
    v01,
    v02,
    v03,
    v04,
    v05,
    v06,
    v07,
    v08,
    v09,
    v10,
    v11,
    v12,
    v13,
    v14,
    vH1,
    vH2,
  ]
  const errores: ErrorPlantilla[] = []
  for (const regla of reglas) errores.push(...regla(p, c))
  const advertencias = [...w01(p, c), ...w02(p, c)]

  errores.sort(compararError)
  advertencias.sort(compararError)

  const resumen: Record<string, number> = {}
  for (const hallazgo of [...errores, ...advertencias]) {
    resumen[hallazgo.regla] = (resumen[hallazgo.regla] ?? 0) + 1
  }

  const truncado = errores.length > MAX_ERRORES
  return {
    errores: truncado ? errores.slice(0, MAX_ERRORES) : errores,
    advertencias,
    resumen,
    truncado,
  }
}

