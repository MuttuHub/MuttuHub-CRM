// Shared plumbing of the expense corrections that survive AJ-08: the motivo schema and the management gate
// used by the void route. AJ-08 removed the approval step (validate / reject and their overspend transaction),
// so nothing here decides or blocks an expense any more: a registered expense is already money spent.

import type { Usuario } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { gateEjecucionVoid } from "@/lib/api/ejecucion";
import { GASTO_INCLUDE, GASTO_NO_EXISTE, type GastoConRelaciones } from "@/lib/api/gastos";
import type { GateResult } from "@/lib/api/estructura";

/** AJ-08: only the estados that count as executed can be annulled; RECHAZADO and ANULADO answer 409. */
export const SOLO_EJECUTADO_MESSAGE = "Solo se puede anular un gasto registrado.";

export const MOTIVO_GASTO_SCHEMA = z
  .object({
    motivo: z
      .string({ error: "El motivo es obligatorio." })
      .trim()
      .min(1, "El motivo no puede estar vacío.")
      .max(500, "El motivo es demasiado largo."),
  })
  .strict();

/**
 * 404 (project) -> 403 (managers only) -> 404 (expense of that project). Any project estado: a mistake stays
 * correctable after a suspension or a close.
 */
export async function gateGastoGestion(
  usuario: Usuario,
  proyectoId: string,
  gastoId: string,
): Promise<GateResult<GastoConRelaciones>> {
  const gate = await gateEjecucionVoid(usuario, proyectoId);
  if (!gate.ok) return gate;
  const gasto = await db.gasto.findFirst({
    where: { id: gastoId, proyecto_id: proyectoId },
    include: GASTO_INCLUDE,
  });
  if (!gasto) return { ok: false, response: apiError(GASTO_NO_EXISTE, 404, "NOT_FOUND") };
  return { ok: true, value: gasto };
}
