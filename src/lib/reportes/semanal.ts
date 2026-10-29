// Reporte semanal (S5), detrás de `GET /api/v1/reports/weekly` y de su exportación a Excel. No calcula nada
// propio sobre proyectos: compone las fuentes que ya existen para que el reporte nunca contradiga al Tablero
// gerencial ni a la ficha.
//
// - Portafolio: `cargarPortafolio` (mismo acceso, alcance por rol y KPIs `base=vigente` que el Tablero
//   gerencial) al corte de la semana. El agregado por cliente pasa los KPIs de cada cliente por el mismo
//   `kpisPortafolio` del agregado total; el semáforo y el A/P/E vienen del servidor, nunca se recalculan.
// - Actividades atrasadas y «Requiere atención»: `cargarAtencion` de cada proyecto medible, al mismo corte.
//   Los gastos observados se resumen en un conteo: el reporte no lleva el detalle de ningún gasto (P04).
// - Tareas: cerradas y vencidas de la semana contra la semana anterior, con el mismo alcance global de la
//   cara «Gestión de tareas» (`tareaScopeWhere("all", ...)`).
// - Gastos por validar: solo para quien valida gastos (ADMINISTRADOR/GERENCIA, como la cola
//   `GET /expense-validations`), agregados por proyecto: cantidad, total y el registro más antiguo.
//
// Semana: lunes a domingo en Bogotá (`semana.ts`). El corte es el domingo, o hoy si la semana está en curso.

import type { EstadoProyecto, Usuario } from "@prisma/client"
import { db } from "@/lib/db"
import { apiError } from "@/lib/api/errors"
import { OPEN_TASK_STATES } from "@/lib/api/crm"
import { cargarAtencion } from "@/lib/api/atencion"
import { serializeAgregado } from "@/lib/api/kpis-http"
import { PORTAFOLIO_FORBIDDEN_MESSAGE, cargarPortafolio, puedeVerPortafolio, type Portafolio } from "@/lib/api/portafolio"
import { ESTADOS_PROYECTO_VALIDACION } from "@/lib/api/validacion-gastos"
import { tareaScopeWhere } from "@/lib/dashboard"
import { canManageProjects } from "@/lib/permissions"
import { ATENCION_TITULO, type AtencionItem } from "@/lib/proyectos/atencion"
import { kpisPortafolio, type KpisProyecto } from "@/lib/proyectos/kpis"
import { fromCents, sumCents, toCents } from "@/lib/proyectos/money"
import { assertIsoDate, todayInBogota, type IsoDate } from "@/lib/proyectos/weeks"
import {
  desplazarSemana,
  diaSiguiente,
  enSemana,
  fechaEnBogota,
  inicioDiaBogota,
  semanaDe,
  type Semana,
} from "@/lib/reportes/semana"

export const SEMANA_INVALIDA_MESSAGE = "La semana no es válida. Usa una fecha AAAA-MM-DD."
export const SEMANA_FUTURA_MESSAGE = "La semana todavía no empieza."

/** Proyectos cuya lista de atención se lee a la vez (cada una son varias consultas). */
const LOTE_ATENCION = 4

type ProyectoRef = { id: string; codigo: string; nombre: string }
type AgregadoSerializado = ReturnType<typeof serializeAgregado>
type ResumenKpis = Pick<AgregadoSerializado, "tecnico" | "financiero" | "atrasadas" | "por_color_tecnico" | "por_color_financiero">
type ProyectoPortafolio = Portafolio["proyectos"][number]

