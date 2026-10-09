// GET /api/v1/projects/:id/financial-sheet?corte=AAAA-MM&base=vigente — financial ficha (S5 U4, E-18).
//
// Per rubro and total row: A (assigned), P (programmed up to the corte), E
// (validated expenses up to the corte), D = E - P, E/P, E/A, the red threshold
// and the financial color, all through the pure `computeFicha`. E comes from the
// VALIDADO expenses (`loadGastosValidados` seam, S6); while `ejecucion_disponible`
// is false (a BORRADOR project has not started executing) E is $0 and no color,
// percentage or alert is produced. The delay alert lives on
// the total row and reads the same technical color as `technical-status`.
// `base=vigente` (default) reads the live budget; `base=original` the A and P frozen in version 0
// with the same live E (S8); its periods come from the v0 dates and the delay alert still reads
// the vigente technical color. Aggregates only: no per-gasto or support data (P04). Readable in any estado by
// whoever can read the project (404 -> 403 -> 409 -> 400).

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { gatePresupuestoRead } from "@/lib/api/presupuesto";
import {
  BASE_INVALIDA_MESSAGE,
  BASE_ORIGINAL_MESSAGE,
  CORTE_INVALIDO_MESSAGE,
  SIN_FECHAS_MESSAGE,
  calcularFichaFinanciera,
} from "@/lib/api/financial-sheet";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export { BASE_INVALIDA_MESSAGE, BASE_ORIGINAL_MESSAGE, CORTE_INVALIDO_MESSAGE, SIN_FECHAS_MESSAGE };

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos calcular la ficha financiera. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gatePresupuestoRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const params = new URL(request.url).searchParams;
    const sheet = await calcularFichaFinanciera({
      ...gate.value,
      baseParam: params.get("base"),
      corteParam: params.get("corte"),
    });
    if (!sheet.ok) return sheet.response;
    return NextResponse.json(sheet.value);
  },
);
