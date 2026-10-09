// PATCH /api/v1/projects/:id/activities/:activityId — edit an activity (S3 U2b).
// DELETE /api/v1/projects/:id/activities/:activityId — soft-delete it.
//
// Manager-only and BORRADOR-only (404 -> 403 -> 409 INVALID_STATE -> 400). An
// activity is only addressable through its own project. Weeks are validated
// against the project duration whenever either week is in the patch, using the
// merged pair; the weight follows REQ-STR-04 (`resolvePeso`): a manual weight
// survives a change of weeks, a derived one is recomputed, `peso: null` clears
// the manual flag. Dates are derived, so `fecha_*` is not an accepted key.
// Deleting is `deleted_at`, audited as `EDITAR actividad.deleted_at`, and refused
// with 409 CONFLICT while the activity still has live deliverables or
// non-voided beneficiary records.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { diffFields, logChanges } from "@/lib/api/audit-cambios";
import { checkResponsableActivo } from "@/lib/api/projects";
import {
  NOTHING_TO_UPDATE,
  checkObjetivoDelProyecto,
  codigoField,
  conflict,
  gateEstructuraWrite,
  isUniqueViolation,
  parseEstructuraBody,
  ESTRUCTURA_STATE_MESSAGE,
} from "@/lib/api/estructura";
import { resolvePeso, toActividadV2View } from "@/lib/proyectos/actividad";
import {
  ACTIVIDAD_CREATE_SCHEMA,
  ACTIVIDAD_DUPLICATE_MESSAGE,
  ACTIVIDAD_INDEX,
  checkSemanasEnProyecto,
} from "../route";
import { lockProyectoBorrador } from "@/lib/api/presupuesto";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; activityId: string }> };

const AUDITED_ACTIVIDAD_FIELDS = [
  "objetivo_id",
  "codigo",
  "nombre",
  "semana_inicio",
  "semana_fin",
  "peso",
  "peso_manual",
  "responsable_id",
] as const;

export const ACTIVIDAD_PATCH_SCHEMA = ACTIVIDAD_CREATE_SCHEMA.partial().extend({
  codigo: codigoField.optional(),
});

const ACTIVIDAD_NOT_FOUND = "La actividad no existe.";

