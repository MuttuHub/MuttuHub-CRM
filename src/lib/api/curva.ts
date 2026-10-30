// Source of the S-curve behind `GET /api/v1/projects/:id/curve?base=vigente|original` (S14 P7).
//
// TWO curves that never mix: the technical one (planned linear by days at month end, D1, and at the
// corte date for the corte month, D13; executed = real progress measured at each period) and the
// financial one (planned =
// cumulative programmed / assigned, executed = cumulative validated / assigned). Every
// non-voided avance up to the corte is read once and bucketed per month in memory, so one
// read feeds the whole timeline. `base=vigente` (default) reads the live structure and
// budget; `base=original` the weeks, weights and A/P frozen in version 0, with the same
// live avances and expenses. Readable in any estado by whoever can read the project
// (404 -> 403 -> 409 -> 400).

import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { contarMediosVivos } from "@/lib/api/ejecucion";
import { loadGastosValidados } from "@/lib/api/financiera";
import {
  agruparAvancesPorEntregable,
  desdeSnapshot,
  entradaTecnica,
  mapearActividadesFuente,
  type ActividadFuente,
} from "@/lib/api/tecnico";
import { resolverBase } from "@/lib/api/versiones";
import { getSemaforoParametrosV2 } from "@/lib/settings";
import { calcularTecnico } from "@/lib/proyectos/avance";
import {
  acumular,
  construirCurva,
  fechaMedicion,
  tecnicoPlaneado,
  type CurvaPunto,
} from "@/lib/proyectos/curva";
import { sumCents, toCents, type Cents } from "@/lib/proyectos/money";
import { isoDate } from "@/lib/proyectos/proyecto-general";
import { periodOf, projectPeriods, todayInBogota, type Periodo } from "@/lib/proyectos/weeks";

export const SIN_FECHAS_MESSAGE = "El proyecto aún no tiene fechas de inicio y fin.";
export { BASE_INVALIDA_MESSAGE, BASE_ORIGINAL_MESSAGE } from "@/lib/api/versiones";

const ZERO: Cents = BigInt(0);

export type Curva = {
  base: "vigente" | "original";
  corte: Periodo;
  periodos: CurvaPunto[];
};

export type CurvaInput = {
  id: string;
  fecha_inicio: Date | null;
  fecha_fin: Date | null;
  /** Raw `?base` query value (null when absent). */
  baseParam: string | null;
};

