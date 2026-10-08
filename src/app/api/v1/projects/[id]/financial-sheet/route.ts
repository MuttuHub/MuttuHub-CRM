// GET /api/v1/projects/:id/financial-sheet?corte=AAAA-MM&base=vigente — financial ficha (S5 U4, E-18).
//
// Per rubro and total row: A (assigned), P (programmed up to the corte), E
// (validated expenses up to the corte), D = E - P, E/P, E/A, the red threshold
// and the financial color, all through the pure `computeFicha`. E has no source
// until S6 (`loadGastosValidados` seam): while `ejecucion_disponible` is false E
// is $0 and no color, percentage or alert is produced. The delay alert lives on
// the total row and reads the same technical color as `technical-status`.
// Aggregates only: no per-gasto or support data (P04). Readable in any estado by
// whoever can read the project (404 -> 403 -> 409 -> 400).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { compareRubros, gatePresupuestoRead } from "@/lib/api/presupuesto";
import { loadGastosValidados } from "@/lib/api/financiera";
import { loadTecnicoStatus } from "@/lib/api/tecnico";
import { getSemaforoParametrosV2 } from "@/lib/settings";
import { computeFicha, type FichaRow, type FichaRubroInput } from "@/lib/proyectos/ficha-financiera";
import { fromCents, toCents } from "@/lib/proyectos/money";
import { alertaRetraso, toleranciaBp } from "@/lib/proyectos/semaforo-v2";
import { isoDate } from "@/lib/proyectos/proyecto-general";
import { periodOf, projectPeriods, todayInBogota, type IsoDate } from "@/lib/proyectos/weeks";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const SIN_FECHAS_MESSAGE = "El proyecto aún no tiene fechas de inicio y fin.";
export const CORTE_INVALIDO_MESSAGE = "El corte no es válido. Usa el formato AAAA-MM dentro del rango del proyecto.";
export const BASE_ORIGINAL_MESSAGE = "La versión original aún no existe.";
export const BASE_INVALIDA_MESSAGE = "La base no es válida. Usa vigente u original.";

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

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos calcular la ficha financiera. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gatePresupuestoRead(auth.usuario, id);
    if (!gate.ok) return gate.response;
    const { estado, fecha_inicio, fecha_fin } = gate.value;
    if (!fecha_inicio || !fecha_fin) return apiError(SIN_FECHAS_MESSAGE, 409, "INVALID_STATE");

    const params = new URL(request.url).searchParams;
    const base = params.get("base") ?? "vigente";
    if (base === "original") return apiError(BASE_ORIGINAL_MESSAGE, 409, "INVALID_STATE");
    if (base !== "vigente") return apiError(BASE_INVALIDA_MESSAGE, 400, "VALIDATION_ERROR");

    let periodos: string[];
    try {
      periodos = projectPeriods(isoDate(fecha_inicio), isoDate(fecha_fin));
    } catch {
      return apiError(SIN_FECHAS_MESSAGE, 409, "INVALID_STATE");
    }
    const hoy = todayInBogota();
    const raw = params.get("corte");
    let corte: string;
    if (raw === null || raw === "") {
      const actual = periodOf(hoy);
      corte = actual < periodos[0] ? periodos[0] : actual > periodos[periodos.length - 1] ? periodos[periodos.length - 1] : actual;
    } else if (periodos.includes(raw)) {
      corte = raw;
    } else {
      return apiError(CORTE_INVALIDO_MESSAGE, 400, "VALIDATION_ERROR");
    }

    const [lineas, celdas, fuente, parametros] = await Promise.all([
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

    const ordenadas = [...lineas].sort((a, b) =>
      compareRubros({ id: a.rubro_id, ...a.rubro }, { id: b.rubro_id, ...b.rubro }),
    );
    const rubros: FichaRubroInput[] = ordenadas.map((linea) => ({
      rubroId: linea.rubro_id,
      codigo: linea.rubro.codigo,
      nombre: linea.rubro.nombre,
      asignado: toCents(linea.monto_proyectado_cop),
      programacion: celdas
        .filter((celda) => celda.linea_id === linea.id)
        .map((celda) => ({ periodo: celda.periodo, valor: toCents(celda.valor) })),
      gastos: fuente.disponible ? fuente.gastos.filter((gasto) => gasto.rubroId === linea.rubro_id) : [],
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

    return NextResponse.json({
      base: "vigente",
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
    });
  },
);
