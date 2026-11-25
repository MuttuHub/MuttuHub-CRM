/**
 * S8/S12 (odd/tasks/reportes-etiqueta-y-posicion-propia.md): a posición propia project has no single
 * client (`Proyecto.cliente_id` is null). Every reader that shows a project's client shows this label
 * instead, and every grouping by client puts these projects under it.
 */
export const POSICION_PROPIA_ETIQUETA = "Posición propia"

/** The client name to show for a project: its client's, or «Posición propia» when it has none. */
export function nombreClienteProyecto(cliente: { nombre: string } | null): string {
  return cliente?.nombre ?? POSICION_PROPIA_ETIQUETA
}
