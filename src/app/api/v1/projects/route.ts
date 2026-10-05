// GET /api/v1/projects — v2 project list (contract E-02, P01).
//
// Filters `?estado&cliente_id&linea_id&municipio_id&responsable_id`; any
// authenticated user may call it, but the rows are narrowed by the project
// read scope in `src/lib/api/projects.ts` (`canViewPortfolio` today, with the
// membership axis arriving in S2.6) — never by a role list declared here.
//
// No pagination: E-02 returns `{ proyectos: ProjectItemV2[] }`.

import { NextResponse } from "next/server";
import { EstadoProyecto } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import {
  PROJECT_SELECT_V2,
  projectListWhere,
  toProjectItemV2,
  type ProjectListFilters,
} from "@/lib/api/projects";

export const dynamic = "force-dynamic";

const ESTADOS = Object.values(EstadoProyecto);

/** E-02 filters; an unknown `estado` is a 400 instead of an empty list. */
function parseProjectListFilters(
  url: URL,
): { ok: true; filters: ProjectListFilters } | { ok: false; response: Response } {
  const sp = url.searchParams;

  const estado = sp.get("estado") ?? undefined;
  if (estado && !ESTADOS.includes(estado as EstadoProyecto)) {
    return { ok: false, response: apiError("Estado de proyecto no válido.", 400, "VALIDATION_ERROR") };
  }

  return {
    ok: true,
    filters: {
      estado,
      cliente_id: sp.get("cliente_id") ?? undefined,
      linea_id: sp.get("linea_id") ?? undefined,
      municipio_id: sp.get("municipio_id") ?? undefined,
      responsable_id: sp.get("responsable_id") ?? undefined,
    },
  };
}

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los proyectos. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const parsed = parseProjectListFilters(new URL(request.url));
    if (!parsed.ok) return parsed.response;

    const rows = await db.proyecto.findMany({
      where: projectListWhere(auth.usuario, parsed.filters),
      orderBy: { codigo: "asc" },
      select: PROJECT_SELECT_V2,
    });

    return NextResponse.json({ proyectos: rows.map(toProjectItemV2) });
  },
);
