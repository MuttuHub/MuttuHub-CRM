// RF-28: the pure rules of a project modification request (S8). `applyModificacion` turns the live
// project plus a request detail into the project as it would be after the approval, and
// `validarModificacion` decides whether that is allowed. Framework- and DB-free, like
// `versiones.ts`: the request route (dry run) and the approval transaction (under the line locks)
// call the SAME functions, so what was accepted at request time is judged by the same rules at
// approval time.

import { pesoActividad, validarSemanas } from "./actividad"
import { precondicionesPresupuesto } from "./ficha-financiera"
import { formatCOP, fromCents, sumCents, toCents, type Cents } from "./money"
import { MENSAJE_RANGO_FECHAS, rangoFechasValido } from "./rango-fechas"
import { decimal, money, type LiveProyecto } from "./versiones"
import { assertIsoDate, durationWeeks, projectPeriods, type Periodo } from "./weeks"

export type TipoModificacion = "TRASLADO" | "ADICION" | "REDUCCION" | "REPROGRAMACION" | "CRONOGRAMA" | "ENTREGABLES"
export type DetalleElemento = "presupuesto" | "programacion" | "proyecto" | "actividad" | "entregable" | "indicador"

/**
 * One field change. `clave` is the business key: the budget line (`1.1|R12` for an activity line,
 * `R12` for a legacy one) for presupuesto, the line plus the month (`1.1|R12|AAAA-MM`) for
 * programacion, `proyecto`, or the activity / deliverable / indicator code. Requests stored before
 * T13 may address a line by its bare rubro code; see `resolverClaves`. `antes` is what the
 * requester saw; `despues` the proposed value. Money and quantities travel as decimal text.
 */
export type DetalleItem = {
  elemento: DetalleElemento
  clave: string
  campo?: string
  antes: string
  despues: string
}

type ErrorReglaCodigo =
  | "TRASLADO_CAMBIA_TOTAL"
  | "ADICION_NO_AUMENTA"
  | "REDUCCION_NO_DISMINUYE"
  | "A_MENOR_QUE_EJECUTADO"
  | "PERIODO_PASADO"
  | "PROGRAMACION_DESCUADRADA"
  | "PERIODO_FUERA_DE_RANGO"
  | "ELEMENTO_NO_PERMITIDO"
  | "ELEMENTO_INEXISTENTE"
  | "ANTES_DESACTUALIZADO"
  | "SEMANAS_INVALIDAS"
  | "FECHAS_INVALIDAS"
  | "VALOR_INVALIDO"
  | "DETALLE_DUPLICADO"
  | "DETALLE_VACIO"
  | "CLAVE_AMBIGUA"

export type ErrorRegla = { codigo: ErrorReglaCodigo; mensaje: string; clave?: string }

type Solicitud = { tipo: TipoModificacion; detalle: readonly DetalleItem[] }

/** Fields each tipo may touch. D7: nothing is added or removed, only existing values change. */
export const CAMPOS_PERMITIDOS: Record<TipoModificacion, Partial<Record<DetalleElemento, readonly string[]>>> = {
  TRASLADO: { presupuesto: ["asignado"], programacion: ["valor"] },
  ADICION: { presupuesto: ["asignado"], programacion: ["valor"] },
  REDUCCION: { presupuesto: ["asignado"], programacion: ["valor"] },
  REPROGRAMACION: { programacion: ["valor"] },
  CRONOGRAMA: { proyecto: ["fecha_inicio", "fecha_fin"], actividad: ["semana_inicio", "semana_fin"] },
  ENTREGABLES: { entregable: ["cantidad_meta", "descripcion", "unidad"], indicador: ["meta", "nombre", "unidad"] },
}

type Clase = "dinero" | "cantidad" | "entero" | "fecha" | "texto"

function claseDe(elemento: DetalleElemento, campo: string): Clase {
  if (elemento === "presupuesto" || elemento === "programacion") return "dinero"
  if (campo === "cantidad_meta" || campo === "meta") return "cantidad"
  if (campo === "semana_inicio" || campo === "semana_fin") return "entero"
  if (campo === "fecha_inicio" || campo === "fecha_fin") return "fecha"
  return "texto"
}

