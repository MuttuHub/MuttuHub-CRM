// POST /api/v1/projects/:id/beneficiaries/:beneficiaryId/void (S4 U4).
//
// Voids a beneficiary record (REQ-EXE-07): the row is kept, excluded from the
// total and audited with ANULAR. ADMINISTRADOR/GERENCIA only, any project
// estado. Order: 404 -> 403 -> 400 -> 404 -> 409.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { conflict, parseEstructuraBody } from "@/lib/api/estructura";
import { gateEjecucionVoid } from "@/lib/api/ejecucion";
import { toBeneficiarioView } from "@/lib/api/mediciones";
import { MOTIVO_ANULACION_SCHEMA } from "@/app/api/v1/projects/[id]/deliverables/[deliverableId]/progress/[progressId]/void/route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; beneficiaryId: string }> };

export const BENEFICIARIO_NO_EXISTE = "El registro de beneficiarios no existe.";
export const BENEFICIARIO_ANULADO_MESSAGE = "El registro de beneficiarios ya está anulado.";

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos anular el registro. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, beneficiaryId } = await ctx.params;

    const gate = await gateEjecucionVoid(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, MOTIVO_ANULACION_SCHEMA);
    if (!body.ok) return body.response;
    const { motivo } = body.value;

    const existente = await db.registroBeneficiario.findFirst({
      where: { id: beneficiaryId, proyecto_id: id },
    });
    if (!existente) return apiError(BENEFICIARIO_NO_EXISTE, 404, "NOT_FOUND");
    if (existente.anulado_at !== null) return conflict(BENEFICIARIO_ANULADO_MESSAGE);

    const row = await db.$transaction(async (tx) => {
      const { count } = await tx.registroBeneficiario.updateMany({
        where: { id: beneficiaryId, anulado_at: null },
        data: { anulado_at: new Date(), anulado_por_id: auth.usuario.id, motivo_anulacion: motivo },
      });
      if (count === 0) return null; // a concurrent void won the race

      const updated = await tx.registroBeneficiario.findUniqueOrThrow({ where: { id: beneficiaryId } });
      await logChange(tx, {
        usuario_id: auth.usuario.id,
        accion: "ANULAR",
        entidad: "beneficiarios",
        entidad_id: beneficiaryId,
        proyecto_id: id,
        valor_anterior: { cantidad: existente.cantidad, fecha: existente.fecha },
        valor_nuevo: { anulado_at: updated.anulado_at, motivo_anulacion: motivo },
      });
      return updated;
    });
    if (!row) return conflict(BENEFICIARIO_ANULADO_MESSAGE);

    return NextResponse.json({ registro: toBeneficiarioView(row) });
  },
);
