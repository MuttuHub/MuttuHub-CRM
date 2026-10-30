// Batched KPI loader of the project dashboards (S9 U3, ADR-12 alternative).
//
// One query per table for ALL the projects (`proyecto_id IN ...`): the number of round trips is
// constant in the number of projects, which is the fix for the per-project loop (6 queries x N).
// Money is summed in the database (`groupBy`), never by loading expense rows. The numbers must
// equal the per-project endpoints (`technical-status`, `financial-sheet`): the parity test pins it.

import { db } from "@/lib/db";
import { isoDate } from "@/lib/proyectos/proyecto-general";
import { toCents, type Cents } from "@/lib/proyectos/money";
import { pesoActividad } from "@/lib/proyectos/actividad";
import {
  esMedible,
  kpisNoMedible,
  kpisProyecto,
  type IndicadorKpiInput,
  type KpiActividadInput,
  type KpisProyecto,
} from "@/lib/proyectos/kpis";
import type { ParametrosV2 } from "@/lib/proyectos/semaforo-v2";
import type { SnapshotV1 } from "@/lib/proyectos/versiones";
import { periodOf, activityDates, type IsoDate } from "@/lib/proyectos/weeks";

const toNumber = (value: { toString(): string }) => Number(value.toString());
const ZERO: Cents = toCents("0");
const sumOf = (value: { toString(): string } | null | undefined): Cents => (value == null ? ZERO : toCents(value));

export type ProyectoKpiBase = {
  id: string;
  estado: string;
  fecha_inicio: Date | null;
  fecha_fin: Date | null;
  beneficiarios_meta: number | null;
};

function group<T extends { proyecto_id: string }>(rows: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(row.proyecto_id, [...(map.get(row.proyecto_id) ?? []), row]);
  return map;
}

/** The frozen version 0 of ONE project of the batch (`base=original`, S8): structure, A and P come from it. */
export type OriginalBase = { proyectoId: string; snapshot: SnapshotV1 };

const sumaCents = (values: Iterable<string>): Cents => {
  let total = ZERO;
  for (const value of values) total += toCents(value);
  return total;
};

/**
 * KPIs of every given project at `corte` (calendar date; the financial side uses its month, like the
 * sheet). Projects outside D5 or without dates are returned with null KPIs and cost no query.
 * The portfolio is always `base=vigente` (D3).
 */