const campoDe = (item: DetalleItem): string =>
  item.campo ?? (item.elemento === "presupuesto" ? "asignado" : item.elemento === "programacion" ? "valor" : "")

/** Canonical text of a value of its class, or null when it is not a valid one. */
function normalizar(clase: Clase, texto: string): string | null {
  const valor = texto.trim()
  switch (clase) {
    case "dinero":
      return /^\d+(?:\.\d{1,2})?$/.test(valor) ? money(valor) : null
    case "cantidad":
      return /^\d+(?:\.\d{1,2})?$/.test(valor) && toCents(valor) > BigInt(0) ? decimal(valor) : null
    case "entero":
      return /^\d+$/.test(valor) ? String(Number(valor)) : null
    case "fecha":
      try {
        assertIsoDate(valor)
        return valor
      } catch {
        return null
      }
    case "texto":
      return valor.length > 0 ? valor : null
  }
}

const CLAVE_CELDA = /^(.+)\|(\d{4}-(?:0[1-9]|1[0-2]))$/
const claveCelda = (linea: string, periodo: string) => `${linea}|${periodo}`

type FilaConClave = { rubro_codigo: string | null; codigo_linea?: string | null }

/** T13 (S5): the key of a budget line, as the live reader derives it (`ACT|RUBRO`, or `RUBRO` for a legacy line). */
const claveDeLinea = (fila: FilaConClave): string => fila.codigo_linea ?? fila.rubro_codigo ?? ""

/**
 * The line key of a stored budget line: `ACT|RUBRO`, the bare rubro code for a line without an activity,
 * null for a legacy rubro without a code. The same derivation as `loadLiveProyecto`, for the writers
 * that map a key back to its row.
 */
export function claveLineaDe(rubroCodigo: string | null, actividadCodigo: string | null | undefined): string | null {
  if (rubroCodigo === null) return null
  return actividadCodigo ? `${actividadCodigo}|${rubroCodigo}` : rubroCodigo
}

/** The activity code of a line key; null for a legacy line keyed by its bare rubro. */
const actividadDeClave = (clave: string): string | null => (clave.includes("|") ? clave.slice(0, clave.lastIndexOf("|")) : null)

/**
 * T10: la clave de una fila, leída de las dos formas. Las solicitudes guardadas antes de la Parte 2
 * direccionan por código de rubro (`R12`, `R12|2026-10`); las nuevas pueden direccionar por línea
 * (`1.1|R12`, `1.1|R12|2026-10`). Leer con esto y escribir la forma nueva es la regla de T10.
 */
function coincideClave(fila: FilaConClave, clave: string): boolean {
  return fila.rubro_codigo === clave || fila.codigo_linea === clave
}

/**
 * T13 (S5): the line key a request key points at. A line key is itself; a bare rubro code (the shape of
 * the requests stored before the budget had one line per activity) is the rubro's only line, and
 * `null` when the rubro has several lines, so the request cannot say which. A key no line matches is
 * left as it is: a new rubro line (ADICION) or an element the structural checks report.
 */
function lineaDeClave(live: LiveProyecto, clave: string): string | null {
  if (live.presupuesto.some((r) => claveDeLinea(r) === clave)) return clave
  const lineas = new Set(live.presupuesto.filter((r) => coincideClave(r, clave)).map(claveDeLinea))
  if (lineas.size > 1) return null
  return [...lineas][0] ?? clave
}

const MENSAJE_AMBIGUA = (rubro: string) =>
  `El rubro «${rubro}» tiene varias líneas (una por actividad): la solicitud debe indicar la actividad. Vuelve a crearla.`

/**
 * The detail with every presupuesto / programacion key rewritten to its line key, plus a
 * `CLAVE_AMBIGUA` failure for every old rubro key that matches several lines. Both the rules and the
 * apply read the request through this, so a stored request is judged and applied by the same keys.
 */
