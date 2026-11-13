// GET /api/v1/projects/:id/activities — live activities of a project (S3 U2b).
// POST /api/v1/projects/:id/activities — add a week-based activity.
//
// GET reuses the membership-aware read scope of the ficha. POST is manager-only
// and BORRADOR-only. The activity lives on relative weeks: the body carries
// `semana_inicio`/`semana_fin`, validated against the project duration, and the
// calendar dates in every response are DERIVED from them and the project start —
// never stored, never accepted. An objective must be a live one of the same
// project (and the composite foreign key makes anything else impossible even if
// this check were bypassed). The duplicate-code conflict is the partial unique
// index `actividades_codigo_activo_uq` (P2002 -> 409).
//
// S6 (EV-02): every activity has a `tipo`, Normal or Transversal. The body may
// omit it, and then it is NORMAL — what every caller before S6 meant. The
// objective is conditional on the type: a NORMAL requires one, a TRANSVERSAL
// forbids it. The pair is checked here as a 400 so the
// `actividades_tipo_objetivo_check` CHECK is the safety net, never the way the
// client learns the rule.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { checkResponsableActivo } from "@/lib/api/projects";
import {
  type EstructuraProyecto,
  checkObjetivoDelProyecto,
  codigoField,
  conflict,
  gateEstructuraRead,
  gateEstructuraWrite,
  isUniqueViolation,
  parseEstructuraBody,
  ESTRUCTURA_STATE_MESSAGE,
} from "@/lib/api/estructura";
import { toActividadV2View, validarSemanas, type TipoActividad } from "@/lib/proyectos/actividad";
import { durationWeeks } from "@/lib/proyectos/weeks";
import { lockProyectoBorrador } from "@/lib/api/presupuesto";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const ACTIVIDAD_INDEX = "actividades_codigo_activo_uq";
export const ACTIVIDAD_DUPLICATE_MESSAGE = "Ya existe una actividad con ese código en el proyecto.";
export const SIN_FECHAS_MESSAGE = "Define las fechas del proyecto antes de crear actividades.";
export const OBJETIVO_OBLIGATORIO_MESSAGE = "El objetivo es obligatorio.";
export const TRANSVERSAL_CON_OBJETIVO_MESSAGE = "Una actividad transversal no puede tener un objetivo.";
export const TIPO_INVALIDO_MESSAGE = "El tipo debe ser Normal o Transversal.";

const semanaField = z
  .number({ error: "La semana debe ser un número entero." })
  .int("Las semanas deben ser números enteros.");

const nombreField = z
  .string({ error: "El nombre es obligatorio." })
  .trim()
  .min(1, "El nombre no puede estar vacío.")
  .max(300, "El nombre es muy largo.");

/** Dates are derived from the weeks, so `fecha_*` is an unknown key and a 400 (strict). */
export const ACTIVIDAD_CREATE_SCHEMA = z
  .object({
    // Conditional on `tipo` (S6): required for NORMAL, absent or null for TRANSVERSAL. The pair is
    // judged together by `checkTipoObjetivo`, because a zod field cannot see its sibling.
    objetivo_id: z
      .string({ error: OBJETIVO_OBLIGATORIO_MESSAGE })
      .min(1, OBJETIVO_OBLIGATORIO_MESSAGE)
      .nullable()
      .optional(),
    // Optional on purpose: omitted means NORMAL, the type of every activity that existed before S6.
    tipo: z.enum(["NORMAL", "TRANSVERSAL"], { error: TIPO_INVALIDO_MESSAGE }).optional(),
    codigo: codigoField,
    nombre: nombreField,
    semana_inicio: semanaField,
    semana_fin: semanaField,
    responsable_id: z.string().min(1, "El responsable no puede estar vacío.").nullable().optional(),
  })
  .strict();

export type ActividadCreate = z.infer<typeof ACTIVIDAD_CREATE_SCHEMA>;

export type TipoObjetivoValidation = { ok: true } | { ok: false; message: string };

/**
 * S6: the type and the objective cannot contradict each other — `NORMAL` requires an objective and
 * `TRANSVERSAL` forbids it («en las transversales el objetivo va vacío»). Same rule as the
 * `actividades_tipo_objetivo_check` CHECK, answered as a 400 before any write.
 */
