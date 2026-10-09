// GET /api/v1/dashboard/portfolio?corte&linea_id&cliente_id&responsable_id&estado&municipio_id — E-28 (S9 U4).
//
// Portfolio KPIs over the projects the caller may read: ADMINISTRADOR/GERENCIA and a user flagged
// `puede_ver_tablero_gerencial` see all of them, a COORDINADOR only those they are an active member of
// (the rows come from `projectListWhere`, the same scope as the list), every other caller gets 403.
// The KPIs come from the batched loader (one query per table, whatever the number of projects) and
// are always `base=vigente`. Totals A/P/E are aggregates, never per-gasto or support data (P04).
// There is deliberately NO per-territory breakdown: municipio is only a filter. The path is
// `dashboard/portfolio`, not the SDD's `dashboard/projects` (already used on the v6 branches).

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { cargarPortafolio } from "@/lib/api/portafolio";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(
  "dashboard-portfolio",
  "No pudimos cargar el tablero de proyectos. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const result = await cargarPortafolio(auth.usuario, new URL(request.url));
    if (!result.ok) return result.response;
    return NextResponse.json(result.value);
  },
);
