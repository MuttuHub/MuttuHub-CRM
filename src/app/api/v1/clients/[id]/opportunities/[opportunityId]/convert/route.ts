// POST /api/v1/clients/:id/opportunities/:opportunityId/convert — D2/D5:
// converts a GANADA opportunity into "execution" by flipping `fase` and
// fixing `fecha_adjudicacion`. D6: this writes ONLY those two columns on one
// `oportunidades` row — zero writes to `tareas`. Linked tasks were already on
// the Kanban board (`oportunidad_id` never filtered them out), so nothing
// about them changes; only the derived chip (RNF-C01) flips once the client
// reads `oportunidad.fase` again. Explicit, audited action (D9) rather than a
// derived phase, so a "won" state and a "kicked off" state stay distinguishable
// and the idempotent second call has a clean 409 (D5).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logAudit } from "@/lib/api/audit";
import { getClientForOpportunityWrite } from "@/lib/api/crm";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; opportunityId: string }> };

export const POST = withApiErrorHandling(
  "opportunities",
  "No pudimos convertir la oportunidad. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, opportunityId } = await ctx.params;

    const access = await getClientForOpportunityWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El cliente no existe." : "No tienes permisos sobre las oportunidades de este cliente.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const existing = await db.oportunidad.findFirst({
      where: { id: opportunityId, cliente_id: id, deleted_at: null },
    });
    if (!existing) {
      return apiError("La oportunidad no existe.", 404, "NOT_FOUND");
    }
    if (existing.estado !== "GANADA") {
      return apiError("Solo se adjudica una oportunidad GANADA.", 409, "CONFLICT");
    }
    if (existing.fase === "EJECUCION") {
      return apiError("Esta oportunidad ya fue adjudicada.", 409, "CONFLICT");
    }

    const fecha_adjudicacion = new Date();
    const oportunidad = await db.oportunidad.update({
      where: { id: opportunityId },
      data: { fase: "EJECUCION", fecha_adjudicacion },
    });

    await logAudit({
      entidad: "oportunidad",
      entidad_id: opportunityId,
      accion: "convertir",
      usuario_id: auth.usuario.id,
      cambios: { fase: { de: "PROSPECCION", a: "EJECUCION" }, estado: "GANADA" },
    });

    return NextResponse.json({ oportunidad });
  },
);
