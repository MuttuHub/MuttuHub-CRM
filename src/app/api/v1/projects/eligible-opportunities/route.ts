// GET /api/v1/projects/eligible-opportunities — the GANADA opportunities that
// have no project yet (contract E-04, P05). Feeds the origin step of the
// project form; only project managers (`canCreateProject`) may read it.
//
// "No project" means no `proyectos` row at all, soft-deleted included:
// `oportunidad_id` is uniquely indexed without a partial predicate, so a
// soft-deleted project still occupies the slot and blocks a new creation. The
// list predicate and the E-05 409 therefore agree.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { canCreateProject } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar las oportunidades elegibles. Inténtalo de nuevo.",
  async () => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    if (!canCreateProject(auth.usuario)) {
      return apiError("No tienes permisos para crear proyectos.", 403, "FORBIDDEN");
    }

    const rows = await db.oportunidad.findMany({
      where: {
        estado: "GANADA",
        deleted_at: null,
        proyecto: { is: null },
      },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        nombre: true,
        cliente_id: true,
        valor_estimado_cop: true,
        cliente: { select: { nombre: true } },
      },
    });

    return NextResponse.json({
      oportunidades: rows.map((row) => ({
        id: row.id,
        nombre: row.nombre,
        cliente_id: row.cliente_id,
        cliente_nombre: row.cliente.nombre,
        valor_estimado_cop: row.valor_estimado_cop,
      })),
    });
  },
);