export const PATCH = withApiErrorHandling(
  "projects",
  "No pudimos actualizar la actividad. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, activityId } = await ctx.params;

    const gate = await gateEstructuraWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, ACTIVIDAD_PATCH_SCHEMA);
    if (!body.ok) return body.response;
    const input = body.value;

    if (Object.values(input).every((value) => value === undefined)) {
      return apiError(NOTHING_TO_UPDATE, 400, "VALIDATION_ERROR");
    }

    const existente = await db.actividad.findFirst({
      where: { id: activityId, proyecto_id: id, deleted_at: null },
    });
    if (!existente) return apiError(ACTIVIDAD_NOT_FOUND, 404, "NOT_FOUND");

    const semanaInicio = input.semana_inicio ?? existente.semana_inicio;
    const semanaFin = input.semana_fin ?? existente.semana_fin;
    const cambiaSemanas = input.semana_inicio !== undefined || input.semana_fin !== undefined;

    if (cambiaSemanas) {
      const fueraDeRango = checkSemanasEnProyecto(gate.value, semanaInicio, semanaFin);
      if (fueraDeRango) return fueraDeRango;
    }
    if (input.objetivo_id !== undefined) {
      const objetivoAjeno = await checkObjetivoDelProyecto(id, input.objetivo_id);
      if (objetivoAjeno) return objetivoAjeno;
    }
    if (input.responsable_id) {
      const inactivo = await checkResponsableActivo(input.responsable_id);
      if (inactivo) return inactivo;
    }

    const data: {
      objetivo_id?: string;
      codigo?: string;
      nombre?: string;
      semana_inicio?: number;
      semana_fin?: number;
      peso?: number;
      peso_manual?: boolean;
      responsable_id?: string | null;
    } = {};
    if (input.objetivo_id !== undefined) data.objetivo_id = input.objetivo_id;
    if (input.codigo !== undefined) data.codigo = input.codigo;
    if (input.nombre !== undefined) data.nombre = input.nombre;
    if (input.semana_inicio !== undefined) data.semana_inicio = input.semana_inicio;
    if (input.semana_fin !== undefined) data.semana_fin = input.semana_fin;
    if (input.responsable_id !== undefined) data.responsable_id = input.responsable_id;
    if (cambiaSemanas || input.peso !== undefined) {
      const { peso, peso_manual } = resolvePeso({
        semana_inicio: semanaInicio,
        semana_fin: semanaFin,
        peso: input.peso,
        actual: { peso: existente.peso, peso_manual: existente.peso_manual },
      });
      data.peso = peso;
      data.peso_manual = peso_manual;
    }

    // `Decimal` on both sides so the audit compares values, not number vs string.
    const { peso: pesoNuevo, ...resto } = data;
    const after: Partial<typeof existente> = { ...resto };
    if (pesoNuevo !== undefined) after.peso = new Prisma.Decimal(pesoNuevo);
    const cambios = diffFields(existente, after, AUDITED_ACTIVIDAD_FIELDS);

    try {
      const row = await db.$transaction(async (tx) => {
        await lockProyectoBorrador(tx, id, ESTRUCTURA_STATE_MESSAGE);
        const updated = await tx.actividad.update({ where: { id: activityId }, data });
        if (cambios.length > 0) {
          await logChanges(
            tx,
            cambios.map((cambio) => ({
              usuario_id: auth.usuario.id,
              accion: "EDITAR" as const,
              entidad: "actividad",
              entidad_id: activityId,
              proyecto_id: id,
              ...cambio,
            })),
          );
        }
        return updated;
      });

      return NextResponse.json({ actividad: toActividadV2View(row, gate.value) });
    } catch (err) {
      if (isUniqueViolation(err, ACTIVIDAD_INDEX)) return conflict(ACTIVIDAD_DUPLICATE_MESSAGE);
      throw err;
    }
  },
);

export const DELETE = withApiErrorHandling(
  "projects",
  "No pudimos eliminar la actividad. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, activityId } = await ctx.params;

    const gate = await gateEstructuraWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const existente = await db.actividad.findFirst({
      where: { id: activityId, proyecto_id: id, deleted_at: null },
    });
    if (!existente) return apiError(ACTIVIDAD_NOT_FOUND, 404, "NOT_FOUND");

    const entregablesVivos = await db.entregable.count({
      where: { actividad_id: activityId, deleted_at: null },
    });
    if (entregablesVivos > 0) {
      return conflict("No puedes eliminar una actividad que tiene entregables. Elimina o reasigna sus entregables primero.");
    }
    const beneficiariosVivos = await db.registroBeneficiario.count({
      where: { actividad_id: activityId, anulado_at: null },
    });
    if (beneficiariosVivos > 0) {
      return conflict("No puedes eliminar una actividad que tiene beneficiarios registrados. Anula sus registros primero.");
    }

    const row = await db.$transaction(async (tx) => {
      await lockProyectoBorrador(tx, id, ESTRUCTURA_STATE_MESSAGE);
      const updated = await tx.actividad.update({
        where: { id: activityId },
        data: { deleted_at: new Date() },
      });
      await logChanges(tx, [
        {
          usuario_id: auth.usuario.id,
          accion: "EDITAR",
          entidad: "actividad",
          entidad_id: activityId,
          proyecto_id: id,
          campo: "deleted_at",
          valor_anterior: null,
          valor_nuevo: updated.deleted_at,
        },
      ]);
      return updated;
    });

    return NextResponse.json({ actividad: toActividadV2View(row, gate.value) });
  },
);
