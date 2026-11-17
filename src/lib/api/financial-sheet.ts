// GET /api/v1/projects/:id/financial-sheet?corte=AAAA-MM&base=vigente — financial ficha (S5 U4, E-18).
//
// Per rubro and total row: A (assigned), P (programmed up to the corte), E
// (validated expenses up to the corte), D = E - P, E/P, E/A, the red threshold
// and the financial color, all through the pure `computeFicha`. E comes from the
// VALIDADO expenses (`loadGastosEjecutados` seam, S6); while `ejecucion_disponible`
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
// S10 (EV-06): the same sheet answers per activity too, in a new `actividades` field next to the per-rubro
// rows. Each activity (and the «Sin actividad» row of D4) is one call to the same `computeFicha` over the
// budget lines of that activity, so A, P, E, the threshold and the color follow the very same rules and the
// executed total of both views is the same rows added up. Transversal activities carry no objective and are
// grouped under «Gestión del proyecto», like the lines that have no activity at all.
// S11 (EV-07/T14.5-B): each activity row also carries its closure (`cerrada`, `cerrada_at`, `nota_cierre`) and,
// once the Gestor closed it, `ahorro` = max(A − E, 0) or `sobreejecucion` = max(E − A, 0). Neither is stored:
// they are read from `Actividad` and the executed amount, so a later correction cannot leave them stale.

import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { compareRubros } from "@/lib/api/presupuesto";
import { loadGastosEjecutados } from "@/lib/api/financiera";
import { loadTecnicoStatus } from "@/lib/api/tecnico";
import { BASE_INVALIDA_MESSAGE, BASE_ORIGINAL_MESSAGE, resolverBase } from "@/lib/api/versiones";
import { getSemaforoParametrosV2 } from "@/lib/settings";
import { cuentaTecnico, type TipoActividad } from "@/lib/proyectos/actividad";
import { computeFicha, type Ficha, type FichaRow, type FichaRubroInput } from "@/lib/proyectos/ficha-financiera";
import { fromCents, toCents } from "@/lib/proyectos/money";
import { alertaRetraso, toleranciaBp } from "@/lib/proyectos/semaforo-v2";
import { isoDate } from "@/lib/proyectos/proyecto-general";
import type { SnapshotV1 } from "@/lib/proyectos/versiones";
import { periodOf, projectPeriods, todayInBogota, type IsoDate, type Periodo } from "@/lib/proyectos/weeks";

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

export function serializeRow(row: FichaRow, disponible: boolean) {
  return {
    rubro_id: row.rubroId,
    codigo: row.codigo,
    nombre: row.nombre,
    ...serializeMoney(row, disponible),
  };
}

