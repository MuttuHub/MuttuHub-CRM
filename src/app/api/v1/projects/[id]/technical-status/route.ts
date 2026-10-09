// GET /api/v1/projects/:id/technical-status?corte=AAAA-MM-DD — technical semáforo (S4 U5).
//
// Real progress (counted avances per deliverable, weighted by activity), the
// programmed progress at the corte, the deviation in percentage points and the
// color derived from the configured thresholds. The corte defaults to today in
// Bogota; only non-voided avances dated up to the corte are read, and an avance
// counts only with a live medio while `avance_requiere_medio` holds. Readable in
// any estado by whoever can read the project (404 -> 403 -> 409 -> 400). Percent
// values are 0..100 rounded to one decimal; the color comes from the unrounded
// deviation. `base=vigente` (default) reads the live structure; `base=original` the weeks, weights
// and quantities frozen in version 0, with the same live avances matched by code (S8).

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { gateEjecucionRead } from "@/lib/api/ejecucion";
import { resolverBase } from "@/lib/api/versiones";
import { loadTecnicoStatus } from "@/lib/api/tecnico";
import { getSemaforoParametrosV2 } from "@/lib/settings";
import { assertIsoDate, todayInBogota } from "@/lib/proyectos/weeks";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const CORTE_INVALIDO_MESSAGE = "El corte no es válido. Usa el formato AAAA-MM-DD.";
export const SIN_FECHAS_MESSAGE = "El proyecto aún no tiene fechas de inicio y fin.";

/** 0..1 fraction to a 0..100 percentage with one decimal. */
const pct = (fraction: number) => Math.round(fraction * 1000) / 10;

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos calcular el semáforo técnico. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEjecucionRead(auth.usuario, id);
    if (!gate.ok) return gate.response;
    const { estado, fecha_inicio } = gate.value;
    if (!fecha_inicio) return apiError(SIN_FECHAS_MESSAGE, 409, "INVALID_STATE");

    const raw = new URL(request.url).searchParams.get("corte");
    const corte = raw === null || raw === "" ? todayInBogota() : raw;
    try {
      assertIsoDate(corte);
    } catch {
      return apiError(CORTE_INVALIDO_MESSAGE, 400, "VALIDATION_ERROR");
    }

    const base = await resolverBase(id, new URL(request.url).searchParams.get("base"));
    if (!base.ok) return base.response;
    const original = base.value.base === "original" ? base.value.snapshot : null;

    const parametros = await getSemaforoParametrosV2();
    const { tecnico, umbrales, color } = await loadTecnicoStatus({
      proyectoId: id,
      // The original keeps ITS start: the weeks of v0 are counted from the date it was approved with.
      fechaInicio: original ? new Date(`${original.proyecto.fecha_inicio}T00:00:00.000Z`) : fecha_inicio,
      corte,
      parametros,
      estructura: original ?? undefined,
    });

    return NextResponse.json({
      base: base.value.base,
      corte,
      estado,
      avance_real: pct(tecnico.avance_real),
      avance_programado: pct(tecnico.avance_programado),
      desviacion_pp: Math.round(tecnico.desviacion_pp * 10) / 10,
      color,
      actividades: tecnico.actividades.map((actividad) => ({
        id: actividad.id,
        codigo: actividad.codigo,
        peso: actividad.peso,
        progreso: pct(actividad.progreso),
        estado: actividad.estado,
        fecha_cumplimiento: actividad.fecha_cumplimiento,
      })),
      umbrales: { ...umbrales, confirmado: parametros.umbral1.confirmado && parametros.umbral2.confirmado },
    });
  },
);
