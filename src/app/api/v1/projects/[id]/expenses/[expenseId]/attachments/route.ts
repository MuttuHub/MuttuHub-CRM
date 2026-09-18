// GET /api/v1/projects/:id/expenses/:expenseId/attachments — RF-06:
// soportes de legalización financiera (factura/cuenta de cobro/planilla)
// scoped a un `Gasto`. Read-only, mismo eje canViewProject que el listado
// general. La trazabilidad al rubro es por FK (gasto -> linea -> rubro, T3
// de design.md), así que este endpoint solo confirma que el gasto exista y
// pertenezca a este proyecto — no necesita resolver el rubro él mismo.
//
// Deviation declarada: spec.md nombra el archivo de test de este escenario
// `budget/[id]/attachments/route.test.ts`, pero design.md (File Changes) y
// tasks.md (4a.4: "create projects/[id]/budget/route.ts, expenses/route.ts")
// reservan `budget/` para `LineaPresupuestal` y `expenses/` para `Gasto`.
// Usar `budget/[expenseId]` aquí crearía dos recursos distintos bajo el
// mismo segmento de ruta; `expenses/[expenseId]` es el nombre canónico del
// agregado que este scope realmente lee.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { loadProjectScoped } from "@/lib/api/projects";
import { SUPPORT_SELECT, resolveDownloadUrls } from "../../../attachments/route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; expenseId: string }> };

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los soportes del gasto. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, expenseId } = await ctx.params;

    const access = await loadProjectScoped(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El proyecto no existe." : "No tienes permisos sobre este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const gasto = await db.gasto.findFirst({
      where: { id: expenseId, proyecto_id: id, deleted_at: null },
      select: { id: true },
    });
    if (!gasto) {
      return apiError("El gasto no existe.", 404, "NOT_FOUND");
    }

    const soportes = await db.soporteProyecto.findMany({
      where: { gasto_id: expenseId, proyecto_id: id, deleted_at: null },
      select: SUPPORT_SELECT,
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json({ soportes: await resolveDownloadUrls(soportes) });
  },
);
