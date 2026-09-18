// GET/POST /api/v1/projects/:id/expenses — Gasto list/create (RF-06, T3,
// design.md "Presupuesto proyectado vs. ejecutado"). `proyecto_id` is always
// forced from the URL, same invariant as goals/route.ts. `linea_id` IS
// accepted in the body (a gasto must legalize against a línea presupuestal)
// but is re-validated here against THIS project before the write, same
// cross-project pattern as activities/route.ts's `meta_id` check — the
// composite FK from Unit 1 (`Gasto(linea_id, proyecto_id) ->
// LineaPresupuestal(id, proyecto_id)`) is the real backstop.

import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { parseDate, zodError } from "@/lib/api/crm";
import { getProjectForWrite, loadProjectScoped } from "@/lib/api/projects";
import { logAudit } from "@/lib/api/audit";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Projection shared by the Gasto list/detail/create/update responses. */
export const EXPENSE_SELECT = {
  id: true,
  proyecto_id: true,
  linea_id: true,
  concepto: true,
  monto_cop: true,
  fecha_gasto: true,
  registrado_por_id: true,
  created_at: true,
  updated_at: true,
  // RF-06: la trazabilidad al rubro es por FK (gasto -> linea -> rubro, T3),
  // nunca un string copiado — se resuelve aquí para que la UI no necesite un
  // segundo round-trip.
  linea: { select: { rubro_id: true, rubro: { select: { nombre: true } } } },
} as const;

export const EXPENSE_SCHEMA = z.object({
  linea_id: z.string().min(1, "La línea presupuestal es obligatoria."),
  concepto: z.string().trim().min(1, "El concepto del gasto es obligatorio.").max(300, "El concepto es muy largo."),
  monto_cop: z.number().positive("El monto debe ser mayor a cero."),
  fecha_gasto: z.string().refine((v) => parseDate(v) !== null, "Fecha de gasto no válida."),
});

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los gastos del proyecto. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const access = await loadProjectScoped(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El proyecto no existe." : "No tienes permisos sobre este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const gastos = await db.gasto.findMany({
      where: { proyecto_id: id, deleted_at: null },
      select: EXPENSE_SELECT,
      orderBy: { fecha_gasto: "desc" },
    });

    return NextResponse.json({ gastos });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos crear el gasto. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = EXPENSE_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getProjectForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El proyecto no existe."
          : "No tienes permisos para crear gastos en este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    // Friendly API-layer rejection of a cross-project linea_id, same pattern
    // as activities/route.ts's meta_id check. The composite FK is the real
    // backstop with or without this check.
    const linea = await db.lineaPresupuestal.findFirst({
      where: { id: parsed.data.linea_id, proyecto_id: id, deleted_at: null },
      select: { id: true },
    });
    if (!linea) {
      return apiError("La línea presupuestal no existe o no pertenece a este proyecto.", 400, "VALIDATION_ERROR");
    }

    const gasto = await db.gasto.create({
      data: {
        proyecto_id: id,
        linea_id: parsed.data.linea_id,
        concepto: parsed.data.concepto,
        monto_cop: new Prisma.Decimal(parsed.data.monto_cop),
        fecha_gasto: parseDate(parsed.data.fecha_gasto)!,
        registrado_por_id: auth.usuario.id,
      },
      select: EXPENSE_SELECT,
    });

    await logAudit({
      entidad: "presupuesto",
      entidad_id: gasto.id,
      accion: "crear",
      usuario_id: auth.usuario.id,
      cambios: parsed.data,
    });

    return NextResponse.json({ gasto }, { status: 201 });
  },
);
