// Source of the "Requiere atención" list (S14 P5) behind `GET /api/v1/projects/:id/attention`.
//
// The KPI block of the very same project (S9) is the single source of `medible`, `corte` and the
// financial delay alert, so the attention list cannot disagree with the ficha. The per-item rows are
// read in one batch and mapped to the pure `construirAtencion`; a source without rows simply
// contributes nothing. Readable in any estado by whoever can read the project (404 -> 403 -> 409 -> 400).
//
// The pending modification requests (AJ-09) are part of the ficha's list only: a caller asks for them
// with `incluirSolicitudes`. The weekly report reuses this loader for every measurable project and does
// not ask, so it neither reads them nor changes what it prints.

import { db } from "@/lib/db";
import { calcularKpisProyecto } from "@/lib/api/kpis-proyecto";
import type { ProyectoKpiBase } from "@/lib/api/kpis-portafolio";
import { loadGastosEjecutados } from "@/lib/api/financiera";
import { loadNombres, SOLICITUD_SELECT, toSolicitudView } from "@/lib/api/modificaciones";
import { cargarReportesPorActividad } from "@/lib/api/tecnico";
import { getSemaforoParametrosV2 } from "@/lib/settings";
import { cuentaTecnico, pesoActividad } from "@/lib/proyectos/actividad";
import { datosIncompletos } from "@/lib/proyectos/gastos";
import { toCents, type Cents } from "@/lib/proyectos/money";
import { isoDate } from "@/lib/proyectos/proyecto-general";
import { activityDates, periodOf, todayInBogota } from "@/lib/proyectos/weeks";
import {
  construirAtencion,
  type AtencionActividadInput,
  type AtencionAvanceInput,
  type AtencionGastoInput,
  type AtencionIndicadorInput,
  type AtencionModificacionInput,
  type AtencionProyecto,
  type AtencionRubroInput,
} from "@/lib/proyectos/atencion";

const toNumber = (value: { toString(): string }) => Number(value.toString());
const ZERO: Cents = BigInt(0);

/**
 * The requests of the project still waiting for a decision (AJ-09), oldest first, through the same view
 * and name lookup as the requests list of the ficha, so both name the same person.
 */
async function cargarSolicitudesPendientes(proyectoId: string): Promise<AtencionModificacionInput[]> {
  const filas = await db.solicitudModificacion.findMany({
    where: { proyecto_id: proyectoId, estado: "PENDIENTE" },
    orderBy: [{ solicitado_at: "asc" }, { id: "asc" }],
    select: SOLICITUD_SELECT,
  });
  const nombres = await loadNombres(filas.map((fila) => fila.solicitado_por_id));
  return filas.map((fila) => {
    const solicitud = toSolicitudView(fila, nombres);
    return {
      id: solicitud.id,
      tipo: solicitud.tipo,
      estado: solicitud.estado,
      solicitado_por: solicitud.solicitado_por.nombre,
      solicitado_at: todayInBogota(new Date(solicitud.solicitado_at)),
    };
  });
}

/**
 * The attention list of one project at `corteParam` (calendar date; absent means today in Bogotá).
 * Dates are required (409) and the corte must parse (400), exactly like the KPI endpoint; a project
 * outside the measurable states answers `medible: false` with an empty list, never an error.
 */
