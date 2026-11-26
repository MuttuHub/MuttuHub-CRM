/**
 * S8/S12 (odd/tasks/reportes-etiqueta-y-posicion-propia.md): a posición propia project has no single
 * client (`Proyecto.cliente_id` is null). Every reader that shows a project's client shows this label
 * instead, and every grouping by client puts these projects under it.
 */
export const POSICION_PROPIA_ETIQUETA = "Posición propia"

/**
 * The client label to show for a project (L20): its client's name; without a client, «Posición propia»,
 * followed by « · 1 aliado» / « · N aliados» when it has allies. `aliados_count` excludes DESCARTADO allies
 * (it comes from the `_count` of `PROJECT_SELECT_V2` / the portfolio select); absent counts as 0.
 */
export function etiquetaClienteProyecto(proyecto: {
  cliente: { nombre: string } | null
  aliados_count?: number
}): string {
  if (proyecto.cliente) return proyecto.cliente.nombre
  const aliados = proyecto.aliados_count ?? 0
  if (aliados === 0) return POSICION_PROPIA_ETIQUETA
  return `${POSICION_PROPIA_ETIQUETA} · ${aliados} ${aliados === 1 ? "aliado" : "aliados"}`
}

/** The client name to show for a project: its client's, or «Posición propia» when it has none. */
export function nombreClienteProyecto(cliente: { nombre: string } | null): string {
  return etiquetaClienteProyecto({ cliente })
}

/**
 * The `_count` select of the allies that count (L20): DESCARTADO allies count neither in «N aliados» nor
 * in the client filter, the same rule as client health (L17 R3-003).
 */
export const ALIADOS_ACTIVOS_COUNT = {
  _count: { select: { aliados: { where: { estado: { not: "DESCARTADO" } } } } },
} as const
