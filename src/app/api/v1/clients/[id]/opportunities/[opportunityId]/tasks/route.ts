// GET/POST /api/v1/clients/:id/opportunities/:opportunityId/tasks — tasks
// linked to a specific opportunity (opportunity-task-linking spec). List and
// create both go through the commercial gate; creation forces `cliente_id`
// and `oportunidad_id` from the URL — the invariant (D1/D2) cannot be
// violated from this path because neither value is ever taken from the body.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logAudit } from "@/lib/api/audit";
import {
  getClientForOpportunityWrite,
  loadClientForOpportunityRead,
  parseDate,
  TASK_SELECT,
  toTaskItem,
  zodError,
} from "@/lib/api/crm";
import { canEditTask } from "@/lib/permissions";
import { TASK_SCHEMA, bloqueoValido } from "@/app/api/v1/tasks/route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; opportunityId: string }> };

/** Shared existence check: the opportunity must belong to the client. */
async function loadOportunidad(clienteId: string, opportunityId: string) {
  return db.oportunidad.findFirst({
    where: { id: opportunityId, cliente_id: clienteId, deleted_at: null },
    select: { id: true },
  });
}

export const GET = withApiErrorHandling(
  "opportunities",
  "No pudimos cargar las tareas de la oportunidad. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, opportunityId } = await ctx.params;

    const access = await loadClientForOpportunityRead(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El cliente no existe." : "No tienes permisos sobre las oportunidades de este cliente.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const oportunidad = await loadOportunidad(id, opportunityId);
    if (!oportunidad) {
      return apiError("La oportunidad no existe.", 404, "NOT_FOUND");
    }

    const tareas = await db.tarea.findMany({
      where: { oportunidad_id: opportunityId, deleted_at: null },
      select: TASK_SELECT,
      orderBy: { updated_at: "desc" },
    });

    return NextResponse.json({
      tareas: tareas.map((tarea) => ({
        ...toTaskItem(tarea),
        puede_editar: canEditTask(
          {
            responsable_id: tarea.responsable_id,
            cliente_responsable_id: tarea.cliente?.responsable_id ?? null,
          },
          { id: auth.usuario.id, rol: auth.usuario.rol },
        ),
      })),
    });
  },
);

export const POST = withApiErrorHandling(
  "opportunities",
  "No pudimos crear la tarea. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, opportunityId } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    // cliente_id / oportunidad_id are forced below — never taken from the
    // body, so an inconsistent override is structurally impossible here.
    const parsed = TASK_SCHEMA.omit({ cliente_id: true, oportunidad_id: true }).safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    if (!bloqueoValido(parsed.data.estado, parsed.data.motivo_bloqueo)) {
      return apiError("Indica un motivo para bloquear.", 400, "VALIDATION_ERROR");
    }

    const access = await getClientForOpportunityWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El cliente no existe." : "No tienes permisos sobre las oportunidades de este cliente.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const oportunidad = await loadOportunidad(id, opportunityId);
    if (!oportunidad) {
      return apiError("La oportunidad no existe.", 404, "NOT_FOUND");
    }

    const responsable_id =
      auth.usuario.rol === "COLABORADOR" ? auth.usuario.id : parsed.data.responsable_id;

    const responsable = await db.usuario.findFirst({
      where: { id: responsable_id, activo: true },
      select: { id: true, nombre: true },
    });
    if (!responsable) {
      return apiError("El responsable no existe o está inactivo.", 400, "VALIDATION_ERROR");
    }

    const tarea = await db.tarea.create({
      data: {
        titulo: parsed.data.titulo,
        descripcion: parsed.data.descripcion?.trim() || null,
        responsable_id,
        cliente_id: id,
        oportunidad_id: opportunityId,
        estado: parsed.data.estado ?? "POR_HACER",
        origen: parsed.data.origen ?? "KANBAN",
        prioridad: parsed.data.prioridad,
        fecha_entrega:
          parsed.data.fecha_entrega === undefined || parsed.data.fecha_entrega === null
            ? undefined
            : parseDate(parsed.data.fecha_entrega),
        etiquetas: parsed.data.etiquetas ?? [],
        motivo_bloqueo: parsed.data.motivo_bloqueo?.trim() || null,
      },
      select: TASK_SELECT,
    });
    await logAudit({
      entidad: "tarea",
      entidad_id: tarea.id,
      accion: "crear",
      usuario_id: auth.usuario.id,
      cambios: { ...parsed.data, cliente_id: id, oportunidad_id: opportunityId },
    });
    return NextResponse.json({ task: toTaskItem(tarea) }, { status: 201 });
  },
);
