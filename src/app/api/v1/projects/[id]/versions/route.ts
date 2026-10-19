// GET /api/v1/projects/:id/versions — the version history of a project (S8 U5, E-27).
//
// Version 0 is the approved baseline; every approved modification adds the next number. Only the
// metadata travels here (date, approver, motivo of the request); the snapshot is read per version.
// Whoever can read the project (404 -> 403).

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { gatePresupuestoRead } from "@/lib/api/presupuesto";
import { loadNombres } from "@/lib/api/modificaciones";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar las versiones. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gatePresupuestoRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const filas = await db.versionProyecto.findMany({
      where: { proyecto_id: id },
      orderBy: { numero: "desc" },
      select: {
        numero: true,
        tipo: true,
        solicitud_id: true,
        aprobado_por_id: true,
        aprobado_at: true,
        solicitud: { select: { motivo: true } },
      },
    });
    const nombres = await loadNombres(filas.map((f) => f.aprobado_por_id));
    return NextResponse.json({
      versiones: filas.map((f) => ({
        numero: f.numero,
        tipo: f.tipo,
        aprobado_at: f.aprobado_at.toISOString(),
        aprobado_por: { id: f.aprobado_por_id, nombre: nombres.get(f.aprobado_por_id) ?? null },
        motivo: f.solicitud?.motivo ?? null,
        solicitud_id: f.solicitud_id,
      })),
    });
  },
);
