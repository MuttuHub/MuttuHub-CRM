// Project report (T9a, S15–S17), behind `GET /api/v1/reports/project`. Like the tag report it computes nothing
// new about the project: it composes the sources that already exist, so it never contradicts the ficha or
// the dashboard.
//
// - Access (S17): the ficha's read scope (`loadProjectScoped` + `canReadProject`): 404 for a missing project,
//   403 for one the user cannot read, before anything else is queried.
// - Resumen: value, the `base=vigente` programado/ejecutado of the portfolio loader at today, state, and
//   (posición propia only) meta vs. comprometido: meta = `valor_total`; comprometido / en gestión = the
//   `aporte_cop` of COMPROMETIDO / EN_GESTION allies, summed in cents; sin cubrir never below 0.
// - Aliados: every ally of the project (DESCARTADO included) whose client is not soft-deleted (the same rule as
//   `ALIADOS_ACTIVOS_COUNT`), with its last interaction about this project (`bitacora_entradas.proyecto_id`).
// - Oportunidades (L26, until D1): the project's own opportunity plus the open ones of its non-DESCARTADO
//   allies; only with commercial access, otherwise `null` (hidden, S5).
// - Bitácora (S16): the latest entries linked to this project.
// - Tareas: the project's tasks (`tareaScopeWhere`), progress = completed / (all − cancelled), overdue and
//   upcoming open tasks.

import type { EstadoAliado, EstadoOportunidad, EstadoProyecto, EstadoTarea, FaseOportunidad, OrigenProyecto, Prisma, RolAliado, TipoInteraccion, Usuario } from "@prisma/client"
import { db } from "@/lib/db"
import { apiError } from "@/lib/api/errors"
import { OPEN_OPPORTUNITY_STATES, clienteFeedScope } from "@/lib/api/crm"
import { EJECUCION_FORBIDDEN_MESSAGE, PROYECTO_NO_EXISTE } from "@/lib/api/ejecucion"
import { loadKpisPortafolio } from "@/lib/api/kpis-portafolio"
import { canReadProject, loadProjectScoped } from "@/lib/api/projects"
import { tareaScopeWhere } from "@/lib/dashboard"
import { hasCommercialAccess } from "@/lib/permissions"
import { POSICION_PROPIA, PROYECTO_CLIENTE_SELECT, toAliadoItem } from "@/lib/proyectos/aliados-proyecto"
import { fromCents, sumCents, toCents, type Cents } from "@/lib/proyectos/money"
import { etiquetaClienteProyecto } from "@/lib/proyectos/posicion-propia"
import { todayInBogota } from "@/lib/proyectos/weeks"
import { getSemaforoParametrosV2 } from "@/lib/settings"

const PROYECTO_REQUERIDO_MESSAGE = "Elige un proyecto."
/** How many bitácora entries the report lists (the latest ones), like the tag report. */
const BITACORA_MAX = 50

type Ref = { id: string; nombre: string }
/** COP amount as a two-decimal string ("1234.50"), like every report amount. */
type Monto = string

type ReporteProyectoTarea = {
  id: string
  titulo: string
  estado: EstadoTarea
  fecha_entrega: string | null
  responsable: Ref
}

export type ReporteProyecto = {
  /** Today in Bogotá: the cut-off of the KPIs and of the overdue tasks. */
  corte: string
  resumen: {
    proyecto: { id: string; codigo: string; nombre: string; estado: EstadoProyecto; origen: OrigenProyecto | null }
    /** The project's client, or «Posición propia · N aliados» (`etiquetaClienteProyecto`). */
    cliente: string
    responsable: Ref | null
    valor_total: Monto | null
    /** Portfolio KPI block (`base=vigente`) at `corte`; null when the project is not measurable yet. */
    financiero: { programado: Monto; ejecutado: Monto } | null
    /** Meta vs. comprometido (S15); null for a project that is not posición propia. */
    financiacion: { meta: Monto | null; comprometido: Monto; en_gestion: Monto; sin_cubrir: Monto | null } | null
  }
  aliados: {
    id: string
    cliente: Ref
    rol: RolAliado
    estado: EstadoAliado
    aporte_cop: number | null
    /** Date of the latest interaction with this ally about this project; null when there is none. */
    ultima_interaccion: string | null
  }[]
  /** null without commercial access (hidden, S5). */
  oportunidades:
    | {
        id: string
        nombre: string
        estado: EstadoOportunidad
        fase: FaseOportunidad
        valor_estimado_cop: Monto | null
        cliente: Ref
        /** PROYECTO: the project's own opportunity; ALIADO: an open opportunity of an ally. */
        vinculo: "PROYECTO" | "ALIADO"
      }[]
    | null
  bitacora: {
    id: string
    fecha: string
    tipo: TipoInteraccion
    texto: string
    proximo_paso: string | null
    cliente: Ref
    autor: Ref
  }[]
  tareas: {
    resumen: { total: number; completadas: number; canceladas: number; avance_pct: number | null }
    vencidas: ReporteProyectoTarea[]
    proximas: ReporteProyectoTarea[]
  }
}