/** 409 (no dates) -> 400 (base) -> the curve. The caller has already passed 404 and 403. */
export async function calcularCurva(
  input: CurvaInput,
): Promise<{ ok: true; value: Curva } | { ok: false; response: Response }> {
  const { id } = input;
  if (!input.fecha_inicio || !input.fecha_fin) {
    return { ok: false, response: apiError(SIN_FECHAS_MESSAGE, 409, "INVALID_STATE") };
  }

  const base = await resolverBase(id, input.baseParam);
  if (!base.ok) return base;
  const original = base.value.base === "original" ? base.value.snapshot : null;

  let periodos: Periodo[];
  try {
    periodos = original
      ? projectPeriods(original.proyecto.fecha_inicio, original.proyecto.fecha_fin)
      : projectPeriods(isoDate(input.fecha_inicio), isoDate(input.fecha_fin));
  } catch {
    return { ok: false, response: apiError(SIN_FECHAS_MESSAGE, 409, "INVALID_STATE") };
  }

  const hoy = todayInBogota();
  const actual = periodOf(hoy);
  const corte =
    actual < periodos[0] ? periodos[0] : actual > periodos[periodos.length - 1] ? periodos[periodos.length - 1] : actual;
  const corteFecha = fechaMedicion(corte, hoy);
  const inicio = original ? original.proyecto.fecha_inicio : isoDate(input.fecha_inicio);

  const [actividades, avances, lineas, celdas, gastos, parametros] = await Promise.all([
    db.actividad.findMany({
      where: { proyecto_id: id, deleted_at: null },
      orderBy: [{ semana_inicio: "asc" }, { codigo: "asc" }],
      select: {
        id: true,
        codigo: true,
        nombre: true,
        semana_inicio: true,
        semana_fin: true,
        objetivo: { select: { codigo: true } },
        entregables: { where: { deleted_at: null }, select: { id: true, codigo: true, cantidad_meta: true } },
      },
    }),
    // The whole timeline up to the corte: the per-month split happens in memory.
    db.avanceEntregable.findMany({
      where: { proyecto_id: id, anulado_at: null, fecha: { lte: new Date(`${corteFecha}T00:00:00.000Z`) } },
      select: { id: true, entregable_id: true, fecha: true, cantidad: true, created_at: true },
    }),
    db.lineaPresupuestal.findMany({
      where: { proyecto_id: id },
      select: { id: true, monto_proyectado_cop: true },
    }),
    db.programacionPeriodo.findMany({
      where: { proyecto_id: id },
      select: { linea_id: true, periodo: true, valor: true },
    }),
    loadGastosValidados(id),
    getSemaforoParametrosV2(),
  ]);

  const medios = await contarMediosVivos(avances.map((avance) => avance.id));
  const porEntregable = agruparAvancesPorEntregable(avances);
  const vivas = mapearActividadesFuente(actividades);
  const fuente: ActividadFuente[] = original ? desdeSnapshot(original, vivas) : vivas;
  const entrada = entradaTecnica(fuente, inicio, porEntregable, medios);

  // Technical executed: the real progress at each period's measurement date.
  const requiereMedio = parametros.avance_requiere_medio.valor;
  const tope = parametros.tope_en_curso.valor / 100;
  const tecnicoEjecutado = periodos.map((periodo) => {
    const fecha = fechaMedicion(periodo, corteFecha);
    const hasta = entrada.map((actividad) => ({
      ...actividad,
      entregables: actividad.entregables.map((entregable) => ({
        ...entregable,
        avances: entregable.avances.filter((avance) => avance.fecha <= fecha),
      })),
    }));
    return calcularTecnico({ corte: fecha, requiereMedio, tope, actividades: hasta }).avance_real;
  });

  // Financial curve: cumulative programmed (A base) and validated (E) per period.
  const asignado = original
    ? sumCents(original.presupuesto.map((rubro) => toCents(rubro.asignado)))
    : sumCents(lineas.map((linea) => toCents(linea.monto_proyectado_cop)));

  const programadoPorPeriodo = new Map<Periodo, Cents>();
  const celdasFuente = original
    ? original.programacion.map((celda) => ({ periodo: celda.periodo, valor: celda.valor }))
    : celdas;
  for (const celda of celdasFuente) {
    programadoPorPeriodo.set(celda.periodo, (programadoPorPeriodo.get(celda.periodo) ?? ZERO) + toCents(celda.valor));
  }
  const ejecutadoPorPeriodo = new Map<Periodo, Cents>();
  for (const gasto of gastos.gastos) {
    ejecutadoPorPeriodo.set(gasto.periodo, (ejecutadoPorPeriodo.get(gasto.periodo) ?? ZERO) + gasto.valor);
  }

  const total = Number(asignado);
  const fraccion = (valores: readonly number[]) =>
    total > 0 ? valores.map((valor) => valor / total) : valores.map(() => 0);
  const programadoCum = acumular(periodos.map((periodo) => Number(programadoPorPeriodo.get(periodo) ?? ZERO)));
  const ejecutadoCum = acumular(periodos.map((periodo) => Number(ejecutadoPorPeriodo.get(periodo) ?? ZERO)));

  return {
    ok: true,
    value: {
      base: base.value.base,
      corte,
      periodos: construirCurva({
        periodos,
        corte,
        tecnico: { planeado: tecnicoPlaneado(entrada, periodos, tope, { periodo: corte, fecha: corteFecha }), ejecutado: tecnicoEjecutado },
        financiero: { planeado: fraccion(programadoCum), ejecutado: fraccion(ejecutadoCum) },
      }),
    },
  };
}
