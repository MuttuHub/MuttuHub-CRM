// GET /api/v1/projects/:id/versions/:numero — one frozen version with its snapshot (S8 U5, E-27).
// Whoever can read the project (404 project -> 403 -> 400 token -> 404 version).

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { gatePresupuestoRead } from "@/lib/api/presupuesto";
import { loadNombres } from "@/lib/api/modificaciones";
import { VERSION_INVALIDA, VERSION_NO_EXISTE, parseTokenVersion } from "@/lib/api/versiones";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; numero: string }> };

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar la versión. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, numero } = await ctx.params;

    const gate = await gatePresupuestoRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const token = parseTokenVersion(numero, false);
    if (token?.tipo !== "numero") return apiError(VERSION_INVALIDA, 400, "VALIDATION_ERROR");

    const fila = await db.versionProyecto.findFirst({
      where: { proyecto_id: id, numero: token.numero },
      select: {
        numero: true,
        tipo: true,
        solicitud_id: true,
        aprobado_por_id: true,
        aprobado_at: true,
        snapshot: true,
        solicitud: { select: { motivo: true } },
      },
    });
    if (!fila) return apiError(VERSION_NO_EXISTE, 404, "NOT_FOUND");

    const nombres = await loadNombres([fila.aprobado_por_id]);
    return NextResponse.json({
      version: {
        numero: fila.numero,
        tipo: fila.tipo,
        aprobado_at: fila.aprobado_at.toISOString(),
        aprobado_por: { id: fila.aprobado_por_id, nombre: nombres.get(fila.aprobado_por_id) ?? null },
        motivo: fila.solicitud?.motivo ?? null,
        solicitud_id: fila.solicitud_id,
        snapshot: fila.snapshot as Prisma.JsonValue,
      },
    });
  },
);