export async function cargarAtencion(input: {
  proyecto: ProyectoKpiBase;
  corteParam: string | null;
  /** Adds the requests still waiting for a decision (AJ-09). Off by default: only the ficha lists them. */
  incluirSolicitudes?: boolean;
}): Promise<{ ok: true; value: AtencionProyecto } | { ok: false; response: Response }> {
  const calculado = await calcularKpisProyecto({
    proyecto: input.proyecto,
    corteParam: input.corteParam,
    baseParam: null,
  });
  if (!calculado.ok) return calculado;

  const { kpis } = calculado.value;
  const { corte } = kpis;
  if (!kpis.medible) return { ok: true, value: { corte, medible: false, items: [] } };

  const alertaRetraso = kpis.financiero?.alerta_retraso ?? false;
  const parametros = await getSemaforoParametrosV2();
  const periodo = periodOf(corte);
  const hasta = new Date(`${corte}T00:00:00.000Z`);
  const inicio = isoDate(input.proyecto.fecha_inicio as Date);
  const proyectoId = input.proyecto.id;

  const [
    actividades,
    avances,
    reportesPorActividad,
    soportes,
    indicadores,
    lineas,
    gastosValidados,
    gastosRegistrados,
    solicitudesPendientes,
  ] = await Promise.all([
      db.actividad.findMany({
        where: { proyecto_id: proyectoId, deleted_at: null },
        orderBy: [{ semana_inicio: "asc" }, { codigo: "asc" }],
        select: {
          id: true,
          codigo: true,
          nombre: true,
          // T12 (S6): a transversal is not schedule progress and must never be listed as overdue.
          tipo: true,
          semana_inicio: true,
          semana_fin: true,
          entregables: { where: { deleted_at: null }, select: { id: true, codigo: true, cantidad_meta: true } },
        },
      }),
      db.avanceEntregable.findMany({
        where: { proyecto_id: proyectoId, anulado_at: null, fecha: { lte: hasta } },
        select: { id: true, entregable_id: true, fecha: true, cantidad: true, created_at: true },
      }),
      // AJ-07: the same reports the technical semáforo reads, so an activity that reported its
      // progress is not listed as overdue with the progress of its deliverables alone.
      cargarReportesPorActividad(proyectoId, corte),
      db.soporteProyecto.groupBy({
        by: ["avance_id"],
        where: { proyecto_id: proyectoId, avance_id: { not: null }, deleted_at: null },
        _count: { _all: true },
      }),
      db.indicador.findMany({
        where: { proyecto_id: proyectoId, deleted_at: null },
        select: {
          id: true,
          nombre: true,
          meta: true,
          mediciones: {
            where: { anulado_at: null, fecha: { lte: hasta } },
            select: { fecha: true, valor: true, created_at: true },
          },
        },
      }),
      db.lineaPresupuestal.findMany({
        where: { proyecto_id: proyectoId },
        select: { rubro_id: true, monto_proyectado_cop: true, rubro: { select: { codigo: true, nombre: true } } },
      }),
      loadGastosEjecutados(proyectoId),
      db.gasto.findMany({
        where: { proyecto_id: proyectoId, estado: "REGISTRADO" },
        select: {
          id: true,
          descripcion: true,
          estado: true,
          alerta_sobregasto: true,
          tercero_tipo_id: true,
          tercero_numero_id: true,
        },
      }),
      input.incluirSolicitudes ? cargarSolicitudesPendientes(proyectoId) : [],
    ]);

  const medios = new Map<string, number>();
  for (const row of soportes) if (row.avance_id) medios.set(row.avance_id, row._count._all);
  const avancesDe = new Map<string, typeof avances>();
  for (const avance of avances) {
    avancesDe.set(avance.entregable_id, [...(avancesDe.get(avance.entregable_id) ?? []), avance]);
  }

  const actividadesInput: AtencionActividadInput[] = actividades.filter(cuentaTecnico).map((actividad) => {
    const fechas = activityDates(inicio, actividad.semana_inicio, actividad.semana_fin);
    return {
      id: actividad.id,
      codigo: actividad.codigo,
      nombre: actividad.nombre,
      peso: pesoActividad(actividad),
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
      reportes: reportesPorActividad.get(actividad.id) ?? [],
    };
  });

  const avancesInput: AtencionAvanceInput[] = avances.map((avance) => ({
    id: avance.id,
    entregable_id: avance.entregable_id,
    fecha: isoDate(avance.fecha),
    tiene_soporte: (medios.get(avance.id) ?? 0) > 0,
  }));

  const indicadoresInput: AtencionIndicadorInput[] = indicadores.map((indicador) => ({
    id: indicador.id,
    nombre: indicador.nombre,
    meta: toNumber(indicador.meta),
    mediciones: indicador.mediciones.map((medicion) => ({
      fecha: isoDate(medicion.fecha),
      valor: toNumber(medicion.valor),
      anulado: false,
      createdAt: medicion.created_at.toISOString(),
    })),
  }));

  const ejecutadoDe = new Map<string, Cents>();
  for (const gasto of gastosValidados.gastos) {
    if (gasto.periodo <= periodo) ejecutadoDe.set(gasto.rubroId, (ejecutadoDe.get(gasto.rubroId) ?? ZERO) + gasto.valor);
  }
  const rubrosInput: AtencionRubroInput[] = lineas.map((linea) => ({
    rubro_id: linea.rubro_id,
    codigo: linea.rubro.codigo,
    nombre: linea.rubro.nombre,
    asignado: toCents(linea.monto_proyectado_cop),
    ejecutado: ejecutadoDe.get(linea.rubro_id) ?? ZERO,
  }));

  const gastosInput: AtencionGastoInput[] = gastosRegistrados.map((gasto) => ({
    id: gasto.id,
    estado: gasto.estado,
    alerta_sobregasto: gasto.alerta_sobregasto,
    datos_incompletos: datosIncompletos(gasto),
    descripcion: gasto.descripcion,
  }));

  const items = construirAtencion({
    corte,
    alerta_retraso: alertaRetraso,
    requiere_medio: parametros.avance_requiere_medio.valor,
    tope: parametros.tope_en_curso.valor / 100,
    actividades: actividadesInput,
    avances: avancesInput,
    indicadores: indicadoresInput,
    rubros: rubrosInput,
    gastos: gastosInput,
    modificaciones: solicitudesPendientes,
  });

  return { ok: true, value: { corte, medible: true, items } };
}
