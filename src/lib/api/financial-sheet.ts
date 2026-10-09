// GET /api/v1/projects/:id/financial-sheet?corte=AAAA-MM&base=vigente — financial ficha (S5 U4, E-18).
//
// Per rubro and total row: A (assigned), P (programmed up to the corte), E
// (validated expenses up to the corte), D = E - P, E/P, E/A, the red threshold
// and the financial color, all through the pure `computeFicha`. E comes from the
// VALIDADO expenses (`loadGastosValidados` seam, S6); while `ejecucion_disponible`
// is false (a BORRADOR project has not started executing) E is $0 and no color,
// percentage or alert is produced. The delay alert lives on
// the total row and reads the same technical color as `technical-status`.
// `base=vigente` (default) reads the live budget; `base=original` the A and P frozen in version 0
// with the same live E (S8); its periods come from the v0 dates and the delay alert still reads
// the vigente technical color. Aggregates only: no per-gasto or support data (P04). Readable in any estado by
// whoever can read the project (404 -> 403 -> 409 -> 400).

// The financial ficha of a project (S5 U4, E-18), shared by `GET projects/:id/financial-sheet` and the
// S9 export so both answer the very same numbers: per rubro and total row A / P / E / D, E/P, E/A, the
// red threshold and the financial color through the pure `computeFicha`; `base=original` reads the A and P
// frozen in version 0 with the same live E (S8). Aggregates only: no per-gasto or support data (P04).

import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { compareRubros } from "@/lib/api/presupuesto";
import { loadGastosValidados } from "@/lib/api/financiera";
import { loadTecnicoStatus } from "@/lib/api/tecnico";
import { BASE_INVALIDA_MESSAGE, BASE_ORIGINAL_MESSAGE, resolverBase } from "@/lib/api/versiones";
import { getSemaforoParametrosV2 } from "@/lib/settings";
import { computeFicha, type FichaRow, type FichaRubroInput } from "@/lib/proyectos/ficha-financiera";
import { fromCents, toCents } from "@/lib/proyectos/money";
import { alertaRetraso, toleranciaBp } from "@/lib/proyectos/semaforo-v2";
import { isoDate } from "@/lib/proyectos/proyecto-general";
import type { SnapshotV1 } from "@/lib/proyectos/versiones";
import { periodOf, projectPeriods, todayInBogota, type IsoDate } from "@/lib/proyectos/weeks";

export const SIN_FECHAS_MESSAGE = "El proyecto aún no tiene fechas de inicio y fin.";
export const CORTE_INVALIDO_MESSAGE = "El corte no es válido. Usa el formato AAAA-MM dentro del rango del proyecto.";
export { BASE_INVALIDA_MESSAGE, BASE_ORIGINAL_MESSAGE };

