// B7 server layer: change a project's estado with a motivo (S3, S4).
//
// The writer runs inside the caller's single transaction: it locks the project row,
// re-checks the transition under the lock, writes the estado and logs one audit lote
// (`estado` and `motivo` rows). Aborts with `RespuestaAbortada` so nothing is written.

import { z } from "zod";
import type { EstadoProyecto, Prisma } from "@prisma/client";
import { apiError, RespuestaAbortada } from "@/lib/api/errors";
import { logChanges } from "@/lib/api/audit-cambios";
import { lockProyecto } from "@/lib/api/presupuesto";
import {
  ACCIONES_ESTADO,
  destinoDeAccion,
  mensajeRechazo,
  type AccionEstado,
} from "@/lib/proyectos/transiciones-estado";

export const CAMBIO_ESTADO_SCHEMA = z
  .object({
    accion: z.enum(ACCIONES_ESTADO, { error: "La acción no es válida." }),
    motivo: z
      .string({ error: "El motivo es obligatorio." })
      .trim()
      .min(1, "El motivo no puede estar vacío.")
      .max(1000, "El motivo es demasiado largo."),
  })
  .strict();

export type CambioEstadoInput = {
  proyectoId: string;
  usuarioId: string;
  accion: AccionEstado;
  motivo: string;
};

export type CambioEstadoResult = { proyecto: { id: string; estado: EstadoProyecto } };

type EstadoTx = Pick<Prisma.TransactionClient, "$queryRaw" | "proyecto" | "auditoriaCambio">;

export async function cambiarEstadoProyecto(tx: EstadoTx, input: CambioEstadoInput): Promise<CambioEstadoResult> {
  const { estado } = await lockProyecto(tx, input.proyectoId);
  const anterior = estado as EstadoProyecto;
  const destino = destinoDeAccion(input.accion, anterior);
  if (destino === null) {
    throw new RespuestaAbortada(apiError(mensajeRechazo(input.accion), 409, "INVALID_STATE"));
  }

  await tx.proyecto.update({ where: { id: input.proyectoId }, data: { estado: destino } });
  const comun = {
    usuario_id: input.usuarioId,
    accion: "EDITAR" as const,
    entidad: "proyecto",
    entidad_id: input.proyectoId,
    proyecto_id: input.proyectoId,
  };
  await logChanges(tx as Prisma.TransactionClient, [
    { ...comun, campo: "estado", valor_anterior: anterior, valor_nuevo: destino },
    { ...comun, campo: "motivo", valor_anterior: null, valor_nuevo: input.motivo },
  ]);
  return { proyecto: { id: input.proyectoId, estado: destino } };
}