export async function loadKpisPortafolio(input: {
  proyectos: readonly ProyectoKpiBase[];
  corte: IsoDate;
  parametros: ParametrosV2;
  /** Optional frozen base for one project; the others stay vigente. Avances, mediciones and E are always live. */
  original?: OriginalBase;
}): Promise<Map<string, KpisProyecto>> {
  const { corte, parametros } = input;
  const result = new Map<string, KpisProyecto>();
  const medibles = input.proyectos.filter((p) => esMedible(p.estado) && p.fecha_inicio && p.fecha_fin);
  for (const p of input.proyectos) {
    if (!medibles.includes(p)) result.set(p.id, kpisNoMedible(corte, p.estado, parametros));
  }
  if (medibles.length === 0) return result;

  const ids = medibles.map((p) => p.id);
  const hasta = new Date(`${corte}T00:00:00.000Z`);
  const periodo = periodOf(corte);

  const [actividades, avances, soportes, indicadores, beneficiarios, asignado, programado, ejecutado] = await Promise.all([
    db.actividad.findMany({
      where: { proyecto_id: { in: ids }, deleted_at: null },
      select: {
        id: true,
        proyecto_id: true,
        codigo: true,
        semana_inicio: true,
        semana_fin: true,
        entregables: { where: { deleted_at: null }, select: { id: true, codigo: true, cantidad_meta: true } },
      },
    }),
    db.avanceEntregable.findMany({
      where: { proyecto_id: { in: ids }, anulado_at: null, fecha: { lte: hasta } },
      select: { id: true, proyecto_id: true, entregable_id: true, fecha: true, cantidad: true, created_at: true },
    }),
    db.soporteProyecto.groupBy({
      by: ["avance_id"],
      where: { proyecto_id: { in: ids }, avance_id: { not: null }, deleted_at: null },
      _count: { _all: true },
    }),
    db.indicador.findMany({
      where: { proyecto_id: { in: ids }, deleted_at: null },
      select: {
        id: true,
        proyecto_id: true,
        meta: true,
        mediciones: {
          where: { anulado_at: null, fecha: { lte: hasta } },
          select: { fecha: true, valor: true, created_at: true },
        },
      },
    }),
    db.registroBeneficiario.groupBy({
      by: ["proyecto_id"],
      where: { proyecto_id: { in: ids }, anulado_at: null, fecha: { lte: hasta } },
      _sum: { cantidad: true },
    }),
    db.lineaPresupuestal.groupBy({
      by: ["proyecto_id"],
      where: { proyecto_id: { in: ids } },
      _sum: { monto_proyectado_cop: true },
    }),
    db.programacionPeriodo.groupBy({
      by: ["proyecto_id"],
      where: { proyecto_id: { in: ids }, periodo: { lte: periodo } },
      _sum: { valor: true },
    }),
    db.gasto.groupBy({
      by: ["proyecto_id"],
      where: { proyecto_id: { in: ids }, estado: "VALIDADO", periodo: { lte: periodo } },
      _sum: { monto_cop: true },
    }),
  ]);

  const medios = new Map<string, number>();
  for (const row of soportes) if (row.avance_id) medios.set(row.avance_id, row._count._all);
  const avancesDe = new Map<string, typeof avances>();
  for (const avance of avances) {
    avancesDe.set(avance.entregable_id, [...(avancesDe.get(avance.entregable_id) ?? []), avance]);
  }
  const actividadesDe = group(actividades);
  const indicadoresDe = group(indicadores);
  const sumaPor = <T extends { proyecto_id: string }>(rows: readonly T[], pick: (row: T) => Cents | number) =>
    new Map(rows.map((row) => [row.proyecto_id, pick(row)]));
  const beneficiariosDe = sumaPor(beneficiarios, (r) => r._sum.cantidad ?? 0);
  const asignadoDe = sumaPor(asignado, (r) => sumOf(r._sum.monto_proyectado_cop));
  const programadoDe = sumaPor(programado, (r) => sumOf(r._sum.valor));
  const ejecutadoDe = sumaPor(ejecutado, (r) => sumOf(r._sum.monto_cop));

  for (const proyecto of medibles) {
    const congelado = input.original?.proyectoId === proyecto.id ? input.original.snapshot : null;
    // The original keeps ITS start: the weeks of v0 are counted from the date it was approved with.
    const inicio = congelado ? congelado.proyecto.fecha_inicio : isoDate(proyecto.fecha_inicio as Date);
    const fuente = congelado
      ? desdeSnapshot(congelado, actividadesDe.get(proyecto.id) ?? [])
      : (actividadesDe.get(proyecto.id) ?? []).map((a) => ({ ...a, peso: pesoActividad(a) }));
    const entrada: KpiActividadInput[] = fuente.map((actividad) => {
      const fechas = activityDates(inicio, actividad.semana_inicio, actividad.semana_fin);
      return {
        id: actividad.id,
        codigo: actividad.codigo,
        peso: actividad.peso,
        inicio: fechas.inicio,
        fin: fechas.fin,
        entregables: actividad.entregables.map((entregable) => ({
          id: entregable.id,
          meta: toNumber(entregable.cantidad_meta),
          avances: (avancesDe.get(entregable.id) ?? []).map((avance) => ({
            fecha: isoDate(avance.fecha),
            cantidad: toNumber(avance.cantidad),
            anulado: false,
            tieneMedio: (medios.get(avance.id) ?? 0) > 0,
            createdAt: avance.created_at.toISOString(),
          })),
        })),
      };
    });
    const indicadoresKpi: IndicadorKpiInput[] = (indicadoresDe.get(proyecto.id) ?? []).map((indicador) => ({
      id: indicador.id,
      meta: toNumber(indicador.meta),
      mediciones: indicador.mediciones.map((m) => ({
        fecha: isoDate(m.fecha),
        valor: toNumber(m.valor),
        anulado: false,
        createdAt: m.created_at.toISOString(),
      })),
    }));
    result.set(
      proyecto.id,
      kpisProyecto({
        corte,
        estado: proyecto.estado,
        parametros,
        actividades: entrada,
        indicadores: indicadoresKpi,
        beneficiarios: {
          total: Number(beneficiariosDe.get(proyecto.id) ?? 0),
          meta: congelado ? congelado.proyecto.beneficiarios_meta : proyecto.beneficiarios_meta,
        },
        financiero: {
          asignado: congelado
            ? sumaCents(congelado.presupuesto.map((r) => r.asignado))
            : ((asignadoDe.get(proyecto.id) as Cents | undefined) ?? ZERO),
          programado: congelado
            ? sumaCents(congelado.programacion.filter((c) => c.periodo <= periodo).map((c) => c.valor))
            : ((programadoDe.get(proyecto.id) as Cents | undefined) ?? ZERO),
          ejecutado: (ejecutadoDe.get(proyecto.id) as Cents | undefined) ?? ZERO,
        },
      }),
    );
  }
  return result;
}

type ActividadFuente = {
  id: string;
  codigo: string;
  semana_inicio: number;
  semana_fin: number;
  peso: number;
  entregables: { id: string; cantidad_meta: { toString(): string } }[];
};

/** The frozen structure in the shape of the live rows; ids come from the live rows with the same code. */
function desdeSnapshot(
  snapshot: SnapshotV1,
  vivas: readonly { id: string; codigo: string; entregables: readonly { id: string; codigo: string }[] }[],
): ActividadFuente[] {
  const idActividad = new Map(vivas.map((a) => [a.codigo, a.id]));
  const idEntregable = new Map(vivas.flatMap((a) => a.entregables.map((e) => [e.codigo, e.id] as const)));
  return snapshot.actividades.map((a) => ({
    id: idActividad.get(a.codigo) ?? a.codigo,
    codigo: a.codigo,
    semana_inicio: a.semana_inicio,
    semana_fin: a.semana_fin,
    peso: Number(a.peso),
    entregables: snapshot.entregables
      .filter((e) => e.actividad_codigo === a.codigo)
      .map((e) => ({ id: idEntregable.get(e.codigo) ?? e.codigo, cantidad_meta: e.cantidad_meta })),
  }));
}
