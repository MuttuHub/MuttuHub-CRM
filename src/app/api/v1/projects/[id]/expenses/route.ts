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

/** Projection shared by the Gasto list/detail/create/update responses.
 * RF-06 (proyecto-legalizacion-tab): `_count.soportes` counts only
 * `SoporteProyecto` rows of `tipo: LEGALIZACION` linked to this gasto — the
 * raw input to `estadoLegalizacion()` below. It is never returned verbatim
 * to the client; `toExpenseResponse()` replaces it with the derived
 * `estado_legalizacion` string. */
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
  tercero: true,
  numero_comprobante: true,
  observado: true,
  observacion: true,
  // RF-06: la trazabilidad al rubro es por FK (gasto -> linea -> rubro, T3),
  // nunca un string copiado — se resuelve aquí para que la UI no necesite un
  // segundo round-trip.
  linea: { select: { rubro_id: true, rubro: { select: { nombre: true } } } },
  _count: { select: { soportes: { where: { tipo: "LEGALIZACION", deleted_at: null } } } },
} as const;

export type EstadoLegalizacion = "observado" | "con_soporte" | "falta_soporte";

/** design.md "Data Model": D1 — `estado_legalizacion` vive UNA sola vez,
 * aquí, del lado del servidor. Nunca se recalcula en el cliente ni se
 * guarda como columna. */
export function estadoLegalizacion(gasto: { observado: boolean; _count: { soportes: number } }): EstadoLegalizacion {
  if (gasto.observado) return "observado";
  return gasto._count.soportes > 0 ? "con_soporte" : "falta_soporte";
}

type SelectedGasto = Prisma.GastoGetPayload<{ select: typeof EXPENSE_SELECT }>;

/** Adds the derived `estado_legalizacion` and drops the internal `_count`
 * shape from the response — the client only ever sees the derived string,
 * never the raw soporte count it was computed from. */
export function toExpenseResponse(gasto: SelectedGasto) {
  const { _count, ...rest } = gasto;
  return { ...rest, estado_legalizacion: estadoLegalizacion({ observado: gasto.observado, _count }) };
}

export const EXPENSE_SCHEMA = z.object({
  linea_id: z.string().min(1, "La línea presupuestal es obligatoria."),
  concepto: z.string().trim().min(1, "El concepto del gasto es obligatorio.").max(300, "El concepto es muy largo."),
  monto_cop: z.number().positive("El monto debe ser mayor a cero."),
  fecha_gasto: z.string().refine((v) => parseDate(v) !== null, "Fecha de gasto no válida."),
  tercero: z.string().trim().max(300, "El tercero es muy largo.").optional(),
  numero_comprobante: z.string().trim().max(100, "El número de comprobante es muy largo.").optional(),
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

    const [gastos, lineas] = await Promise.all([
      db.gasto.findMany({
        where: { proyecto_id: id, deleted_at: null },
        select: EXPENSE_SELECT,
        orderBy: { fecha_gasto: "desc" },
      }),
      // Deviation from design.md's File Changes table (documented in
      // apply evidence): the "Registrar gasto" modal's required Rubro
      // field has no other in-scope data source — `budget/route.ts` is
      // explicitly out of scope for this change, and its `rubros`
      // aggregate doesn't carry `linea_id` anyway (only `rubro_id`,
      // insufficient to submit `POST .../expenses`). No `rubro.activo`
      // filter here: unlike creating a NEW línea (budget/route.ts's D5),
      // registering a gasto against an EXISTING línea must keep working
      // even if its rubro was deactivated afterwards.
      db.lineaPresupuestal.findMany({
        where: { proyecto_id: id, deleted_at: null },
        select: { id: true, rubro_id: true, rubro: { select: { nombre: true } } },
        orderBy: { created_at: "asc" },
      }),
    ]);

    return NextResponse.json({
      gastos: gastos.map(toExpenseResponse),
      lineas: lineas.map((linea) => ({ id: linea.id, rubro_id: linea.rubro_id, rubro_nombre: linea.rubro.nombre })),
    });
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
        tercero: parsed.data.tercero ?? null,
        numero_comprobante: parsed.data.numero_comprobante ?? null,
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

    return NextResponse.json({ gasto: toExpenseResponse(gasto) }, { status: 201 });
  },
);