export type ReporteSemanal = {
  semana: Semana
  semana_anterior: Semana
  corte: IsoDate
  confirmado: boolean
  portafolio: {
    proyectos: {
      id: string
      codigo: string
      nombre: string
      estado: string
      cliente: { id: string; nombre: string }
      responsable: { id: string; nombre: string } | null
      semaforo_tecnico: ProyectoPortafolio["semaforo_tecnico"]
      semaforo_financiero: ProyectoPortafolio["semaforo_financiero"]
      alerta_retraso: boolean | null
      avance_real: number | null
      avance_programado: number | null
      asignado: string | null
      programado: string | null
      ejecutado: string | null
      atrasadas: number | null
    }[]
    total: ResumenKpis
    por_cliente: (ResumenKpis & { cliente: { id: string; nombre: string }; proyectos: number })[]
  }
  actividades_atrasadas: { proyecto: ProyectoRef; actividad_id: string | null; detalle: string }[]
  tareas: { semana: ConteoTareas; semana_anterior: ConteoTareas }
  atencion: { proyecto: ProyectoRef; items: { tipo: AtencionItem["tipo"]; titulo: string; detalle: string }[] }[]
  /** null para quien no valida gastos: la sección no aplica. */
  gastos_por_validar: {
    cantidad: number
    monto: string
    por_proyecto: { proyecto: ProyectoRef; cantidad: number; monto: string; mas_antiguo: IsoDate }[]
  } | null
}

type ConteoTareas = { cerradas: number; vencidas: number }

/** `semana` es cualquier día de la semana pedida; ausente = la semana en curso en Bogotá. */
export function parseSemana(raw: string | null, hoy: IsoDate): { ok: true; semana: Semana } | { ok: false; response: Response } {
  const fecha = raw === null || raw === "" ? hoy : raw
  try {
    assertIsoDate(fecha)
  } catch {
    return { ok: false, response: apiError(SEMANA_INVALIDA_MESSAGE, 400, "VALIDATION_ERROR") }
  }
  const semana = semanaDe(fecha)
  if (semana.desde > hoy) return { ok: false, response: apiError(SEMANA_FUTURA_MESSAGE, 400, "VALIDATION_ERROR") }
  return { ok: true, semana }
}

/** 403 -> 400 (semana) -> el reporte. */
export async function cargarReporteSemanal(
  usuario: Usuario,
  url: URL,
): Promise<{ ok: true; value: ReporteSemanal } | { ok: false; response: Response }> {
  if (!puedeVerPortafolio(usuario)) {
    return { ok: false, response: apiError(PORTAFOLIO_FORBIDDEN_MESSAGE, 403, "FORBIDDEN") }
  }
  const hoy = todayInBogota()
  const parsed = parseSemana(url.searchParams.get("semana"), hoy)
  if (!parsed.ok) return parsed
  const { semana } = parsed
  const semanaAnterior = desplazarSemana(semana, -1)
  const corte = semana.hasta < hoy ? semana.hasta : hoy

  // Solo el corte: el reporte es del portafolio completo que el rol puede ver.
  const portafolioUrl = new URL(url.origin)
  portafolioUrl.searchParams.set("corte", corte)
  const portafolio = await cargarPortafolio(usuario, portafolioUrl)
  if (!portafolio.ok) return portafolio
  const data = portafolio.value

  const [atencion, tareas, gastos] = await Promise.all([
    leerAtencion(data.proyectos, corte),
    contarTareas(usuario, semana, semanaAnterior, hoy),
    canManageProjects(usuario) ? gastosPorValidar() : Promise.resolve(null),
  ])

  return {
    ok: true,
    value: {
      semana,
      semana_anterior: semanaAnterior,
      corte,
      confirmado: data.confirmado,
      portafolio: {
        proyectos: data.proyectos.map((p) => ({
          id: p.id,
          codigo: p.codigo,
          nombre: p.nombre,
          estado: p.estado,
          cliente: p.cliente,
          responsable: p.responsable,
          semaforo_tecnico: p.semaforo_tecnico,
          semaforo_financiero: p.semaforo_financiero,
          alerta_retraso: p.alerta_retraso,
          avance_real: p.kpis.tecnico?.avance_real ?? null,
          avance_programado: p.kpis.tecnico?.avance_programado ?? null,
          asignado: p.kpis.financiero?.asignado ?? null,
          programado: p.kpis.financiero?.programado ?? null,
          ejecutado: p.kpis.financiero?.ejecutado ?? null,
          atrasadas: p.atrasadas,
        })),
        total: resumen(data.agregado),
        por_cliente: porCliente(data.proyectos, corte),
      },
      actividades_atrasadas: atencion.actividades,
      tareas,
      atencion: atencion.porProyecto,
      gastos_por_validar: gastos,
    },
  }
}

// ---------------------------------------------------------------------------
// Portafolio por cliente
// ---------------------------------------------------------------------------

