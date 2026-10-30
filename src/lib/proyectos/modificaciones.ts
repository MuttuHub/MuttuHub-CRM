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
 * One field change. `clave` is the business key: rubro code (presupuesto), `R12|AAAA-MM`
 * (programacion), `proyecto`, or the activity / deliverable / indicator code. `antes` is what the
 * requester saw; `despues` the proposed value. Money and quantities travel as decimal text.
 */
export type DetalleItem = {
  elemento: DetalleElemento
  clave: string
  campo?: string
  antes: string
  despues: string
}

export type ErrorReglaCodigo =
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
const claveCelda = (rubro: string, periodo: string) => `${rubro}|${periodo}`

/** The live value of the field a detail item points at; null when the element does not exist. */
function valorActual(live: LiveProyecto, item: DetalleItem, campo: string): string | null {
  switch (item.elemento) {
    case "presupuesto": {
      const fila = live.presupuesto.find((r) => r.rubro_codigo === item.clave)
      return normalizar("dinero", fila ? fila.asignado : "0")
    }
    case "programacion": {
      if (!CLAVE_CELDA.test(item.clave)) return null
      const fila = live.programacion.find((c) => claveCelda(c.rubro_codigo ?? "", c.periodo) === item.clave)
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
  s: Solicitud,
  catalogo: ReadonlyMap<string, string> = new Map(),
): LiveProyecto {
  const proyecto = { ...live.proyecto }
  const lineas = new Map(live.presupuesto.map((r) => [r.rubro_codigo ?? "", { ...r }]))
  const celdas = new Map(live.programacion.map((c) => [claveCelda(c.rubro_codigo ?? "", c.periodo), { ...c }]))
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
        else lineas.set(item.clave, { rubro_codigo: item.clave, rubro_nombre: catalogo.get(item.clave) ?? item.clave, asignado: despues })
        break
      }
      case "programacion": {
        const [, rubro = "", periodo = ""] = CLAVE_CELDA.exec(item.clave) ?? []
        const fila = celdas.get(item.clave)
        if (fila) fila.valor = despues
        else celdas.set(item.clave, { rubro_codigo: rubro, periodo, valor: despues })
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
  const conCeldas = new Set(programacion.map((c) => c.rubro_codigo))
  const presupuesto = [...lineas.values()].filter((r) => toCents(r.asignado) > ZERO || conCeldas.has(r.rubro_codigo))

  if (s.tipo === "ADICION" || s.tipo === "REDUCCION") {
    proyecto.valor_total = fromCents(sumCents(presupuesto.map((r) => toCents(r.asignado))))
  }
  return { proyecto, presupuesto, programacion, actividades, entregables, indicadores }
}

const asignadoPorRubro = (live: LiveProyecto): Map<string, Cents> =>
  new Map(live.presupuesto.map((r) => [r.rubro_codigo ?? "", toCents(r.asignado)]))

const celdasPorClave = (live: LiveProyecto): Map<string, Cents> =>
  new Map(live.programacion.map((c) => [claveCelda(c.rubro_codigo ?? "", c.periodo), toCents(c.valor)]))

/**
 * Every rule of RF-28 plus REQ-GAS-06. `ejecutado` is the VALIDADO total per rubro code (the caller
 * reads it under the line locks at approval time), `periodoActual` the current Bogota month.
 * Returns all the failures, never just the first; an empty list means the request may proceed.
 */
export function validarModificacion(
  live: LiveProyecto,
  s: Solicitud,
  ejecutado: ReadonlyMap<string, Cents>,
  periodoActual: Periodo,
  params: { bloqueaPeriodosPasados: boolean },
): ErrorRegla[] {
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

  // Budget deltas per rubro.
  const antes = asignadoPorRubro(live)
  const nuevo = asignadoPorRubro(despues)
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
      const periodo = clave.slice(clave.indexOf("|") + 1)
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
    // The post-state budget must still be balanced and inside the project periods.
    if (s.tipo !== "ENTREGABLES" || fechasCambian) {
      const fallas = precondicionesPresupuesto({
        valorTotal: null,
        lineas: despues.presupuesto.map((r) => ({
          rubroId: r.rubro_codigo ?? "",
          nombre: r.rubro_nombre,
          asignado: toCents(r.asignado),
          activo: true,
        })),
        programacion: despues.programacion.map((c) => ({
          rubroId: c.rubro_codigo ?? "",
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
