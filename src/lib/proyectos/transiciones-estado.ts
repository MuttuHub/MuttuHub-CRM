// B7: the estado transitions management may apply to a project (PO decision D-C).
//
// Pure data, shared by `POST /api/v1/projects/:id/estado` and the ficha header so the
// buttons offered and the transitions accepted never drift. BORRADOR -> EN_EJECUCION is
// not here: it only happens by approving the baseline.

import type { EstadoProyecto } from "@prisma/client";

export const ACCIONES_ESTADO = ["SUSPENDER", "REACTIVAR", "CERRAR", "REABRIR", "CANCELAR"] as const;
export type AccionEstado = (typeof ACCIONES_ESTADO)[number];

type Transicion = { desde: readonly EstadoProyecto[]; hacia: EstadoProyecto; rechazo: string };

const TRANSICIONES: Record<AccionEstado, Transicion> = {
  SUSPENDER: {
    desde: ["EN_EJECUCION"],
    hacia: "SUSPENDIDO",
    rechazo: "Solo se puede suspender un proyecto en ejecución.",
  },
  REACTIVAR: {
    desde: ["SUSPENDIDO"],
    hacia: "EN_EJECUCION",
    rechazo: "Solo se puede reactivar un proyecto suspendido.",
  },
  CERRAR: {
    desde: ["EN_EJECUCION"],
    hacia: "CERRADO",
    rechazo: "Solo se puede cerrar un proyecto en ejecución.",
  },
  REABRIR: {
    desde: ["CERRADO"],
    hacia: "EN_EJECUCION",
    rechazo: "Solo se puede reabrir un proyecto cerrado.",
  },
  CANCELAR: {
    desde: ["BORRADOR", "EN_EJECUCION", "SUSPENDIDO"],
    hacia: "CANCELADO",
    rechazo: "Solo se puede cancelar un proyecto en borrador, en ejecución o suspendido.",
  },
};

/** The estado `accion` leads to from `estado`, or `null` when that transition is not allowed. */
export function destinoDeAccion(accion: AccionEstado, estado: EstadoProyecto): EstadoProyecto | null {
  const transicion = TRANSICIONES[accion];
  return transicion.desde.includes(estado) ? transicion.hacia : null;
}

/** The 409 message when `accion` does not apply to the current estado. */
export function mensajeRechazo(accion: AccionEstado): string {
  return TRANSICIONES[accion].rechazo;
}

/** The actions valid from `estado`, in `ACCIONES_ESTADO` order. */
export function accionesDisponibles(estado: EstadoProyecto): AccionEstado[] {
  return ACCIONES_ESTADO.filter((accion) => destinoDeAccion(accion, estado) !== null);
}