function resolverClaves(live: LiveProyecto, s: Solicitud): { solicitud: Solicitud; ambiguas: ErrorRegla[] } {
  const ambiguas: ErrorRegla[] = []
  const detalle = s.detalle.map((item): DetalleItem => {
    if (item.elemento === "presupuesto") {
      const linea = lineaDeClave(live, item.clave)
      if (linea === null) ambiguas.push({ codigo: "CLAVE_AMBIGUA", clave: item.clave, mensaje: MENSAJE_AMBIGUA(item.clave) })
      return linea === null ? item : { ...item, clave: linea }
    }
    if (item.elemento === "programacion") {
      const [, fila, periodo] = CLAVE_CELDA.exec(item.clave) ?? []
      if (fila === undefined || periodo === undefined) return item
      const linea = lineaDeClave(live, fila)
      if (linea === null) ambiguas.push({ codigo: "CLAVE_AMBIGUA", clave: item.clave, mensaje: MENSAJE_AMBIGUA(fila) })
      return linea === null ? item : { ...item, clave: claveCelda(linea, periodo) }
    }
    return item
  })
  return { solicitud: { tipo: s.tipo, detalle }, ambiguas }
}

/** The live value of the field a detail item points at; null when the element does not exist. */
function valorActual(live: LiveProyecto, item: DetalleItem, campo: string): string | null {
  switch (item.elemento) {
    case "presupuesto": {
      const fila = live.presupuesto.find((r) => claveDeLinea(r) === item.clave)
      return normalizar("dinero", fila ? fila.asignado : "0")
    }
    case "programacion": {
      if (!CLAVE_CELDA.test(item.clave)) return null
      const corte = item.clave.lastIndexOf("|")
      const claveFila = item.clave.slice(0, corte)
      const periodo = item.clave.slice(corte + 1)
      const fila = live.programacion.find((c) => c.periodo === periodo && claveDeLinea(c) === claveFila)
      return normalizar("dinero", fila ? fila.valor : "0")
    }
    case "proyecto": {
      if (item.clave !== "proyecto") return null
      const valor = campo === "fecha_inicio" ? live.proyecto.fecha_inicio : live.proyecto.fecha_fin
      return normalizar("fecha", valor)
    }
    case "actividad": {
      const fila = live.actividades.find((a) => a.codigo === item.clave)
      if (!fila) return null
      return String(campo === "semana_inicio" ? fila.semana_inicio : fila.semana_fin)
    }
    case "entregable": {
      const fila = live.entregables.find((e) => e.codigo === item.clave)
      if (!fila) return null
      return campo === "cantidad_meta" ? decimal(fila.cantidad_meta) : campo === "descripcion" ? fila.descripcion : fila.unidad
    }
    case "indicador": {
      const fila = live.indicadores.find((i) => i.codigo === item.clave)
      if (!fila) return null
      return campo === "meta" ? decimal(fila.meta) : campo === "nombre" ? fila.nombre : fila.unidad
    }
  }
}

/** Structural checks of the detail: allowed, existing, well formed, current and not repeated. */
function revisarDetalle(live: LiveProyecto, s: Solicitud): ErrorRegla[] {
  if (s.detalle.length === 0) {
    return [{ codigo: "DETALLE_VACIO", mensaje: "La solicitud debe incluir al menos un cambio." }]
  }
  const errores: ErrorRegla[] = []
  const vistos = new Set<string>()
  for (const item of s.detalle) {
    const campo = campoDe(item)
    const llave = `${item.elemento}|${item.clave}|${campo}`
    if (vistos.has(llave)) {
      errores.push({ codigo: "DETALLE_DUPLICADO", clave: item.clave, mensaje: `El cambio de «${item.clave}» se repite.` })
      continue
    }
    vistos.add(llave)
    if (!CAMPOS_PERMITIDOS[s.tipo][item.elemento]?.includes(campo)) {
      errores.push({
        codigo: "ELEMENTO_NO_PERMITIDO",
        clave: item.clave,
        mensaje: `El elemento «${item.elemento}» no se permite en una modificación de tipo ${s.tipo}.`,
      })
      continue
    }
    const actual = valorActual(live, item, campo)
    if (actual === null) {
      errores.push({ codigo: "ELEMENTO_INEXISTENTE", clave: item.clave, mensaje: `El elemento «${item.clave}» no existe.` })
      continue
    }
    const clase = claseDe(item.elemento, campo)
    if (normalizar(clase, item.despues) === null) {
      errores.push({ codigo: "VALOR_INVALIDO", clave: item.clave, mensaje: `El valor propuesto para «${item.clave}» no es válido.` })
      continue
    }
    if (normalizar(clase, item.antes) !== actual) {
      errores.push({
        codigo: "ANTES_DESACTUALIZADO",
        clave: item.clave,
        mensaje: `El valor actual de «${item.clave}» cambió; recarga e inténtalo de nuevo.`,
      })
    }
  }
  return errores
}

