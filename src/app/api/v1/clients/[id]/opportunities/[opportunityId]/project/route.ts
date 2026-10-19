// POST /api/v1/clients/:id/opportunities/:opportunityId/project — one-step
// GANADA -> project (contract E-05, P05 + the existing commercial gate).
//
// The opportunity must belong to the URL client, be `GANADA` and have no
// project. In ONE transaction: `fase = EJECUCION` (setting `fecha_adjudicacion`
// only while it is still null, so an already-converted opportunity keeps its
// date), the project creation with `cliente_id`/`nombre`/`valor_total`
// prefilled from the opportunity (an explicit body value overrides the
// prefill) and BOTH audit rows (`CONVERTIR` oportunidad + `CREAR` proyecto) via
// one `logChanges` call, so every row shares one `lote_id`.
//
// The pre-check "already has a project" is not atomic; the unique index on
// `oportunidad_id` is the safety net and answers the same 409 (a soft-deleted
// project still occupies the slot because the index has no partial predicate).

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { canCreateProject, canManageProjects } from "@/lib/permissions";
import { loadClientForProjectCreation } from "@/lib/api/crm";
import { nextProjectCode } from "@/lib/api/project-code";
import { logChanges } from "@/lib/api/audit-cambios";
import { diferenciaValor, validarLineas, miembrosInicialesProyecto } from "@/lib/proyectos/proyecto-general";
import {
  PROJECT_SELECT_V2,
  addProyectoMiembros,
  checkLineasExisten,
  checkMiembrosValidos,
  checkMunicipiosExisten,
  checkResponsableActivo,
  normalizeProjectDate,
  toProjectDecimal,
  toProjectItemV2,
} from "@/lib/api/projects";
import {
  PROJECT_CREATE_FROM_OPPORTUNITY_FORBIDDEN_FIELDS,
  PROJECT_CREATE_FROM_OPPORTUNITY_SCHEMA,
} from "@/app/api/v1/projects/route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; opportunityId: string }> };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos crear el proyecto. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    if (!canCreateProject(auth.usuario)) {
      return apiError("No tienes permisos para crear proyectos.", 403, "FORBIDDEN");
    }

    const { id, opportunityId } = await ctx.params;

    const body = await parseJsonBody<Record<string, unknown>>(request);
    if (body === null || typeof body !== "object") {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    for (const field of PROJECT_CREATE_FROM_OPPORTUNITY_FORBIDDEN_FIELDS) {
      if (field in body) {
        return apiError(
          `El campo '${field}' no se puede establecer en este endpoint.`,
          400,
          "VALIDATION_ERROR",
        );
      }
    }

    const parsed = PROJECT_CREATE_FROM_OPPORTUNITY_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return apiError(
        parsed.error.issues[0]?.message ?? "Datos no válidos.",
        400,
        "VALIDATION_ERROR",
      );
    }

    const validacion = validarLineas(parsed.data.lineas);
    if (!validacion.ok) {
      return apiError(validacion.message, 400, "VALIDATION_ERROR");
    }

    // V-03 (strict start < end) is already enforced by the shared schema above.
    const inicio = normalizeProjectDate(parsed.data.fecha_inicio);
    const fin = normalizeProjectDate(parsed.data.fecha_fin);

    // S1/S8 (PO matrix 2026-10-19): any role converts a won opportunity, and
    // every role may read every client to do it. The commercial WRITE gate is
    // deliberately not applied here: creating a project is not editing the
    // commercial cycle.
    const access = await loadClientForProjectCreation(id);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El cliente no existe."
          : "No tienes permisos sobre las oportunidades de este cliente.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const oportunidad = await db.oportunidad.findFirst({
      where: { id: opportunityId, cliente_id: id, deleted_at: null },
    });
    if (!oportunidad) {
      return apiError("La oportunidad no existe.", 404, "NOT_FOUND");
    }
    if (oportunidad.estado !== "GANADA") {
      return apiError(
        "Solo se crea un proyecto desde una oportunidad en estado Ganada.",
        409,
        "CONFLICT",
      );
    }

    // Same predicate as E-04: a soft-deleted project still blocks creation.
    const existingProject = await db.proyecto.findFirst({
      where: { oportunidad_id: opportunityId },
      select: { id: true },
    });
    if (existingProject) {
      return apiError("Esta oportunidad ya tiene un proyecto.", 409, "CONFLICT");
    }

    // V-04: a suspended catalog row must not be offered to a new project. The
    // PATCH route deliberately keeps the existence-only default (REQ-CAT-02).
    const missingLineas = await checkLineasExisten(parsed.data.lineas, { onlyActive: true });
    if (missingLineas) return missingLineas;
    const missingMunicipios = await checkMunicipiosExisten(parsed.data.municipio_ids, {
      onlyActive: true,
    });
    if (missingMunicipios) return missingMunicipios;
    // S2 (PO matrix 2026-10-19): the creator is the responsable unless the body
    // names someone else and, when their role needs it, joins the team.
    const responsableId = parsed.data.responsable_id ?? auth.usuario.id;
    const inactiveResponsable = await checkResponsableActivo(responsableId);
    if (inactiveResponsable) return inactiveResponsable;

    // ADR-09: the responsable is a member from the moment the project exists,
    // and a `miembro_ids` entry naming them collapses into that membership.
    // Validated before the transaction so an invalid entry answers 400 without
    // converting the opportunity or creating a half-built project.
    const equipo = miembrosInicialesProyecto(responsableId, [
      ...(canManageProjects(auth.usuario) ? [] : [auth.usuario.id]),
      ...(parsed.data.miembro_ids ?? []),
    ]);
    const invalidMiembros = await checkMiembrosValidos(
      equipo.filter((id) => id !== responsableId && id !== auth.usuario.id),
    );
    if (invalidMiembros) return invalidMiembros;

    // REQ-ORG-05: the code year is the creation instant in UTC.
    const year = new Date().getUTCFullYear();
    const nombre = parsed.data.nombre ?? oportunidad.nombre;
    const valorTotal =
      parsed.data.valor_total === undefined
        ? oportunidad.valor_estimado_cop
        : toProjectDecimal(parsed.data.valor_total);
    // PO-5 / REQ-ORG-04: the final value (body or prefilled) must be positive.
    if (valorTotal === null || valorTotal.lte(0)) {
      return apiError("El valor total debe ser mayor que cero.", 400, "VALIDATION_ERROR");
    }

    try {
      const row = await db.$transaction(async (tx) => {
        await tx.oportunidad.update({
          where: { id: opportunityId },
          data: {
            fase: "EJECUCION",
            // Write-once: an opportunity already in EJECUCION keeps the
            // original `fecha_adjudicacion` set by the earlier conversion.
            ...(oportunidad.fecha_adjudicacion === null
              ? { fecha_adjudicacion: new Date() }
              : {}),
          },
        });

        const codigo = await nextProjectCode(tx, year);
        const created = await tx.proyecto.create({
          data: {
            codigo,
            nombre,
            descripcion: parsed.data.descripcion ?? null,
            cliente_id: id,
            oportunidad_id: opportunityId,
            responsable_id: responsableId,
            origen: "OPORTUNIDAD",
            fecha_inicio: inicio,
            fecha_fin: fin,
            valor_total: valorTotal,
            // S2.4: recorded, never blocking; the response carries the alert.
            diferencia_valor_oportunidad: diferenciaValor(
              valorTotal,
              oportunidad.valor_estimado_cop,
            ),
            beneficiarios_meta: parsed.data.beneficiarios_meta ?? null,
            lineas: {
              create: parsed.data.lineas.map((linea) => ({
                linea_id: linea.id,
                principal: linea.principal === true,
              })),
            },
            municipios: {
              create: parsed.data.municipio_ids.map((municipio_id) => ({ municipio_id })),
            },
          },
          select: PROJECT_SELECT_V2,
        });

        // ONE logChanges call: the conversion and the creation share a single
        // lote_id, which is what the ficha's Historial groups into one step.
        await logChanges(tx, [
          {
            usuario_id: auth.usuario.id,
            accion: "CONVERTIR",
            entidad: "oportunidad",
            entidad_id: opportunityId,
            proyecto_id: created.id,
            valor_anterior: {
              fase: oportunidad.fase,
              fecha_adjudicacion: oportunidad.fecha_adjudicacion,
            },
            valor_nuevo: { fase: "EJECUCION" },
          },
          {
            usuario_id: auth.usuario.id,
            accion: "CREAR",
            entidad: "proyecto",
            entidad_id: created.id,
            proyecto_id: created.id,
            valor_nuevo: { codigo, nombre, cliente_id: id, origen: "OPORTUNIDAD" },
          },
        ]);

        // The initial team is its own audited act: its own `logChanges` call and
        // its own lote_id, inside the same transaction (REQ-ACC-07).
        await addProyectoMiembros(tx, {
          proyectoId: created.id,
          usuarioIds: equipo,
          agregadoPorId: auth.usuario.id,
        });

        return created;
      });

      return NextResponse.json({ proyecto: toProjectItemV2(row) }, { status: 201 });
    } catch (err) {
      // The pre-check is not atomic: the unique index on `oportunidad_id` is
      // the race-condition safety net and answers the same 409.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        JSON.stringify(err.meta ?? {}).includes("oportunidad_id")
      ) {
        return apiError("Esta oportunidad ya tiene un proyecto.", 409, "CONFLICT");
      }
      throw err;
    }
  },
);
