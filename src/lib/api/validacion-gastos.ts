// Validation workflow of the S6 expenses (RF-22): the gate shared by validate / reject / void
// and the overspend transaction (ADR-11).
//
// Overspend: the validation locks the budget line row (`lineas_presupuestales`), re-reads the
// expense under its own lock, sums the VALIDADO total of the line and applies
// `excederiaAsignado` (strict `>`). When it would exceed A, the transaction COMMITS the flag and the
// notifications and RETURNS `{ blocked: true }`: it must never throw (a throw rolls both back).

import type { Usuario } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { logChange } from "@/lib/api/audit-cambios";
import { PROYECTO_NO_EXISTE, gateEjecucionVoid } from "@/lib/api/ejecucion";
import { GASTO_INCLUDE, GASTO_NO_EXISTE, type GastoConRelaciones } from "@/lib/api/gastos";
import { notificarSobregasto } from "@/lib/api/notificaciones-proyecto";
import type { GateResult } from "@/lib/api/estructura";
import { excederiaAsignado } from "@/lib/proyectos/ficha-financiera";
import { toCents } from "@/lib/proyectos/money";

export const VALIDAR_PROPIO_MESSAGE = "No puedes validar un gasto que tú registraste.";
export const RECHAZAR_PROPIO_MESSAGE = "No puedes rechazar un gasto que tú registraste.";
export const SOLO_REGISTRADO_MESSAGE = "Solo se pueden validar o rechazar gastos en estado registrado.";
export const SOLO_VALIDADO_MESSAGE = "Solo se puede anular un gasto validado.";
export const DATOS_INCOMPLETOS_MESSAGE = "Completa el tipo y número de identificación del tercero antes de validar.";
export const OVERSPEND_MESSAGE = "Validar este gasto superaría el valor asignado al rubro. Se notificó a Gerencia.";

export const MOTIVO_GASTO_SCHEMA = z
  .object({
    motivo: z
      .string({ error: "El motivo es obligatorio." })
      .trim()
      .min(1, "El motivo no puede estar vacío.")
      .max(500, "El motivo es demasiado largo."),
  })
  .strict();

/** 404 (project) -> 403 (managers only) -> 404 (expense of that project). */
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

export type ResultadoValidacion = { blocked: false; gasto: GastoConRelaciones } | { blocked: true } | { stale: true };

/** The transaction body of POST validate. Returns instead of throwing (see the header). */
export async function validarEnTransaccion(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  input: { gasto: GastoConRelaciones; validadorId: string },
): Promise<ResultadoValidacion> {
  const { gasto, validadorId } = input;
  const nuevo = toCents(gasto.monto_cop);

  const lineas = await tx.$queryRaw<{ monto: string }[]>`
    SELECT "monto_proyectado_cop"::text AS "monto" FROM "lineas_presupuestales" WHERE "id" = ${gasto.linea_id} FOR UPDATE`;
  const linea = lineas[0];
  if (!linea) return { stale: true };

  const filas = await tx.$queryRaw<{ estado: string }[]>`
    SELECT "estado"::text AS "estado" FROM "gastos" WHERE "id" = ${gasto.id} FOR UPDATE`;
  if (filas[0]?.estado !== "REGISTRADO") return { stale: true };

  const sumas = await tx.$queryRaw<{ total: string }[]>`
    SELECT COALESCE(SUM("monto_cop"), 0)::text AS "total" FROM "gastos" WHERE "linea_id" = ${gasto.linea_id} AND "estado" = 'VALIDADO'`;
  const validado = toCents(sumas[0]?.total ?? "0");

  const guard = { id: gasto.id, proyecto_id: gasto.proyecto_id, estado: "REGISTRADO" as const };

  if (excederiaAsignado({ asignado: toCents(linea.monto), validado, nuevo })) {
    const { count } = await tx.gasto.updateMany({ where: guard, data: { alerta_sobregasto: true } });
    if (count === 0) return { stale: true };
    await notificarSobregasto(tx, { gastoId: gasto.id, proyectoId: gasto.proyecto_id });
    await logChange(tx, {
      usuario_id: validadorId,
      accion: "EDITAR",
      entidad: "gasto",
      entidad_id: gasto.id,
      proyecto_id: gasto.proyecto_id,
      campo: "alerta_sobregasto",
      valor_anterior: gasto.alerta_sobregasto,
      valor_nuevo: true,
    });
    return { blocked: true };
  }

  const { count } = await tx.gasto.updateMany({
    where: guard,
    data: {
      estado: "VALIDADO",
      validado_por_id: validadorId,
      validado_at: new Date(),
      alerta_sobregasto: false,
    },
  });
  if (count === 0) return { stale: true };
  await logChange(tx, {
    usuario_id: validadorId,
    accion: "VALIDAR",
    entidad: "gasto",
    entidad_id: gasto.id,
    proyecto_id: gasto.proyecto_id,
    campo: "estado",
    valor_anterior: "REGISTRADO",
    valor_nuevo: "VALIDADO",
  });
  const actualizado = await tx.gasto.findFirstOrThrow({ where: { id: gasto.id }, include: GASTO_INCLUDE });
  return { blocked: false, gasto: actualizado };
}

export { PROYECTO_NO_EXISTE };