const PROYECTO_SELECT = {
  id: true,
  codigo: true,
  nombre: true,
  estado: true,
  origen: true,
  fecha_inicio: true,
  fecha_fin: true,
  beneficiarios_meta: true,
  valor_total: true,
  oportunidad_id: true,
  cliente: { select: { id: true, nombre: true } },
  responsable: { select: { id: true, nombre: true } },
} satisfies Prisma.ProyectoSelect

/** Ally order of the report: committed first, then in progress, then declined; by name inside each. */
const ORDEN_ESTADO_ALIADO: Record<EstadoAliado, number> = { COMPROMETIDO: 0, EN_GESTION: 1, DESCARTADO: 2 }

const ZERO: Cents = toCents("0")
const monto = (value: { toString(): string } | null): Monto | null => (value === null ? null : fromCents(toCents(value)))
const isoDia = (value: Date): string => value.toISOString().slice(0, 10)

/** 400 (proyecto_id) -> 404 -> 403 -> the report. */
export async function cargarReporteProyecto(
  usuario: Usuario,
  url: URL,
): Promise<{ ok: true; value: ReporteProyecto } | { ok: false; response: Response }> {
  const proyectoId = url.searchParams.get("proyecto_id")?.trim()
  if (!proyectoId) return { ok: false, response: apiError(PROYECTO_REQUERIDO_MESSAGE, 400, "VALIDATION_ERROR") }

  const scoped = await loadProjectScoped(usuario, proyectoId, PROYECTO_SELECT)
  if (!scoped) return { ok: false, response: apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND") }
  if (!canReadProject(usuario, scoped.es_miembro)) {
    return { ok: false, response: apiError(EJECUCION_FORBIDDEN_MESSAGE, 403, "FORBIDDEN") }
  }
  const proyecto = scoped.row
  const hoy = todayInBogota()
  const comercial = hasCommercialAccess(usuario)
  const posicionPropia = proyecto.origen === POSICION_PROPIA

  const aliadosRows = posicionPropia
    ? await db.proyectoCliente.findMany({
        // Allies whose client was soft-deleted count nowhere (same rule as `ALIADOS_ACTIVOS_COUNT`, L23).
        where: { proyecto_id: proyecto.id, cliente: { deleted_at: null } },
        select: PROYECTO_CLIENTE_SELECT,
      })
    : []
  const aliadoIds = aliadosRows.map((a) => a.cliente.id)
  const aliadoActivoIds = aliadosRows.filter((a) => a.estado !== "DESCARTADO").map((a) => a.cliente.id)

  const vinculos: Prisma.OportunidadWhereInput[] = [
    ...(proyecto.oportunidad_id ? [{ id: proyecto.oportunidad_id }] : []),
    ...(aliadoActivoIds.length > 0 ? [{ cliente_id: { in: aliadoActivoIds }, estado: { in: [...OPEN_OPPORTUNITY_STATES] } }] : []),
  ]

  const [kpis, ultimas, oportunidades, bitacora, tareas] = await Promise.all([
    getSemaforoParametrosV2().then((parametros) => loadKpisPortafolio({ proyectos: [proyecto], corte: hoy, parametros })),
    aliadoIds.length > 0
      ? db.bitacoraEntrada.groupBy({
          by: ["cliente_id"],
          where: { proyecto_id: proyecto.id, cliente_id: { in: aliadoIds } },
          _max: { created_at: true },
        })
      : Promise.resolve([]),
    !comercial
      ? Promise.resolve(null)
      : vinculos.length === 0
        ? Promise.resolve([])
        : db.oportunidad.findMany({
            where: { deleted_at: null, cliente: clienteFeedScope(), OR: vinculos },
            orderBy: [{ valor_estimado_cop: { sort: "desc", nulls: "last" } }, { nombre: "asc" }],
            select: {
              id: true,
              nombre: true,
              estado: true,
              fase: true,
              valor_estimado_cop: true,
              cliente: { select: { id: true, nombre: true } },
            },
          }),
    db.bitacoraEntrada.findMany({
      where: { proyecto_id: proyecto.id, cliente: clienteFeedScope() },
      orderBy: { created_at: "desc" },
      take: BITACORA_MAX,
      select: {
        id: true,
        created_at: true,
        tipo: true,
        texto: true,
        proximo_paso: true,
        cliente: { select: { id: true, nombre: true } },
        autor: { select: { id: true, nombre: true } },
      },
    }),
    db.tarea.findMany({
      where: tareaScopeWhere("all", usuario, {}, { proyecto_id: proyecto.id }),
      orderBy: [{ fecha_entrega: { sort: "asc", nulls: "last" } }, { titulo: "asc" }],
      select: {
        id: true,
        titulo: true,
        estado: true,
        fecha_entrega: true,
        responsable: { select: { id: true, nombre: true } },
      },
    }),
  ])

  const ultimaPorCliente = new Map(ultimas.map((u) => [u.cliente_id, u._max.created_at]))
  const aliados = aliadosRows
    .map((row) => {
      const { id, cliente, rol, estado, aporte_cop } = toAliadoItem(row)
      const ultima = ultimaPorCliente.get(cliente.id) ?? null
      return { id, cliente, rol, estado, aporte_cop, ultima_interaccion: ultima === null ? null : todayInBogota(ultima) }
    })
    .sort(
      (a, b) =>
        ORDEN_ESTADO_ALIADO[a.estado] - ORDEN_ESTADO_ALIADO[b.estado] || a.cliente.nombre.localeCompare(b.cliente.nombre, "es"),
    )

  // Money is summed in cents from the stored decimals, never through `toAliadoItem`'s number.
  const aporte = (estado: EstadoAliado): Cents =>
    sumCents(aliadosRows.filter((a) => a.estado === estado && a.aporte_cop !== null).map((a) => toCents(a.aporte_cop as Prisma.Decimal)))
  let financiacion: ReporteProyecto["resumen"]["financiacion"] = null
  if (posicionPropia) {
    const comprometido = aporte("COMPROMETIDO")
    const enGestion = aporte("EN_GESTION")
    const meta = proyecto.valor_total === null ? null : toCents(proyecto.valor_total)
    const faltante = meta === null ? null : meta - comprometido - enGestion
    financiacion = {
      meta: meta === null ? null : fromCents(meta),
      comprometido: fromCents(comprometido),
      en_gestion: fromCents(enGestion),
      sin_cubrir: faltante === null ? null : fromCents(faltante > ZERO ? faltante : ZERO),
    }
  }

  const financiero = kpis.get(proyecto.id)?.financiero ?? null

  const abierta = (estado: EstadoTarea) => estado !== "COMPLETADA" && estado !== "CANCELADA"
  const toTarea = (t: (typeof tareas)[number]): ReporteProyectoTarea => ({
    id: t.id,
    titulo: t.titulo,
    estado: t.estado,
    fecha_entrega: t.fecha_entrega ? isoDia(t.fecha_entrega) : null,
    responsable: t.responsable,
  })
  // The query already orders by due date (nulls last), so both lists keep that order.
  const abiertas = tareas.filter((t) => abierta(t.estado))
  const completadas = tareas.filter((t) => t.estado === "COMPLETADA").length
  const canceladas = tareas.filter((t) => t.estado === "CANCELADA").length
  const base = tareas.length - canceladas

  return {
    ok: true,
    value: {
      corte: hoy,
      resumen: {
        proyecto: { id: proyecto.id, codigo: proyecto.codigo, nombre: proyecto.nombre, estado: proyecto.estado, origen: proyecto.origen },
        cliente: etiquetaClienteProyecto({ cliente: proyecto.cliente, aliados_count: aliadoActivoIds.length }),
        responsable: proyecto.responsable,
        valor_total: monto(proyecto.valor_total),
        financiero: financiero ? { programado: fromCents(financiero.programado), ejecutado: fromCents(financiero.ejecutado) } : null,
        financiacion,
      },
      aliados,
      oportunidades:
        oportunidades === null
          ? null
          : oportunidades
              .map((o) => ({
                id: o.id,
                nombre: o.nombre,
                estado: o.estado,
                fase: o.fase,
                valor_estimado_cop: monto(o.valor_estimado_cop),
                cliente: o.cliente,
                vinculo: o.id === proyecto.oportunidad_id ? ("PROYECTO" as const) : ("ALIADO" as const),
              }))
              // Stable sort: the project's own opportunity first, the rest keep the value order of the query.
              .sort((a, b) => Number(b.vinculo === "PROYECTO") - Number(a.vinculo === "PROYECTO")),
      bitacora: bitacora.map((b) => ({
        id: b.id,
        fecha: todayInBogota(b.created_at),
        tipo: b.tipo,
        texto: b.texto,
        proximo_paso: b.proximo_paso,
        cliente: b.cliente,
        autor: b.autor,
      })),
      tareas: {
        resumen: {
          total: tareas.length,
          completadas,
          canceladas,
          avance_pct: base === 0 ? null : Math.round((completadas / base) * 1000) / 10,
        },
        vencidas: abiertas.filter((t) => t.fecha_entrega !== null && isoDia(t.fecha_entrega) < hoy).map(toTarea),
        proximas: abiertas.filter((t) => t.fecha_entrega === null || isoDia(t.fecha_entrega) >= hoy).map(toTarea),
      },
    },
  }
}