/**
 * The project as it would be after the modification. Assumes a detail that passed
 * `validarModificacion`'s structural checks. A rubro without a line gets one (named from
 * `catalogo`); a line left at A = 0 with no programming, and a cell left at $0, disappear (D6).
 * ADICION / REDUCCION derive `valor_total` as the sum of A (D2); TRASLADO keeps it.
 */
export function applyModificacion(
  live: LiveProyecto,
  solicitud: Solicitud,
  catalogo: ReadonlyMap<string, string> = new Map(),
): LiveProyecto {
  const s = resolverClaves(live, solicitud).solicitud
  const proyecto = { ...live.proyecto }
  const lineas = new Map(live.presupuesto.map((r) => [claveDeLinea(r), { ...r }]))
  const celdas = new Map(live.programacion.map((c) => [claveCelda(claveDeLinea(c), c.periodo), { ...c }]))
  const actividades = live.actividades.map((a) => ({ ...a }))
  const entregables = live.entregables.map((e) => ({ ...e }))
  const indicadores = live.indicadores.map((i) => ({ ...i }))
  const conSemanasNuevas = new Set<string>()

  for (const item of s.detalle) {
    const campo = campoDe(item)
    const despues = normalizar(claseDe(item.elemento, campo), item.despues) ?? item.despues
    switch (item.elemento) {
      case "presupuesto": {
        const fila = lineas.get(item.clave)
        if (fila) fila.asignado = despues
        // A line a request creates has no activity: its key is the bare rubro, as the live reader derives it.
        else lineas.set(item.clave, { rubro_codigo: item.clave, codigo_linea: item.clave, rubro_nombre: catalogo.get(item.clave) ?? item.clave, asignado: despues })
        break
      }
      case "programacion": {
        const [, clave = "", periodo = ""] = CLAVE_CELDA.exec(item.clave) ?? []
        const fila = celdas.get(item.clave)
        // A new cell belongs to its line: it takes the line's rubro (the key of a line a request creates is its rubro).
        if (fila) fila.valor = despues
        else celdas.set(item.clave, { rubro_codigo: lineas.get(clave)?.rubro_codigo ?? clave, codigo_linea: clave, periodo, valor: despues })
        break
      }
      case "proyecto":
        if (campo === "fecha_inicio") proyecto.fecha_inicio = despues
        else proyecto.fecha_fin = despues
        break
      case "actividad": {
        const fila = actividades.find((a) => a.codigo === item.clave)
        if (!fila) break
        if (campo === "semana_inicio") fila.semana_inicio = Number(despues)
        else fila.semana_fin = Number(despues)
        conSemanasNuevas.add(fila.codigo)
        break
      }
      case "entregable": {
        const fila = entregables.find((e) => e.codigo === item.clave)
        if (!fila) break
        if (campo === "cantidad_meta") fila.cantidad_meta = despues
        else if (campo === "descripcion") fila.descripcion = despues
        else fila.unidad = despues
        break
      }
      case "indicador": {
        const fila = indicadores.find((i) => i.codigo === item.clave)
        if (!fila) break
        if (campo === "meta") fila.meta = despues
        else if (campo === "nombre") fila.nombre = despues
        else fila.unidad = despues
        break
      }
    }
  }

  for (const actividad of actividades) {
    if (!conSemanasNuevas.has(actividad.codigo)) continue
    // An impossible range is reported by the validation; there is no weight to derive from it.
    if (actividad.semana_inicio < 1 || actividad.semana_fin < actividad.semana_inicio) continue
    actividad.peso = String(pesoActividad(actividad))
  }

  const ZERO = BigInt(0)
  const programacion = [...celdas.values()].filter((c) => toCents(c.valor) > ZERO)
  const conCeldas = new Set(programacion.map(claveDeLinea))
  const presupuesto = [...lineas.values()].filter((r) => toCents(r.asignado) > ZERO || conCeldas.has(claveDeLinea(r)))

  if (s.tipo === "ADICION" || s.tipo === "REDUCCION") {
    proyecto.valor_total = fromCents(sumCents(presupuesto.map((r) => toCents(r.asignado))))
  }
  return { proyecto, presupuesto, programacion, actividades, entregables, indicadores }
}