/** Last calendar day of a `AAAA-MM` period. */
function lastDayOf(periodo: string): IsoDate {
  const year = Number(periodo.slice(0, 4));
  const month = Number(periodo.slice(5, 7));
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${periodo}-${String(day).padStart(2, "0")}`;
}

function serializeRow(row: FichaRow, disponible: boolean) {
  return {
    rubro_id: row.rubroId,
    codigo: row.codigo,
    nombre: row.nombre,
    asignado: fromCents(row.asignado),
    programado: fromCents(row.programado),
    ejecutado: fromCents(row.ejecutado),
    diferencia: fromCents(row.diferencia),
    ep_decimas: disponible && row.epTenths !== null ? Number(row.epTenths) : null,
    ea_decimas: disponible && row.eaTenths !== null ? Number(row.eaTenths) : null,
    umbral_rojo: fromCents(row.umbralRojo),
    color: disponible ? row.color : null,
  };
}

type LineaViva = {
  rubro_id: string;
  rubro: { codigo: string | null; nombre: string; orden: number; activo: boolean };
};

/**
 * A and P of the frozen v0 per rubro, E from the live validated expenses. The rubros of the vigente
 * that v0 never had get a zero row (their E still shows); a v0 rubro without a live line (it cannot
 * happen after a baseline: lines are never deleted) gets a synthetic id and no expenses.
 */
function rubrosDelOriginal(
  original: SnapshotV1,
  lineas: readonly LineaViva[],
  gastosDe: (rubroId: string) => FichaRubroInput["gastos"],
): FichaRubroInput[] {
  const vivas = new Map(lineas.filter((l) => l.rubro.codigo !== null).map((l) => [l.rubro.codigo as string, l]));
  const codigos = [...new Set([...original.presupuesto.map((r) => r.rubro_codigo), ...vivas.keys()])];
  const filas = codigos.map((codigo) => {
    const viva = vivas.get(codigo);
    const congelada = original.presupuesto.find((r) => r.rubro_codigo === codigo);
    return {
      orden: { id: viva?.rubro_id ?? `v0:${codigo}`, codigo, nombre: viva?.rubro.nombre ?? congelada?.rubro_nombre ?? codigo, orden: viva?.rubro.orden ?? 9999, activo: viva?.rubro.activo ?? true },
      congelada,
    };
  });
  return filas
    .sort((a, b) => compareRubros(a.orden, b.orden))
    .map(({ orden, congelada }) => ({
      rubroId: orden.id,
      codigo: orden.codigo,
      nombre: orden.nombre,
      asignado: toCents(congelada?.asignado ?? "0"),
      programacion: original.programacion
        .filter((celda) => celda.rubro_codigo === orden.codigo)
        .map((celda) => ({ periodo: celda.periodo, valor: toCents(celda.valor) })),
      gastos: gastosDe(orden.id),
    }));
}


export type FinancialSheetInput = {
  id: string;
  estado: string;
  fecha_inicio: Date | null;
  fecha_fin: Date | null;
  /** Raw `?base` and `?corte` query values (null when absent). */
  baseParam: string | null;
  corteParam: string | null;
};

export type FichaRowJson = ReturnType<typeof serializeRow>;

export type FinancialSheet = {
  base: "vigente" | "original";
  corte: string;
  estado: string;
  ejecucion_disponible: boolean;
  rubros: FichaRowJson[];
  total: FichaRowJson;
  alerta_retraso: boolean;
  parametros: { tolerancia: number; retraso: number; confirmado: boolean };
};

/** 409 (no dates) -> 400 (base, corte) -> the ficha. The caller has already passed 404 and 403. */
export async function calcularFichaFinanciera(
  input: FinancialSheetInput,
): Promise<{ ok: true; value: FinancialSheet } | { ok: false; response: Response }> {
  const { id, estado, fecha_inicio, fecha_fin } = input;
  if (!fecha_inicio || !fecha_fin) return { ok: false, response: apiError(SIN_FECHAS_MESSAGE, 409, "INVALID_STATE") };

  const base = await resolverBase(id, input.baseParam);
  if (!base.ok) return { ok: false, response: base.response };
  const original = base.value.base === "original" ? base.value.snapshot : null;

  let periodos: string[];
  try {
    periodos = original
      ? projectPeriods(original.proyecto.fecha_inicio, original.proyecto.fecha_fin)
      : projectPeriods(isoDate(fecha_inicio), isoDate(fecha_fin));
  } catch {
    return { ok: false, response: apiError(SIN_FECHAS_MESSAGE, 409, "INVALID_STATE") };
  }
  const hoy = todayInBogota();
  const raw = input.corteParam;
  let corte: string;
  if (raw === null || raw === "") {
    const actual = periodOf(hoy);
    corte = actual < periodos[0] ? periodos[0] : actual > periodos[periodos.length - 1] ? periodos[periodos.length - 1] : actual;
  } else if (periodos.includes(raw)) {
    corte = raw;
  } else {
    return { ok: false, response: apiError(CORTE_INVALIDO_MESSAGE, 400, "VALIDATION_ERROR") };
  }

  const [lineas, celdas, origen, parametros] = await Promise.all([
    db.lineaPresupuestal.findMany({
      where: { proyecto_id: id },
      select: {
        id: true,
        rubro_id: true,
        monto_proyectado_cop: true,
        rubro: { select: { codigo: true, nombre: true, orden: true, activo: true } },
      },
    }),
    db.programacionPeriodo.findMany({
      where: { proyecto_id: id },
      select: { id: true, linea_id: true, periodo: true, valor: true },
    }),
    loadGastosValidados(id),
    getSemaforoParametrosV2(),
  ]);

  // A BORRADOR project has nothing executed yet: no E and no color, whatever the source says.
  const fuente = { ...origen, disponible: origen.disponible && estado !== "BORRADOR" };

  const gastosDe = (rubroId: string) => (fuente.disponible ? fuente.gastos.filter((gasto) => gasto.rubroId === rubroId) : []);
  const rubros: FichaRubroInput[] = original
    ? rubrosDelOriginal(original, lineas, gastosDe)
    : [...lineas]
        .sort((a, b) => compareRubros({ id: a.rubro_id, ...a.rubro }, { id: b.rubro_id, ...b.rubro }))
        .map((linea) => ({
          rubroId: linea.rubro_id,
          codigo: linea.rubro.codigo,
          nombre: linea.rubro.nombre,
          asignado: toCents(linea.monto_proyectado_cop),
          programacion: celdas
            .filter((celda) => celda.linea_id === linea.id)
            .map((celda) => ({ periodo: celda.periodo, valor: toCents(celda.valor) })),
          gastos: gastosDe(linea.rubro_id),
        }));

  const tolerancia = toleranciaBp(parametros.tolerancia);
  const ficha = computeFicha({ rubros, corte, toleranciaBp: tolerancia });

  let alerta = false;
  if (fuente.disponible) {
    // Technical date of a monthly corte: end of that month, never in the future.
    const fin = lastDayOf(corte);
    const tecnico = await loadTecnicoStatus({
      proyectoId: id,
      fechaInicio: fecha_inicio,
      corte: fin < hoy ? fin : hoy,
      parametros,
    });
    alerta = alertaRetraso({ epTenths: ficha.total.epTenths, colorTecnico: tecnico.color }, parametros.retraso.valor);
  }

  return {
    ok: true,
    value: {
      base: base.value.base,
      corte,
      estado,
      ejecucion_disponible: fuente.disponible,
      rubros: ficha.rubros.map((row) => serializeRow(row, fuente.disponible)),
      total: serializeRow(ficha.total, fuente.disponible),
      alerta_retraso: alerta,
      parametros: {
        tolerancia: parametros.tolerancia.valor,
        retraso: parametros.retraso.valor,
        confirmado: parametros.tolerancia.confirmado && parametros.retraso.confirmado,
      },
    },
  };
}
