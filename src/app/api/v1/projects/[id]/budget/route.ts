// GET/POST /api/v1/projects/:id/budget — LineaPresupuestal aggregate read +
// create (RF-01/RF-05, T3/T4, design.md "Presupuesto proyectado vs.
// ejecutado"). `proyecto_id` is always forced from the URL, same invariant
// as goals/route.ts and activities/route.ts.
//
// T3: `monto_ejecutado_cop` is ALWAYS derived from `SUM(gastos.monto_cop)`,
// never a denormalized counter column anywhere in this route.
//
// **Double-counting trap (design.md Risks — "la trampa más fácil de
// introducir de todo el módulo"):** joining `gastos` directly onto
// `lineas_presupuestales` fans out one línea row per gasto, multiplying
// `monto_proyectado_cop` by the gasto count. This route NEVER performs that
// join: líneas and gastos are fetched as two independent `findMany` calls
// and gastos are summed in JS keyed by `linea_id` — the repo's established
// SMALL-volume pattern (see `dashboard/pipeline/route.ts`'s "sin groupBy").
// `monto_proyectado_cop` is read exactly once per línea regardless of how
// many gastos point at it.
//
// D9/design.md reserves the raw `LEFT JOIN LATERAL` SQL for the
// cross-project `GET /api/v1/dashboard/projects` aggregate (Unit 4b) — a
// different, larger-volume query. This per-project endpoint does not need it.

import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { zodError } from "@/lib/api/crm";
import { getProjectForWrite, loadProjectScoped } from "@/lib/api/projects";
import { logAudit } from "@/lib/api/audit";
import { getSetting, SETTING_SEMAFORO_UMBRALES } from "@/lib/settings";
import { UMBRALES_SEMAFORO_DEFAULT } from "@/lib/catalogs";
import { colorFinanciero, resolverUmbrales } from "@/lib/semaforo";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const BUDGET_LINE_SCHEMA = z.object({
  rubro_id: z.string().min(1, "El rubro es obligatorio."),
  monto_proyectado_cop: z.number().min(0, "El monto proyectado no puede ser negativo."),
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar el presupuesto del proyecto. Inténtalo de nuevo.",
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

    const [lineas, gastos, proyecto, umbralesOrganizacion] = await Promise.all([
      db.lineaPresupuestal.findMany({
        where: { proyecto_id: id, deleted_at: null },
        select: {
          id: true,
          rubro_id: true,
          monto_proyectado_cop: true,
          rubro: { select: { id: true, nombre: true, activo: true } },
        },
        orderBy: { created_at: "asc" },
      }),
      // Fetched independently from `lineas` — never joined — so a línea's
      // `monto_proyectado_cop` is read exactly once no matter how many
      // gastos exist against it (the double-counting trap above).
      db.gasto.findMany({
        where: { proyecto_id: id, deleted_at: null },
        select: { linea_id: true, monto_cop: true },
      }),
      db.proyecto.findUnique({ where: { id }, select: { umbrales_override: true } }),
      getSetting(SETTING_SEMAFORO_UMBRALES, UMBRALES_SEMAFORO_DEFAULT),
    ]);

    const umbrales = resolverUmbrales(umbralesOrganizacion, proyecto?.umbrales_override ?? null);

    const ejecutadoPorLinea = new Map<string, number>();
    for (const gasto of gastos) {
      const actual = ejecutadoPorLinea.get(gasto.linea_id) ?? 0;
      ejecutadoPorLinea.set(gasto.linea_id, actual + Number(gasto.monto_cop));
    }

    const rubros = lineas.map((linea) => {
      const proyectado = Number(linea.monto_proyectado_cop);
      const ejecutado = ejecutadoPorLinea.get(linea.id) ?? 0;
      const razon = proyectado > 0 ? ejecutado / proyectado : 0;
      return {
        rubro_id: linea.rubro_id,
        rubro_nombre: linea.rubro.nombre,
        rubro_activo: linea.rubro.activo,
        monto_proyectado_cop: round2(proyectado),
        monto_ejecutado_cop: round2(ejecutado),
        color_financiero: colorFinanciero(razon, umbrales),
      };
    });

    const proyectadoTotal = round2(rubros.reduce((acc, r) => acc + r.monto_proyectado_cop, 0));
    const ejecutadoTotal = round2(rubros.reduce((acc, r) => acc + r.monto_ejecutado_cop, 0));
    const razonTotal = proyectadoTotal > 0 ? ejecutadoTotal / proyectadoTotal : 0;

    return NextResponse.json({
      rubros,
      proyectado_total: proyectadoTotal,
      ejecutado_total: ejecutadoTotal,
      color_financiero_total: colorFinanciero(razonTotal, umbrales),
    });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos crear la línea presupuestal. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = BUDGET_LINE_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getProjectForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El proyecto no existe."
          : "No tienes permisos para crear líneas presupuestales en este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const rubro = await db.rubro.findFirst({
      where: { id: parsed.data.rubro_id, deleted_at: null },
      select: { id: true, activo: true },
    });
    if (!rubro) {
      return apiError("El rubro no existe.", 400, "VALIDATION_ERROR");
    }
    // D5/spec.md: un rubro inactivo no es una opción para líneas NUEVAS. Una
    // línea ya creada contra un rubro que se desactiva después sigue intacta
    // — este chequeo solo aplica a la creación, nunca a la lectura.
    if (!rubro.activo) {
      return apiError(
        "Este rubro no está disponible para nuevas líneas presupuestales.",
        400,
        "VALIDATION_ERROR",
      );
    }

    // T4: una línea por rubro y proyecto (`@@unique([proyecto_id, rubro_id])`).
    const existente = await db.lineaPresupuestal.findFirst({
      where: { proyecto_id: id, rubro_id: parsed.data.rubro_id, deleted_at: null },
      select: { id: true },
    });
    if (existente) {
      return apiError("Ya existe una línea presupuestal para este rubro.", 409, "CONFLICT");
    }

    const linea = await db.lineaPresupuestal.create({
      data: {
        proyecto_id: id,
        rubro_id: parsed.data.rubro_id,
        monto_proyectado_cop: new Prisma.Decimal(parsed.data.monto_proyectado_cop),
      },
      select: {
        id: true,
        proyecto_id: true,
        rubro_id: true,
        monto_proyectado_cop: true,
        created_at: true,
      },
    });

    await logAudit({
      entidad: "presupuesto",
      entidad_id: linea.id,
      accion: "crear",
      usuario_id: auth.usuario.id,
      cambios: parsed.data,
    });

    return NextResponse.json({ linea }, { status: 201 });
  },
);