/** A / P / E / D, the percentages, the threshold and the color: the numbers shared by both rows. */
function serializeMoney(row: FichaRow, disponible: boolean) {
  return {
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

/** La actividad de la línea presupuestal, tal como la vista «Por actividad» la necesita (S10). */
type ActividadDeLinea = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: TipoActividad;
  objetivo: { id: string; codigo: string; orden: number } | null;
  /** S11/T14.5-B: el cierre de los gastos de la actividad (nulo = abiertos). */
  gastos_cerrados_at: Date | null;
  gastos_cerrados_nota: string | null;
};

/** Una línea del presupuesto con su actividad: la unidad de la que salen las dos vistas. */
type LineaConActividad = LineaViva & {
  id: string;
  actividad_id: string | null;
  actividad: ActividadDeLinea | null;
};

/** D4: la fila de las líneas cargadas antes de la Parte 2, que no tienen actividad. */
const SIN_ACTIVIDAD = "Sin actividad";

/** Una fila de `actividades`: la actividad y sus números, con lo que la UI necesita para agrupar. */
type GrupoActividad = {
  actividadId: string | null;
  codigo: string | null;
  nombre: string;
  /** Null en «Gestión del proyecto»: una transversal no lleva objetivo (S6/T12). */
  objetivo: { id: string; codigo: string; orden: number } | null;
  /** True en «Gestión del proyecto»: una actividad TRANSVERSAL o la fila «Sin actividad». */
  gestion: boolean;
  /** S11/T14.5-B: el cierre de la actividad; ambos nulos mientras los gastos están abiertos. */
  cierre: { at: Date | null; nota: string | null };
};

function compararCodigos(a: string, b: string): number {
  return a.localeCompare(b, "es", { numeric: true });
}

/** Objectives in their order, «Gestión del proyecto» last and «Sin actividad» at the end of its group. */
function compararGrupos(a: GrupoActividad, b: GrupoActividad): number {
  if (a.gestion !== b.gestion) return a.gestion ? 1 : -1;
  if (a.objetivo && b.objetivo) {
    const porObjetivo = a.objetivo.orden - b.objetivo.orden || compararCodigos(a.objetivo.codigo, b.objetivo.codigo);
    if (porObjetivo !== 0) return porObjetivo;
  }
  if (a.codigo === null || b.codigo === null) return a.codigo === null ? (b.codigo === null ? 0 : 1) : -1;
  return compararCodigos(a.codigo, b.codigo);
}

/** One row per activity — and one for the lines without activity — in a deterministic order. */
function gruposDeActividad(lineas: readonly LineaConActividad[]): GrupoActividad[] {
  const grupos = new Map<string, GrupoActividad>();
  for (const linea of lineas) {
    const clave = linea.actividad_id ?? "";
    if (grupos.has(clave)) continue;
    const actividad = linea.actividad;
    // S6/T12: una transversal se agrupa en «Gestión del proyecto» y no lleva objetivo.
    const gestion = actividad === null || !cuentaTecnico(actividad);
    grupos.set(clave, {
      actividadId: actividad?.id ?? null,
      codigo: actividad?.codigo ?? null,
      nombre: actividad?.nombre ?? SIN_ACTIVIDAD,
      objetivo: actividad !== null && !gestion ? actividad.objetivo : null,
      gestion,
      // D4: la fila «Sin actividad» no tiene actividad que cerrar, así que nunca lleva cierre.
      cierre: { at: actividad?.gastos_cerrados_at ?? null, nota: actividad?.gastos_cerrados_nota ?? null },
    });
  }
  return [...grupos.values()].sort(compararGrupos);
}

/**
 * S10: the per-activity rows. Each group runs the same `computeFicha` as the per-rubro view over the REAL
 * rubro inputs of its lines, so the activity's own numbers are that ficha's `total` and its children are
 * the actual rubro rows: no merged row, no formula or threshold of its own, and the drill-down «al abrir
 * una actividad se ve el detalle por rubro» comes out of the same call. `base=original` only changes
 * `rubros`/`total`: the frozen v0 does not say which line a peso came from, so the activity view always
 * reads the live (vigente) budget with the same live E.
 */
function filasPorActividad(
  porLinea: readonly { linea: LineaConActividad; input: FichaRubroInput }[],
  corte: Periodo,
  tolerancia: bigint,
): { grupo: GrupoActividad; fila: Ficha }[] {
  return gruposDeActividad(porLinea.map((entrada) => entrada.linea)).map((grupo) => ({
    grupo,
    fila: computeFicha({
      rubros: porLinea
        .filter((entrada) => (entrada.linea.actividad_id ?? null) === grupo.actividadId)
        .map((entrada) => entrada.input),
      corte,
      toleranciaBp: tolerancia,
    }),
  }));
}

function serializeActividadRow(grupo: GrupoActividad, fila: Ficha, disponible: boolean) {
  const saldo = fila.total.asignado - fila.total.ejecutado;
  const cerrada = grupo.cierre.at !== null;
  return {
    actividad_id: grupo.actividadId,
    codigo: grupo.codigo,
    nombre: grupo.nombre,
    objetivo_id: grupo.objetivo?.id ?? null,
    objetivo_codigo: grupo.objetivo?.codigo ?? null,
    gestion: grupo.gestion,
    // El total de la misma `computeFicha`: las mismas fórmulas aplicadas a las sumas de los hijos.
    ...serializeMoney(fila.total, disponible),
    /** Asignado − ejecutado. Mientras los gastos están abiertos es el saldo (S11); cerrada, la referencia. */
    saldo: fromCents(saldo),
    /** S11/T14.5-B: el cierre se LEE de la actividad; la hoja no guarda ningún monto de ahorro. */
    cerrada,
    cerrada_at: grupo.cierre.at === null ? null : grupo.cierre.at.toISOString(),
    nota_cierre: grupo.cierre.nota,
    /** A − E cuando sobró: `max(A − E, 0)`, y solo con los gastos cerrados. Null mientras están abiertos. */
    ahorro: cerrada ? fromCents(saldo > BigInt(0) ? saldo : BigInt(0)) : null,
    /** E − A cuando se gastó de más: `max(E − A, 0)`, y solo con los gastos cerrados. Null mientras están abiertos. */
    sobreejecucion: cerrada ? fromCents(saldo < BigInt(0) ? -saldo : BigInt(0)) : null,
    /** S10: el detalle por rubro que se abre al elegir la actividad, con la forma del nivel superior. */
    rubros: fila.rubros.map((row) => serializeRow(row, disponible)),
  };
}

type FichaActividadJson = ReturnType<typeof serializeActividadRow>;

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


/**
 * EV-06: «El valor de cada rubro es la suma de ese rubro en todas las actividades». The vigente budget comes
 * one entry per line (activity + rubro); the rubro view merges the lines of a rubro into one row, keeping the
 * order of the first line. Each expense still belongs to exactly one line, so nothing is counted twice.
 */
function sumarPorRubro(lineas: readonly FichaRubroInput[]): FichaRubroInput[] {
  const porRubro = new Map<string, FichaRubroInput>()
  for (const linea of lineas) {
    const previa = porRubro.get(linea.rubroId)
    porRubro.set(
      linea.rubroId,
      previa
        ? {
            ...previa,
            asignado: previa.asignado + linea.asignado,
            programacion: [...previa.programacion, ...linea.programacion],
            gastos: [...previa.gastos, ...linea.gastos],
          }
        : linea,
    )
  }
  return [...porRubro.values()]
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

type FichaRowJson = ReturnType<typeof serializeRow>;

export type FinancialSheet = {
  base: "vigente" | "original";
  corte: string;
  estado: string;
  ejecucion_disponible: boolean;
  rubros: FichaRowJson[];
  total: FichaRowJson;
  /** S10: una fila por actividad (y una «Sin actividad»), agrupables por objetivo y «Gestión del proyecto». */
  actividades: FichaActividadJson[];
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
        // S10: la actividad de la línea, para agrupar la vista «Por actividad» sin otra consulta.
        actividad_id: true,
        monto_proyectado_cop: true,
        rubro: { select: { codigo: true, nombre: true, orden: true, activo: true } },
        actividad: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
            tipo: true,
            objetivo: { select: { id: true, codigo: true, orden: true } },
            // S11/T14.5-B: la hoja publica el cierre de cada actividad; no hay otra consulta ni un campo nuevo.
            gastos_cerrados_at: true,
            gastos_cerrados_nota: true,
          },
        },
      },
    }),
    db.programacionPeriodo.findMany({
      where: { proyecto_id: id },
      select: { id: true, linea_id: true, periodo: true, valor: true },
    }),
    loadGastosEjecutados(id),
    getSemaforoParametrosV2(),
  ]);

  // A BORRADOR project has nothing executed yet: no E and no color, whatever the source says.
  const fuente = { ...origen, disponible: origen.disponible && estado !== "BORRADOR" };

  // La base original se indexa por rubro (es un snapshot histórico con una fila por código); la
  // vigente se indexa por línea, que es lo único que impide duplicar el ejecutado cuando un rubro
  // tiene varias (S5/T10).
  const gastosDe = (rubroId: string) => (fuente.disponible ? fuente.gastos.filter((gasto) => gasto.rubroId === rubroId) : []);
  const gastosDeLinea = (lineaId: string) =>
    fuente.disponible ? fuente.gastos.filter((gasto) => gasto.lineaId === lineaId) : [];

  // Una entrada por línea: la vista por rubro las suma por rubro (EV-06) y la vista por actividad las agrupa
  // por la actividad de la línea. Las dos parten de las mismas filas de gastos, así que su E total coincide.
  const porLinea = [...lineas]
    .sort((a, b) => compareRubros({ id: a.rubro_id, ...a.rubro }, { id: b.rubro_id, ...b.rubro }))
    .map((linea) => ({
      linea,
      input: {
        rubroId: linea.rubro_id,
        codigo: linea.rubro.codigo,
        nombre: linea.rubro.nombre,
        asignado: toCents(linea.monto_proyectado_cop),
        programacion: celdas
          .filter((celda) => celda.linea_id === linea.id)
          .map((celda) => ({ periodo: celda.periodo, valor: toCents(celda.valor) })),
        gastos: gastosDeLinea(linea.id),
      } satisfies FichaRubroInput,
    }));
  const rubros: FichaRubroInput[] = original
    ? rubrosDelOriginal(original, lineas, gastosDe)
    : sumarPorRubro(porLinea.map((entrada) => entrada.input));

  const tolerancia = toleranciaBp(parametros.tolerancia);
  const ficha = computeFicha({ rubros, corte, toleranciaBp: tolerancia });
  const actividades = filasPorActividad(porLinea, corte, tolerancia).map(({ grupo, fila }) =>
    serializeActividadRow(grupo, fila, fuente.disponible),
  );

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
      actividades,
      alerta_retraso: alerta,
      parametros: {
        tolerancia: parametros.tolerancia.valor,
        retraso: parametros.retraso.valor,
        confirmado: parametros.tolerancia.confirmado && parametros.retraso.confirmado,
      },
    },
  };
}