function resumen(agregado: AgregadoSerializado): ResumenKpis {
  return {
    tecnico: agregado.tecnico,
    financiero: agregado.financiero,
    atrasadas: agregado.atrasadas,
    por_color_tecnico: agregado.por_color_tecnico,
    por_color_financiero: agregado.por_color_financiero,
  }
}

/** Inverso exacto de `serializeKpis`: los montos vuelven a centavos para el mismo `kpisPortafolio`. */
function kpisDesdeJson(kpis: ProyectoPortafolio["kpis"]): KpisProyecto {
  const f = kpis.financiero
  return {
    ...kpis,
    financiero: f ? { ...f, asignado: toCents(f.asignado), programado: toCents(f.programado), ejecutado: toCents(f.ejecutado) } : null,
  }
}

function porCliente(proyectos: readonly ProyectoPortafolio[], corte: IsoDate): ReporteSemanal["portafolio"]["por_cliente"] {
  const grupos = new Map<string, { cliente: { id: string; nombre: string }; kpis: KpisProyecto[] }>()
  for (const p of proyectos) {
    const grupo = grupos.get(p.cliente.id) ?? { cliente: p.cliente, kpis: [] }
    grupo.kpis.push(kpisDesdeJson(p.kpis))
    grupos.set(p.cliente.id, grupo)
  }
  return [...grupos.values()]
    .sort((a, b) => a.cliente.nombre.localeCompare(b.cliente.nombre, "es"))
    .map((g) => ({ cliente: g.cliente, proyectos: g.kpis.length, ...resumen(serializeAgregado(kpisPortafolio(g.kpis, corte))) }))
}

// ---------------------------------------------------------------------------
// Actividades atrasadas y «Requiere atención»
// ---------------------------------------------------------------------------

async function leerAtencion(proyectos: readonly ProyectoPortafolio[], corte: IsoDate) {
  // Solo los proyectos medibles tienen lista (el resto responde vacía): no se consultan.
  const medibles = proyectos.filter((p) => p.kpis.medible)
  const bases = medibles.length
    ? await db.proyecto.findMany({
        where: { id: { in: medibles.map((p) => p.id) } },
        select: { id: true, estado: true, fecha_inicio: true, fecha_fin: true, beneficiarios_meta: true },
      })
    : []
  const basePorId = new Map(bases.map((b) => [b.id, b]))

  const actividades: ReporteSemanal["actividades_atrasadas"] = []
  const porProyecto: ReporteSemanal["atencion"] = []
  for (let i = 0; i < medibles.length; i += LOTE_ATENCION) {
    const lote = medibles.slice(i, i + LOTE_ATENCION)
    const resultados = await Promise.all(
      lote.map(async (p) => {
        const base = basePorId.get(p.id)
        return base ? cargarAtencion({ proyecto: base, corteParam: corte }) : null
      }),
    )
    lote.forEach((p, index) => {
      const resultado = resultados[index]
      // Un proyecto sin fechas responde 409 en la ficha; aquí simplemente no aporta filas.
      if (!resultado?.ok) return
      const proyecto: ProyectoRef = { id: p.id, codigo: p.codigo, nombre: p.nombre }
      const items: ReporteSemanal["atencion"][number]["items"] = []
      let observados = 0
      for (const item of resultado.value.items) {
        if (item.tipo === "actividad_atrasada") {
          actividades.push({ proyecto, actividad_id: item.actividad_id ?? null, detalle: item.detalle })
        } else if (item.tipo === "gasto_observado") {
          observados += 1
        } else {
          items.push({ tipo: item.tipo, titulo: item.titulo, detalle: item.detalle })
        }
      }
      if (observados > 0) {
        items.unshift({
          tipo: "gasto_observado",
          titulo: ATENCION_TITULO.gasto_observado,
          detalle: `${observados} ${observados === 1 ? "gasto registrado" : "gastos registrados"} con observaciones.`,
        })
      }
      if (items.length > 0) porProyecto.push({ proyecto, items })
    })
  }
  return { actividades, porProyecto }
}

// ---------------------------------------------------------------------------
// Tareas: esta semana contra la anterior
// ---------------------------------------------------------------------------

