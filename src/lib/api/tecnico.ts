// Technical semáforo computation shared by `technical-status` and the S5
// financial sheet (the delay alert reads the SAME color, never a re-derivation).

import { db } from "@/lib/db";
import { contarMediosVivos } from "@/lib/api/ejecucion";
import { calcularTecnico, type ActividadTecnicaInput } from "@/lib/proyectos/avance";
import { pesoEfectivo } from "@/lib/proyectos/actividad";
import { isoDate } from "@/lib/proyectos/proyecto-general";
import { colorTecnicoV2, type ColorSemaforo, type ParametrosV2 } from "@/lib/proyectos/semaforo-v2";
import { activityDates, type IsoDate } from "@/lib/proyectos/weeks";

const toNumber = (value: { toString(): string }) => Number(value.toString());

export type TecnicoStatus = {
  tecnico: ReturnType<typeof calcularTecnico>;
  umbrales: { umbral1: number; umbral2: number };
  color: ColorSemaforo;
};

/**
 * Technical progress of a project at `corte` (a calendar date): only non-voided
 * avances dated up to the corte count, and an avance needs a live medio while
 * `avance_requiere_medio` holds.
 */
export async function loadTecnicoStatus(input: {
  proyectoId: string;
  fechaInicio: Date;
  corte: IsoDate;
  parametros: Pick<ParametrosV2, "umbral1" | "umbral2" | "avance_requiere_medio">;
}): Promise<TecnicoStatus> {
  const { proyectoId, corte, parametros } = input;
  const inicio = isoDate(input.fechaInicio);
  const [actividades, avances] = await Promise.all([
    db.actividad.findMany({
      where: { proyecto_id: proyectoId, deleted_at: null },
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
      where: { proyecto_id: proyectoId, anulado_at: null, fecha: { lte: new Date(`${corte}T00:00:00.000Z`) } },
      select: { id: true, entregable_id: true, fecha: true, cantidad: true, created_at: true },
    }),
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
  return { tecnico, umbrales, color: colorTecnicoV2(tecnico.desviacion_pp, umbrales) };
}