const asignadoPorLinea = (live: LiveProyecto): Map<string, Cents> =>
  new Map(live.presupuesto.map((r) => [claveDeLinea(r), toCents(r.asignado)]))

const celdasPorClave = (live: LiveProyecto): Map<string, Cents> =>
  new Map(live.programacion.map((c) => [claveCelda(claveDeLinea(c), c.periodo), toCents(c.valor)]))

/**
 * Every rule of RF-28 plus REQ-GAS-06, per budget line (T13 S5). `ejecutado` is the executed total
 * per line key (the caller reads it under the line locks at approval time), `periodoActual` the
 * current Bogota month. Returns all the failures, never just the first; an empty list means the
 * request may proceed.
 */
export function validarModificacion(
  live: LiveProyecto,
  solicitud: Solicitud,
  ejecutado: ReadonlyMap<string, Cents>,
  periodoActual: Periodo,
  params: { bloqueaPeriodosPasados: boolean },
): ErrorRegla[] {
  const { solicitud: s, ambiguas } = resolverClaves(live, solicitud)
  if (ambiguas.length > 0) return ambiguas
  const estructurales = revisarDetalle(live, s)
  if (estructurales.length > 0) return estructurales

  const despues = applyModificacion(live, s)
  const errores: ErrorRegla[] = []
  const ZERO = BigInt(0)

  const fechasCambian = s.detalle.some((i) => i.elemento === "proyecto")
  const fechasValidas = rangoFechasValido(despues.proyecto.fecha_inicio, despues.proyecto.fecha_fin)
  if (!fechasValidas) {
    errores.push({ codigo: "FECHAS_INVALIDAS", clave: "proyecto", mensaje: MENSAJE_RANGO_FECHAS })
  }

  // Budget deltas per line.
  const antes = asignadoPorLinea(live)
  const nuevo = asignadoPorLinea(despues)
  const rubros = [...new Set([...antes.keys(), ...nuevo.keys()])].sort()
  const deltas = rubros.map((rubro) => ({ rubro, delta: (nuevo.get(rubro) ?? ZERO) - (antes.get(rubro) ?? ZERO) }))
  const sumaDeltas = sumCents(deltas.map((d) => d.delta))

  if (s.tipo === "TRASLADO" && sumaDeltas !== ZERO) {
    errores.push({
      codigo: "TRASLADO_CAMBIA_TOTAL",
      mensaje: `Un traslado no puede cambiar el valor total del proyecto (diferencia ${formatCOP(sumaDeltas)}).`,
    })
  }
  if (s.tipo === "ADICION") {
    for (const { rubro } of deltas.filter((d) => d.delta < ZERO)) {
      errores.push({ codigo: "ADICION_NO_AUMENTA", clave: rubro, mensaje: `Una adición no puede disminuir el rubro «${rubro}».` })
    }
    if (sumaDeltas <= ZERO) {
      errores.push({ codigo: "ADICION_NO_AUMENTA", mensaje: "Una adición debe aumentar el valor total del proyecto." })
    }
  }
  if (s.tipo === "REDUCCION") {
    for (const { rubro } of deltas.filter((d) => d.delta > ZERO)) {
      errores.push({ codigo: "REDUCCION_NO_DISMINUYE", clave: rubro, mensaje: `Una reducción no puede aumentar el rubro «${rubro}».` })
    }
    if (sumaDeltas >= ZERO) {
      errores.push({ codigo: "REDUCCION_NO_DISMINUYE", mensaje: "Una reducción debe disminuir el valor total del proyecto." })
    }
  }

  // REQ-GAS-06: A never below the validated E, even when the rubro leaves the budget.
  for (const rubro of [...new Set([...nuevo.keys(), ...ejecutado.keys()])].sort()) {
    const validado = ejecutado.get(rubro) ?? ZERO
    if ((nuevo.get(rubro) ?? ZERO) < validado) {
      errores.push({
        codigo: "A_MENOR_QUE_EJECUTADO",
        clave: rubro,
        mensaje: `El valor asignado de «${rubro}» no puede quedar por debajo de lo ya ejecutado (${formatCOP(validado)}).`,
      })
    }
  }

  // Elapsed periods stay frozen when the parameter says so (D3: the current month is editable).
  if (params.bloqueaPeriodosPasados) {
    const previo = celdasPorClave(live)
    const posterior = celdasPorClave(despues)
    for (const clave of [...new Set([...previo.keys(), ...posterior.keys()])].sort()) {
      const periodo = clave.slice(clave.lastIndexOf("|") + 1)
      if (periodo < periodoActual && (previo.get(clave) ?? ZERO) !== (posterior.get(clave) ?? ZERO)) {
        errores.push({
          codigo: "PERIODO_PASADO",
          clave,
          mensaje: `El periodo ${periodo} ya transcurrió: no se puede reprogramar.`,
        })
      }
    }
  }

  if (fechasValidas) {
    if (s.tipo === "CRONOGRAMA") {
      const duracion = durationWeeks(despues.proyecto.fecha_inicio, despues.proyecto.fecha_fin)
      for (const actividad of despues.actividades) {
        const revision = validarSemanas(actividad.semana_inicio, actividad.semana_fin, duracion)
        if (!revision.ok) {
          errores.push({ codigo: "SEMANAS_INVALIDAS", clave: actividad.codigo, mensaje: `Actividad ${actividad.codigo}: ${revision.message}` })
        }
      }
    }
    // The post-state budget must still be balanced per line and inside the project periods. The
    // line key is both the control key and the `clave` of the failure.
    if (s.tipo !== "ENTREGABLES" || fechasCambian) {
      const fallas = precondicionesPresupuesto({
        valorTotal: null,
        lineas: despues.presupuesto.map((r) => ({
          lineaId: claveDeLinea(r),
          actividadCodigo: actividadDeClave(claveDeLinea(r)),
          rubroId: claveDeLinea(r),
          nombre: r.rubro_nombre,
          asignado: toCents(r.asignado),
          activo: true,
        })),
        programacion: despues.programacion.map((c) => ({
          lineaId: claveDeLinea(c),
          rubroId: claveDeLinea(c),
          periodo: c.periodo,
          valor: toCents(c.valor),
        })),
        periodosProyecto: projectPeriods(despues.proyecto.fecha_inicio, despues.proyecto.fecha_fin),
      })
      for (const falla of fallas) {
        if (falla.codigo === "CONTROL_PROGRAMACION") {
          errores.push({ codigo: "PROGRAMACION_DESCUADRADA", clave: falla.rubroId, mensaje: falla.mensaje })
        } else if (falla.codigo === "PERIODO_FUERA_DE_RANGO") {
          errores.push({ codigo: "PERIODO_FUERA_DE_RANGO", clave: falla.rubroId, mensaje: falla.mensaje })
        }
      }
    }
  }
  return errores
}
