// Tag report (T2, S2–S5), behind `GET /api/v1/reports/tag`. Like the weekly report it computes nothing new
// about projects: it composes the sources that already exist, so it never contradicts the dashboard.
//
// - Projects: `cargarPortafolio` filtered by the project's own tag (S2: never deduced from the client's tag),
//   with the same access, role scope and `base=vigente` KPIs as the portfolio dashboard, at the cut-off.
// - Clients: the tagged ones (`clienteScopeWhere("all", ...)` plus `clienteFeedScope`), with their
//   visible projects, open opportunities and last interaction. More than `CONTACTO_DIAS_OPTIMO` days without
//   an interaction (or none at all) is highlighted, the same threshold as client health.
// - Opportunities and bitácora: those of the tagged clients, plus those tagged themselves (S18, L37) whose
//   client the user may read, even when the client is not tagged. The opportunities and the pipeline only
//   with commercial access; otherwise they are `null` (hidden, S5).
// - Tasks: the tagged ones (`tareaScopeWhere("all", ...)`), overdue first.
//
// Period (S3, assumption): bitácora by date, tasks by due date (open tasks without a due date always count).
// Projects and opportunities are a snapshot at the cut-off: `hasta`, or today when `hasta` is later or absent.

import type { Prisma, Usuario } from "@prisma/client"
import { db } from "@/lib/db"
import { apiError } from "@/lib/api/errors"
import { OPEN_OPPORTUNITY_STATES, OPEN_TASK_STATES, clienteFeedScope } from "@/lib/api/crm"
import { cargarPortafolio } from "@/lib/api/portafolio"
import { projectListWhere } from "@/lib/api/projects"
import { CONTACTO_DIAS_OPTIMO } from "@/lib/clientes/salud"
import { clienteScopeWhere, parseDashboardFilters, rangoDeFechas, tareaScopeWhere } from "@/lib/dashboard"
import { hasCommercialAccess } from "@/lib/permissions"
import { fromCents, sumCents, toCents } from "@/lib/proyectos/money"
import { todayInBogota, toDayNumber } from "@/lib/proyectos/weeks"

const ETIQUETA_REQUERIDA_MESSAGE = "Elige una etiqueta."
/** How many bitácora entries the report lists (the latest ones). */
const BITACORA_MAX = 50

type Ref = { id: string; nombre: string }
type Monto = { toString(): string } | null

const monto = (value: Monto): string | null => (value === null ? null : fromCents(toCents(value)))
const sumar = (values: Monto[]): string => fromCents(sumCents(values.filter((v) => v !== null).map((v) => toCents(v))))

