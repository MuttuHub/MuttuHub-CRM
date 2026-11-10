// GET /api/v1/opportunities — cross-client opportunity list (V1, S1/S2/S3).
//
// READ-ONLY. Moving an opportunity to another stage reuses the existing
// PATCH /api/v1/clients/:id/opportunities/:opportunityId (which enforces
// canManageOpportunity); this route never writes and S4 forbids touching
// EstadoOportunidad or the schema.
//
// Read gate: `hasCommercialAccess`, exactly like the per-client route
// (RNF-C02) — a COLABORADOR without the flag gets the same 403 FORBIDDEN
// envelope and no query is issued. There is no responsable filter: read scope
// is global per S8/Decisions ("se apoya en hasCommercialAccess").
//
// Envelope: `{ oportunidades, totales }`, top-level like
// /api/v1/dashboard/pipeline. `totales` keeps the pipeline funnel item shape
// ({ estado, count }) and adds the COP sum S1 requires, one entry per the
// seven columns in the S1 mapping order (not the enum declaration order).
//
// Volume is small (PRD §8.4): findMany + aggregation in JS, the same pattern
// the pipeline route uses (no groupBy). Oportunidad has no index on cliente_id
// or estado and S4 forbids a migration, so the list sorts by created_at desc
// and the cost is accepted.

import { NextResponse } from "next/server";
import type { EstadoOportunidad } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { clienteFeedScope } from "@/lib/api/crm";
import { requireApiUser } from "@/lib/supabase/server";
import { canManageOpportunity, hasCommercialAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** The seven S1 columns, in the order the decided mapping lists them. */
const OPORTUNIDAD_ESTADOS: readonly EstadoOportunidad[] = [
  "EN_REVISION",
  "DISENANDO_PROPUESTA",
  "PRESENTADA",
  "EN_NEGOCIACION",
  "GANADA",
  "PERDIDA",
  "STANDBY",
];

/** Cents-safe COP sum, same rounding the pipeline face applies. */
function sumarCop(values: readonly (number | null)[]): number {
  return Math.round(values.reduce<number>((acc, value) => acc + (value ?? 0), 0) * 100) / 100;
}

export const GET = withApiErrorHandling(
  "opportunities",
  "No pudimos cargar las oportunidades. Inténtalo de nuevo.",
  async (_request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const actor = {
      id: auth.usuario.id,
      rol: auth.usuario.rol,
      gestiona_oportunidades: auth.usuario.gestiona_oportunidades,
    };
    if (!hasCommercialAccess(actor)) {
      // Same envelope the per-client GET returns for the same condition.
      return apiError("No tienes permisos para ver las oportunidades.", 403, "FORBIDDEN");
    }

    const rows = await db.oportunidad.findMany({
      // Same client visibility the per-client route enforces: soft-deleted
      // clients never surface. `clienteFeedScope()` is `{}` since S8 (global
      // client read) and is spread anyway so a future scope change lands here.
      where: { deleted_at: null, cliente: { deleted_at: null, ...clienteFeedScope() } },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        cliente_id: true,
        nombre: true,
        estado: true,
        valor_estimado_cop: true,
        // responsable_id feeds the per-row move flag; the client is readable
        // globally (S8), so it is not a read filter.
        cliente: { select: { nombre: true, responsable_id: true } },
      },
    });

    const oportunidades = rows.map(({ cliente, valor_estimado_cop, ...rest }) => ({
      ...rest,
      cliente_nombre: cliente.nombre,
      valor_estimado_cop: valor_estimado_cop === null ? null : Number(valor_estimado_cop),
      // Server-authoritative write flag (same pattern as the clients list's
      // puede_gestionar_oportunidades). The PATCH re-checks it; the client only
      // uses it to decide whether to offer the move at all.
      puede_gestionar: canManageOpportunity(cliente, actor),
    }));

    const totales = OPORTUNIDAD_ESTADOS.map((estado) => {
      const delEstado = oportunidades.filter((o) => o.estado === estado);
      return {
        estado,
        count: delEstado.length,
        total_cop: sumarCop(delEstado.map((o) => o.valor_estimado_cop)),
      };
    });

    return NextResponse.json({ oportunidades, totales });
  },
);
