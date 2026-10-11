// Technical semáforo computation shared by `technical-status` and the S5
// financial sheet (the delay alert reads the SAME color, never a re-derivation).

import { db } from "@/lib/db";
import { contarMediosVivos } from "@/lib/api/ejecucion";
import { calcularTecnico, fraccionTiempo, type ActividadTecnicaInput, type ActividadTecnicaResultado } from "@/lib/proyectos/avance";
import { diasAlCorte, duracionDias, pesoEfectivo, resumenObjetivos, type ObjetivoResumen } from "@/lib/proyectos/actividad";
import { isoDate } from "@/lib/proyectos/proyecto-general";
import { colorTecnicoV2, type ColorSemaforo, type ParametrosV2 } from "@/lib/proyectos/semaforo-v2";
import type { SnapshotV1 } from "@/lib/proyectos/versiones";
import { activityDates, type IsoDate } from "@/lib/proyectos/weeks";

const toNumber = (value: { toString(): string }) => Number(value.toString());

/** One activity of the technical read, enriched for the v6 schedule views (S14 P6). */
export type TecnicoActividad = ActividadTecnicaResultado & {
  nombre: string;
  /** Code of the objective the activity belongs to (the v6 grouping key). */
  objetivo_codigo: string;
  /** Planned fraction 0..1 at the corte (the v6 "% plan" column). */
  programado: number;
  /** Duration in calendar days, both ends included (the v6 "Días" column). */
  dias: number;
  /** Days elapsed at the corte, clamped to the duration (the v6 "Al corte" column). */
  al_corte: number;
  /** Server-computed semáforo of this activity; the client never derives it (D11). */
  color: ColorSemaforo;
  /** True when none of the activity's avances has a live support. */
  sin_soporte: boolean;
};

export type TecnicoStatus = {
  tecnico: ReturnType<typeof calcularTecnico>;
  /** The enriched activities, in the same order as `tecnico.actividades`. */
  actividades: TecnicoActividad[];
  /** Roll-up per objective (weighted planned vs executed and its colour). */
  objetivos: ObjetivoResumen[];
  umbrales: { umbral1: number; umbral2: number };
  color: ColorSemaforo;
};

/**
 * Technical progress of a project at `corte` (a calendar date): only non-voided
 * avances dated up to the corte count, and an avance needs a live medio while
 * `avance_requiere_medio` holds. Every activity comes back enriched with its
 * planned fraction, duration, elapsed days, its own semáforo and whether it has a
 * live support, plus the per-objective roll-up the v6 views need.
 */
export async function loadTecnicoStatus(input: {
  proyectoId: string;
  fechaInicio: Date;
  corte: IsoDate;
  parametros: Pick<ParametrosV2, "umbral1" | "umbral2" | "avance_requiere_medio">;
  /**
   * `base=original` (S8): the weeks, weights and quantities of this frozen version replace the live
   * structure. The avances stay the live ones, matched to the version's deliverables by code.
   */
  estructura?: Pick<SnapshotV1, "actividades" | "entregables">;
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
        nombre: true,
        semana_inicio: true,
        semana_fin: true,
        peso: true,
        peso_manual: true,
        objetivo: { select: { codigo: true } },
        entregables: { where: { deleted_at: null }, select: { id: true, codigo: true, cantidad_meta: true } },
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

  const vivas: ActividadFuente[] = actividades.map((actividad) => ({
    id: actividad.id,
    codigo: actividad.codigo,
    nombre: actividad.nombre,
    // The relation is required in the schema; a test fixture may omit it.
    objetivo_codigo: actividad.objetivo?.codigo ?? "",
    semana_inicio: actividad.semana_inicio,
    semana_fin: actividad.semana_fin,
    peso: actividad.peso,
    peso_manual: actividad.peso_manual,
    entregables: actividad.entregables,
  }));
  const fuente = input.estructura ? desdeSnapshot(input.estructura, vivas) : vivas;
  const entrada: ActividadTecnicaInput[] = fuente.map((actividad) => {
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
  const color = colorTecnicoV2(tecnico.desviacion_pp, umbrales);

  const fechasDe = new Map(entrada.map((actividad) => [actividad.id, { inicio: actividad.inicio, fin: actividad.fin }]));
  const fuenteDe = new Map(fuente.map((actividad) => [actividad.id, actividad]));
  const actividadesEnriquecidas: TecnicoActividad[] = tecnico.actividades.map((resultado) => {
    const fechas = fechasDe.get(resultado.id) ?? { inicio: corte, fin: corte };
    const origen = fuenteDe.get(resultado.id);
    const programado = fraccionTiempo(corte, fechas.inicio, fechas.fin);
    const tieneSoporte =
      origen?.entregables.some((entregable) =>
        (porEntregable.get(entregable.id) ?? []).some((avance) => (medios.get(avance.id) ?? 0) > 0),
      ) ?? false;
    return {
      ...resultado,
      nombre: origen?.nombre ?? "",
      objetivo_codigo: origen?.objetivo_codigo ?? "",
      programado,
      dias: duracionDias(fechas.inicio, fechas.fin),
      al_corte: diasAlCorte(corte, fechas.inicio, fechas.fin),
      color: colorTecnicoV2((programado - resultado.progreso) * 100, umbrales),
      sin_soporte: !tieneSoporte,
    };
  });

  const objetivos = resumenObjetivos(
    actividadesEnriquecidas.map((actividad) => ({
      objetivo_codigo: actividad.objetivo_codigo,
      peso: actividad.peso,
      progreso: actividad.progreso,
      programado: actividad.programado,
    })),
    umbrales,
  );

  return { tecnico, actividades: actividadesEnriquecidas, objetivos, umbrales, color };
}

type ActividadFuente = {
  id: string;
  codigo: string;
  nombre: string;
  objetivo_codigo: string;
  semana_inicio: number;
  semana_fin: number;
  peso: { toString(): string };
  peso_manual: boolean;
  entregables: { id: string; codigo: string; cantidad_meta: { toString(): string } }[];
};

/** The frozen structure in the shape of the live query: ids come from the live rows with the same code. */
function desdeSnapshot(estructura: Pick<SnapshotV1, "actividades" | "entregables">, vivas: readonly ActividadFuente[]): ActividadFuente[] {
  const idActividad = new Map(vivas.map((a) => [a.codigo, a.id]));
  const idEntregable = new Map(vivas.flatMap((a) => a.entregables.map((e) => [e.codigo, e.id] as const)));
  return [...estructura.actividades]
    .sort((a, b) => a.semana_inicio - b.semana_inicio || (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0))
    .map((a) => ({
      id: idActividad.get(a.codigo) ?? a.codigo,
      codigo: a.codigo,
      nombre: a.nombre,
      objetivo_codigo: a.objetivo_codigo,
      semana_inicio: a.semana_inicio,
      semana_fin: a.semana_fin,
      peso: a.peso,
      peso_manual: a.peso_manual,
      entregables: estructura.entregables
        .filter((e) => e.actividad_codigo === a.codigo)
        .map((e) => ({ id: idEntregable.get(e.codigo) ?? e.codigo, codigo: e.codigo, cantidad_meta: e.cantidad_meta })),
    }));
}