/** Día calendario de la fecha de entrega, tal como se guarda (la misma lectura UTC del reporte de tareas). */
const diaEntrega = (fecha: Date): IsoDate => fecha.toISOString().slice(0, 10)

/**
 * - Cerrada en la semana: COMPLETADA cuyo cierre real (`completed_at`, o `updated_at` antes del backfill) cae
 *   en la semana, en el calendario de Bogotá.
 * - Vencida en la semana: su fecha de entrega cae en la semana, ese día ya terminó y no se cerró a tiempo:
 *   sigue abierta, o se completó un día posterior a la entrega. Las canceladas no cuentan.
 */
async function contarTareas(usuario: Usuario, semana: Semana, anterior: Semana, hoy: IsoDate): Promise<ReporteSemanal["tareas"]> {
  const tareas = await db.tarea.findMany({
    where: tareaScopeWhere("all", usuario, {}, {
      estado: { not: "CANCELADA" },
      OR: [
        { fecha_entrega: { gte: new Date(`${anterior.desde}T00:00:00.000Z`), lt: new Date(`${diaSiguiente(semana.hasta)}T00:00:00.000Z`) } },
        { completed_at: { gte: inicioDiaBogota(anterior.desde), lt: inicioDiaBogota(diaSiguiente(semana.hasta)) } },
      ],
    }),
    select: { estado: true, fecha_entrega: true, completed_at: true, updated_at: true },
  })

  const noAbiertas = OPEN_TASK_STATES.notIn
  const contar = (s: Semana): ConteoTareas => {
    let cerradas = 0
    let vencidas = 0
    for (const t of tareas) {
      if (t.estado === "CANCELADA") continue
      const cierre = t.estado === "COMPLETADA" ? fechaEnBogota(t.completed_at ?? t.updated_at) : null
      if (cierre && enSemana(cierre, s)) cerradas += 1
      if (!t.fecha_entrega) continue
      const entrega = diaEntrega(t.fecha_entrega)
      if (!enSemana(entrega, s) || entrega >= hoy) continue
      const sigueAbierta = !noAbiertas.includes(t.estado)
      if (sigueAbierta || (cierre !== null && cierre > entrega)) vencidas += 1
    }
    return { cerradas, vencidas }
  }
  return { semana: contar(semana), semana_anterior: contar(anterior) }
}

// ---------------------------------------------------------------------------
// Gastos por validar (solo agregados)
// ---------------------------------------------------------------------------

async function gastosPorValidar(): Promise<NonNullable<ReporteSemanal["gastos_por_validar"]>> {
  // La misma cola que `GET /expense-validations?estado=REGISTRADO`: proyectos sin borrar y en ejecución.
  const rows = await db.gasto.findMany({
    where: {
      estado: "REGISTRADO",
      proyecto: { deleted_at: null, estado: { in: [...ESTADOS_PROYECTO_VALIDACION] as EstadoProyecto[] } },
    },
    select: { proyecto_id: true, monto_cop: true, created_at: true, proyecto: { select: { codigo: true, nombre: true } } },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  })
  const grupos = new Map<string, { proyecto: ProyectoRef; montos: bigint[]; mas_antiguo: Date }>()
  for (const row of rows) {
    const grupo = grupos.get(row.proyecto_id) ?? {
      proyecto: { id: row.proyecto_id, codigo: row.proyecto.codigo, nombre: row.proyecto.nombre },
      montos: [],
      mas_antiguo: row.created_at,
    }
    grupo.montos.push(toCents(row.monto_cop))
    if (row.created_at < grupo.mas_antiguo) grupo.mas_antiguo = row.created_at
    grupos.set(row.proyecto_id, grupo)
  }
  const porProyecto = [...grupos.values()]
    .sort((a, b) => a.proyecto.codigo.localeCompare(b.proyecto.codigo))
    .map((g) => ({ proyecto: g.proyecto, cantidad: g.montos.length, monto: fromCents(sumCents(g.montos)), mas_antiguo: fechaEnBogota(g.mas_antiguo) }))
  return {
    cantidad: rows.length,
    monto: fromCents(sumCents(rows.map((r) => toCents(r.monto_cop)))),
    por_proyecto: porProyecto,
  }
}