/** 400 (etiqueta, período) -> the report. Access and scope come from each source (S5). */
export async function cargarReporteEtiqueta(usuario: Usuario, url: URL) {
  const etiqueta = url.searchParams.get("etiqueta")?.trim()
  if (!etiqueta) return { ok: false as const, response: apiError(ETIQUETA_REQUERIDA_MESSAGE, 400, "VALIDATION_ERROR") }
  const parsed = parseDashboardFilters(url)
  if (!parsed.ok) return parsed
  const periodo = { desde: parsed.filters.desde ?? null, hasta: parsed.filters.hasta ?? null }
  const rango = rangoDeFechas({ desde: parsed.filters.desde, hasta: parsed.filters.hasta })
  const hoy = todayInBogota()
  const corte = periodo.hasta !== null && periodo.hasta < hoy ? periodo.hasta : hoy
  const comercial = hasCommercialAccess(usuario)
  // Opportunities are a snapshot at the cut-off: those created up to the end of `corte` (their current state).
  const abiertasAlCorte = {
    deleted_at: null,
    estado: { in: [...OPEN_OPPORTUNITY_STATES] },
    created_at: rangoDeFechas({ hasta: corte }),
  } satisfies Prisma.OportunidadWhereInput

  const portafolioUrl = new URL(url.origin)
  portafolioUrl.searchParams.set("etiqueta", etiqueta)
  portafolioUrl.searchParams.set("corte", corte)
  const portafolio = await cargarPortafolio(usuario, portafolioUrl)
  if (!portafolio.ok) return portafolio
  const data = portafolio.value

  // `clienteFeedScope` is the read scope of the cross-client feeds (opportunities, interactions): the
  // opportunities and bitácora below hang off the tagged clients or off this scope, so they inherit it.
  const clienteVisible: Prisma.ClienteWhereInput = { ...clienteScopeWhere("all", usuario, {}), ...clienteFeedScope() }
  const clientesRows = await db.cliente.findMany({
    where: { ...clienteVisible, etiquetas: { has: etiqueta } },
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      _count: {
        select: {
          proyectos: { where: projectListWhere(usuario, {}) },
          ...(comercial && { oportunidades: { where: abiertasAlCorte } }),
        },
      },
    },
  })
  const clienteIds = clientesRows.map((c) => c.id)
  // S18: an item belongs to the report through its client's tag or through its own tag.
  const deLaEtiqueta = [{ cliente_id: { in: clienteIds } }, { etiquetas: { has: etiqueta }, cliente: clienteVisible }]

  const [valores, ultimas, oportunidades, bitacora, tareas] = await Promise.all([
    db.proyecto.findMany({ where: { id: { in: data.proyectos.map((p) => p.id) } }, select: { id: true, valor_total: true } }),
    db.bitacoraEntrada.groupBy({ by: ["cliente_id"], where: { cliente_id: { in: clienteIds } }, _max: { created_at: true } }),
    comercial
      ? db.oportunidad.findMany({
          where: { ...abiertasAlCorte, OR: deLaEtiqueta },
          orderBy: [{ valor_estimado_cop: { sort: "desc", nulls: "last" } }, { nombre: "asc" }],
          select: { id: true, nombre: true, estado: true, valor_estimado_cop: true, cliente: { select: { id: true, nombre: true } } },
        })
      : Promise.resolve(null),
    db.bitacoraEntrada.findMany({
      where: { OR: deLaEtiqueta, ...(rango && { created_at: rango }) },
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
      where: tareaScopeWhere("all", usuario, {}, {
        etiquetas: { has: etiqueta },
        ...(rango && { OR: [{ fecha_entrega: rango }, { fecha_entrega: null, estado: OPEN_TASK_STATES }] }),
      } satisfies Prisma.TareaWhereInput),
      orderBy: [{ fecha_entrega: { sort: "asc", nulls: "last" } }, { titulo: "asc" }],
      select: {
        id: true,
        titulo: true,
        estado: true,
        fecha_entrega: true,
        completed_at: true,
        responsable: { select: { id: true, nombre: true } },
        cliente: { select: { id: true, nombre: true } },
      },
    }),
  ])

  const valorPorProyecto = new Map(valores.map((v) => [v.id, v.valor_total as Monto]))
  const ultimaPorCliente = new Map(ultimas.map((u) => [u.cliente_id, u._max.created_at]))

  const proyectos = data.proyectos.map((p) => ({ ...p, valor_total: monto(valorPorProyecto.get(p.id) ?? null) }))

  const clientes = clientesRows.map((c) => {
    const ultima = ultimaPorCliente.get(c.id) ?? null
    const dias = ultima === null ? null : Math.max(0, toDayNumber(hoy) - toDayNumber(todayInBogota(ultima)))
    const conteo = c._count as { proyectos: number; oportunidades?: number }
    return {
      id: c.id,
      nombre: c.nombre,
      proyectos: conteo.proyectos,
      ...(comercial && { oportunidades_abiertas: conteo.oportunidades ?? 0 }),
      ultima_interaccion: ultima === null ? null : todayInBogota(ultima),
      dias_sin_interaccion: dias,
      sin_interaccion_reciente: dias === null || dias > CONTACTO_DIAS_OPTIMO,
    }
  })

  const abierta = (estado: string) => estado !== "COMPLETADA" && estado !== "CANCELADA"
  const tareasOut = tareas
    .map((t) => ({
      id: t.id,
      titulo: t.titulo,
      estado: t.estado,
      fecha_entrega: t.fecha_entrega ? t.fecha_entrega.toISOString().slice(0, 10) : null,
      vencida: abierta(t.estado) && t.fecha_entrega !== null && t.fecha_entrega.toISOString().slice(0, 10) < hoy,
      responsable: t.responsable as Ref,
      cliente: t.cliente as Ref | null,
    }))
    // Stable sort: overdue first, each group keeps the due-date order of the query.
    .sort((a, b) => Number(b.vencida) - Number(a.vencida))

  return {
    ok: true as const,
    value: {
      etiqueta,
      periodo,
      corte,
      confirmado: data.confirmado,
      resumen: {
        clientes: clientes.length,
        proyectos: proyectos.length,
        valor_total: sumar(proyectos.map((p) => valorPorProyecto.get(p.id) ?? null)),
        financiero: { programado: data.agregado.financiero.programado, ejecutado: data.agregado.financiero.ejecutado },
        pipeline: oportunidades === null
          ? null
          : { oportunidades: oportunidades.length, valor: sumar(oportunidades.map((o) => o.valor_estimado_cop as Monto)) },
        tareas: {
          total: tareasOut.length,
          completadas: tareasOut.filter((t) => t.estado === "COMPLETADA").length,
          vencidas: tareasOut.filter((t) => t.vencida).length,
        },
      },
      proyectos,
      clientes,
      oportunidades:
        oportunidades?.map((o) => ({
          id: o.id,
          nombre: o.nombre,
          estado: o.estado,
          valor_estimado_cop: monto(o.valor_estimado_cop as Monto),
          cliente: o.cliente as Ref,
        })) ?? null,
      bitacora: bitacora.map((b) => ({
        id: b.id,
        fecha: todayInBogota(b.created_at),
        tipo: b.tipo,
        texto: b.texto,
        proximo_paso: b.proximo_paso,
        cliente: b.cliente as Ref,
        autor: b.autor as Ref,
      })),
      tareas: tareasOut,
    },
  }
}

export type ReporteEtiqueta = Extract<Awaited<ReturnType<typeof cargarReporteEtiqueta>>, { ok: true }>["value"]