export function checkTipoObjetivo(
  tipo: TipoActividad,
  objetivoId: string | null | undefined,
): TipoObjetivoValidation {
  if (tipo === "TRANSVERSAL") {
    return objetivoId === null || objetivoId === undefined
      ? { ok: true }
      : { ok: false, message: TRANSVERSAL_CON_OBJETIVO_MESSAGE };
  }
  return objetivoId ? { ok: true } : { ok: false, message: OBJETIVO_OBLIGATORIO_MESSAGE };
}

/**
 * Week bounds against the project's current duration; a project without dates
 * cannot host activities. Returns the 400 response, or null when the weeks fit.
 */
export function checkSemanasEnProyecto(
  proyecto: Pick<EstructuraProyecto, "fecha_inicio" | "fecha_fin">,
  semanaInicio: number,
  semanaFin: number,
): Response | null {
  if (!proyecto.fecha_inicio || !proyecto.fecha_fin) {
    return apiError(SIN_FECHAS_MESSAGE, 400, "VALIDATION_ERROR");
  }
  const duracion = durationWeeks(
    proyecto.fecha_inicio.toISOString().slice(0, 10),
    proyecto.fecha_fin.toISOString().slice(0, 10),
  );
  const validacion = validarSemanas(semanaInicio, semanaFin, duracion);
  return validacion.ok ? null : apiError(validacion.message, 400, "VALIDATION_ERROR");
}

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar las actividades. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEstructuraRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const actividades = await db.actividad.findMany({
      where: { proyecto_id: id, deleted_at: null },
      orderBy: [{ semana_inicio: "asc" }, { codigo: "asc" }],
    });

    return NextResponse.json({
      actividades: actividades.map((fila) => toActividadV2View(fila, gate.value)),
    });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos crear la actividad. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEstructuraWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, ACTIVIDAD_CREATE_SCHEMA);
    if (!body.ok) return body.response;
    const input = body.value;

    // S6: the type decides whether the objective is required or forbidden, so the pair is settled
    // before the body meets the project.
    const tipo = input.tipo ?? "NORMAL";
    const objetivoId = input.objetivo_id ?? null;
    const incoherente = checkTipoObjetivo(tipo, objetivoId);
    if (!incoherente.ok) return apiError(incoherente.message, 400, "VALIDATION_ERROR");

    const fueraDeRango = checkSemanasEnProyecto(gate.value, input.semana_inicio, input.semana_fin);
    if (fueraDeRango) return fueraDeRango;

    if (objetivoId !== null) {
      const objetivoAjeno = await checkObjetivoDelProyecto(id, objetivoId);
      if (objetivoAjeno) return objetivoAjeno;
    }

    if (input.responsable_id) {
      const inactivo = await checkResponsableActivo(input.responsable_id);
      if (inactivo) return inactivo;
    }

    try {
      const row = await db.$transaction(async (tx) => {
        await lockProyectoBorrador(tx, id, ESTRUCTURA_STATE_MESSAGE);
        const created = await tx.actividad.create({
          data: {
            proyecto_id: id,
            objetivo_id: objetivoId,
            tipo,
            codigo: input.codigo,
            nombre: input.nombre,
            semana_inicio: input.semana_inicio,
            semana_fin: input.semana_fin,
            responsable_id: input.responsable_id ?? null,
          },
        });

        await logChange(tx, {
          usuario_id: auth.usuario.id,
          accion: "CREAR",
          entidad: "actividad",
          entidad_id: created.id,
          proyecto_id: id,
          valor_nuevo: {
            objetivo_id: created.objetivo_id,
            tipo: created.tipo,
            codigo: created.codigo,
            nombre: created.nombre,
            semana_inicio: created.semana_inicio,
            semana_fin: created.semana_fin,
            responsable_id: created.responsable_id,
          },
        });

        return created;
      });

      return NextResponse.json({ actividad: toActividadV2View(row, gate.value) }, { status: 201 });
    } catch (err) {
      if (isUniqueViolation(err, ACTIVIDAD_INDEX)) return conflict(ACTIVIDAD_DUPLICATE_MESSAGE);
      throw err;
    }
  },
);
