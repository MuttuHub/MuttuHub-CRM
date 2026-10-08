// GET /api/v1/projects/:id/technical-status?corte=AAAA-MM-DD — technical semáforo (S4 U5).
//
// Real progress (counted avances per deliverable, weighted by activity), the
// programmed progress at the corte, the deviation in percentage points and the
// color derived from the configured thresholds. The corte defaults to today in
// Bogota; only non-voided avances dated up to the corte are read, and an avance
// counts only with a live medio while `avance_requiere_medio` holds. Readable in
// any estado by whoever can read the project (404 -> 403 -> 409 -> 400). Percent
// values are 0..100 rounded to one decimal; the color comes from the unrounded
// deviation. `base` is "vigente" until baselines exist (S8).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { contarMediosVivos, gateEjecucionRead } from "@/lib/api/ejecucion";
import { getSemaforoParametrosV2 } from "@/lib/settings";
import { calcularTecnico, type ActividadTecnicaInput } from "@/lib/proyectos/avance";
import { pesoEfectivo } from "@/lib/proyectos/actividad";
import { colorTecnicoV2 } from "@/lib/proyectos/semaforo-v2";
import { isoDate } from "@/lib/proyectos/proyecto-general";
import { activityDates, assertIsoDate, todayInBogota } from "@/lib/proyectos/weeks";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const CORTE_INVALIDO_MESSAGE = "El corte no es válido. Usa el formato AAAA-MM-DD.";
export const SIN_FECHAS_MESSAGE = "El proyecto aún no tiene fechas de inicio y fin.";

const toNumber = (value: { toString(): string }) => Number(value.toString());
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

    const inicio = isoDate(fecha_inicio);
    const [actividades, avances, parametros] = await Promise.all([
      db.actividad.findMany({
        where: { proyecto_id: id, deleted_at: null },
        orderBy: [{ semana_inicio: "asc" }, { codigo: "asc" }],
        select: {
          id: true,
          codigo: true,
          semana_inicio: true,
          semana_fin: true,
          peso: true,
          peso_manual: true,
          entregables: { where: { deleted_at: null }, select: { id: true, cantidad_meta: true } },
        },
      }),
      db.avanceEntregable.findMany({
        where: { proyecto_id: id, anulado_at: null, fecha: { lte: new Date(`${corte}T00:00:00.000Z`) } },
        select: { id: true, entregable_id: true, fecha: true, cantidad: true, created_at: true },
      }),
      getSemaforoParametrosV2(),
    ]);

    const medios = await contarMediosVivos(avances.map((avance) => avance.id));
    const porEntregable = new Map<string, typeof avances>();
    for (const avance of avances) {
      porEntregable.set(avance.entregable_id, [...(porEntregable.get(avance.entregable_id) ?? []), avance]);
    }

    const entrada: ActividadTecnicaInput[] = actividades.map((actividad) => {
      const fechas = activityDates(inicio, actividad.semana_inicio, actividad.semana_fin);
      return {
        id: actividad.id,
        codigo: actividad.codigo,
        peso: pesoEfectivo(actividad),
        inicio: fechas.inicio,
        fin: fechas.fin,
        entregables: actividad.entregables.map((entregable) => ({
          id: entregable.id,
          meta: toNumber(entregable.cantidad_meta),
          avances: (porEntregable.get(entregable.id) ?? []).map((avance) => ({
            fecha: isoDate(avance.fecha),
            cantidad: toNumber(avance.cantidad),
            anulado: false,
            tieneMedio: (medios.get(avance.id) ?? 0) > 0,
            createdAt: avance.created_at.toISOString(),
          })),
        })),
      };
    });

    const tecnico = calcularTecnico({
      corte,
      requiereMedio: parametros.avance_requiere_medio.valor,
      actividades: entrada,
    });
    const umbrales = { umbral1: parametros.umbral1.valor, umbral2: parametros.umbral2.valor };

    return NextResponse.json({
      base: "vigente",
      corte,
      estado,
      avance_real: pct(tecnico.avance_real),
      avance_programado: pct(tecnico.avance_programado),
      desviacion_pp: Math.round(tecnico.desviacion_pp * 10) / 10,
      color: colorTecnicoV2(tecnico.desviacion_pp, umbrales),
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
