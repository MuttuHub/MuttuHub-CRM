// Shared plumbing of the S5 budget and programming routes, mounted under
// /api/v1/projects/:id/ (budget, programming).
//
// Same order as every v2 write: project (404) -> permission (403) -> estado (409)
// -> body (400). The BORRADOR check is repeated under a row lock inside the write
// transaction, so a baseline approval racing with an edit cannot slip a change in.

import { Prisma, type Usuario } from "@prisma/client";
import { apiError, RespuestaAbortada } from "@/lib/api/errors";
import { canEditProjectData } from "@/lib/permissions";
import { canReadProject, loadProjectScoped, projectReadActor } from "@/lib/api/projects";
import type { GateResult } from "@/lib/api/estructura";
import { fromCents, sumCents, toCents, type Cents } from "@/lib/proyectos/money";

const PRESUPUESTO_FORBIDDEN_MESSAGE = "No tienes permisos sobre este proyecto.";
const PRESUPUESTO_STATE_MESSAGE =
  "Solo se puede editar el presupuesto y la programación de un proyecto en Borrador.";
export const PROYECTO_NO_EXISTE = "El proyecto no existe.";

/** Largest amount a `Decimal(15,2)` column holds, in cents. */
export const MONTO_MAXIMO_CENTS = toCents("9999999999999.99");

export type PresupuestoProyecto = {
  id: string;
  estado: string;
  valor_total: Prisma.Decimal | null;
  fecha_inicio: Date | null;
  fecha_fin: Date | null;
};

const PRESUPUESTO_SELECT = {
  id: true,
  estado: true,
  valor_total: true,
  fecha_inicio: true,
  fecha_fin: true,
} as const;

/** 404 -> 403 -> 409 for a budget/programming write. */
export async function gatePresupuestoWrite(
  usuario: Usuario,
  proyectoId: string,
): Promise<GateResult<PresupuestoProyecto & { oportunidad: { valor_estimado_cop: Prisma.Decimal | null } | null }>> {
  const scoped = await loadProjectScoped(usuario, proyectoId, {
    ...PRESUPUESTO_SELECT,
    oportunidad: { select: { valor_estimado_cop: true } },
  });
  if (!scoped) return { ok: false, response: apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND") };
  // S5: the budget is part of the structure, so the team writes it.
  if (!canEditProjectData(projectReadActor(usuario, scoped.es_miembro))) {
    return { ok: false, response: apiError(PRESUPUESTO_FORBIDDEN_MESSAGE, 403, "FORBIDDEN") };
  }
  const proyecto = scoped.row;
  if (proyecto.estado !== "BORRADOR") {
    return { ok: false, response: apiError(PRESUPUESTO_STATE_MESSAGE, 409, "INVALID_STATE") };
  }
  return { ok: true, value: proyecto };
}

/** 404 -> 403 for a read, with the membership-aware scope. */
export async function gatePresupuestoRead(
  usuario: Usuario,
  proyectoId: string,
): Promise<GateResult<PresupuestoProyecto>> {
  const scoped = await loadProjectScoped(usuario, proyectoId, PRESUPUESTO_SELECT);
  if (!scoped) return { ok: false, response: apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND") };
  if (!canReadProject(usuario, scoped.es_miembro)) {
    return { ok: false, response: apiError(PRESUPUESTO_FORBIDDEN_MESSAGE, 403, "FORBIDDEN") };
  }
  return { ok: true, value: scoped.row };
}

// Moved to `errors.ts` so `withApiErrorHandling` can answer it for every route.
export { RespuestaAbortada };

/**
 * Locks the project row and re-checks BORRADOR. Returns the `valor_total` read
 * under the lock (a concurrent PATCH may have changed it since the gate).
 * `stateMessage` names the caller's own action in the 409 copy (default: budget).
 */
export async function lockProyectoBorrador(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  proyectoId: string,
  stateMessage: string = PRESUPUESTO_STATE_MESSAGE,
): Promise<{ valor_total: string | null }> {
  const rows = await tx.$queryRaw<{ estado: string; valor_total: string | null }[]>`
    SELECT "estado", "valor_total"::text AS "valor_total" FROM "proyectos" WHERE "id" = ${proyectoId} FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new RespuestaAbortada(apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND"));
  if (row.estado !== "BORRADOR") {
    throw new RespuestaAbortada(apiError(stateMessage, 409, "INVALID_STATE"));
  }
  return { valor_total: row.valor_total };
}

export type ProyectoBloqueado = {
  estado: string;
  valor_total: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  beneficiarios_meta: number | null;
};

/**
 * Locks the project row FOR UPDATE and returns what the caller needs to decide under
 * the lock, whatever the estado (baseline approval needs BORRADOR, a modification
 * EN_EJECUCION: each caller checks its own estado and message). 404 when it is gone.
 */
export async function lockProyecto(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  proyectoId: string,
): Promise<ProyectoBloqueado> {
  const rows = await tx.$queryRaw<ProyectoBloqueado[]>`
    SELECT "estado"::text AS "estado", "valor_total"::text AS "valor_total",
           to_char("fecha_inicio", 'YYYY-MM-DD') AS "fecha_inicio", to_char("fecha_fin", 'YYYY-MM-DD') AS "fecha_fin",
           "beneficiarios_meta"
    FROM "proyectos" WHERE "id" = ${proyectoId} AND "deleted_at" IS NULL FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new RespuestaAbortada(apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND"));
  return row;
}

/**
 * Parses an amount sent as decimal string or JSON number into exact cents. A
 * number goes through `String()` and the same regex, so float noise
 * (0.1 + 0.2) is rejected instead of silently rounded.
 */
export function parseMonto(value: unknown): { ok: true; cents: Cents } | { ok: false; message: string } {
  if (typeof value !== "string" && typeof value !== "number") {
    return { ok: false, message: "Ingresa un monto válido." };
  }
  const text = String(value).trim();
  if (/^-\d+(?:\.\d+)?$/.test(text)) {
    return { ok: false, message: "El monto no puede ser negativo." };
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    return { ok: false, message: "Ingresa un monto válido con máximo dos decimales." };
  }
  const cents = toCents(text);
  if (cents > MONTO_MAXIMO_CENTS) return { ok: false, message: "El monto es demasiado alto." };
  return { ok: true, cents };
}

export function decimalFromCents(cents: Cents): Prisma.Decimal {
  return new Prisma.Decimal(fromCents(cents));
}

// ---------------------------------------------------------------------------
// Budget view
// ---------------------------------------------------------------------------

type BudgetRubroRow = {
  rubro_id: string;
  codigo: string | null;
  nombre: string;
  activo: boolean;
  linea_id: string | null;
  asignado: string;
  heredado_pendiente: boolean;
};

/** S1: one budget line is one activity + rubro + value. A legacy line (D9) has no activity. */
type BudgetLineaRow = {
  linea_id: string;
  actividad_id: string | null;
  actividad_codigo: string | null;
  actividad_nombre: string | null;
  rubro_id: string;
  rubro_codigo: string | null;
  rubro_nombre: string;
  valor: string;
};

export type BudgetView = {
  estado: string;
  /** S2: each rubro row is the sum of its lines. */
  rubros: BudgetRubroRow[];
  lineas: BudgetLineaRow[];
  suma: string;
  valor_total: string | null;
  /** Σ A − valor_total; null while the project has no valor_total. */
  diferencia: string | null;
};

type RubroRow = { id: string; codigo: string | null; nombre: string; activo: boolean; orden: number };
type LineaRow = {
  id: string;
  rubro_id: string;
  actividad: { id: string; codigo: string; nombre: string } | null;
  monto_proyectado_cop: { toString(): string };
};

/** Activity code as numbers (1.2 before 1.10); legacy lines without an activity last. */
function compareActividad(a: LineaRow["actividad"], b: LineaRow["actividad"]): number {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  return a.codigo.localeCompare(b.codigo, "es", { numeric: true });
}

/** Catalog order (`orden`), legacy rubros without a code last. */
export function compareRubros(a: RubroRow, b: RubroRow): number {
  if ((a.codigo === null) !== (b.codigo === null)) return a.codigo === null ? 1 : -1;
  return a.orden - b.orden || a.nombre.localeCompare(b.nombre);
}

function buildBudgetView(input: {
  estado: string;
  valorTotal: { toString(): string } | string | null;
  rubros: readonly RubroRow[];
  lineas: readonly LineaRow[];
}): BudgetView {
  // S5/T10: un rubro puede tener varias líneas (una por actividad). El rubro las SUMA; antes el mapa
  // por rubro se quedaba con la última y la suma perdía el resto, con un orden que ni siquiera era
  // estable porque la consulta no lleva `orderBy`. Con una sola línea por rubro —todo lo cargado antes
  // de la Parte 2— el resultado es exactamente el de antes.
  const lineasPorRubro = new Map<string, LineaRow[]>();
  for (const linea of input.lineas) {
    const acumuladas = lineasPorRubro.get(linea.rubro_id);
    if (acumuladas) acumuladas.push(linea);
    else lineasPorRubro.set(linea.rubro_id, [linea]);
  }
  const filas = [...input.rubros]
    .filter((r) => r.activo || lineasPorRubro.has(r.id))
    .sort(compareRubros)
    .map((r): BudgetRubroRow => {
      const lineas = lineasPorRubro.get(r.id) ?? [];
      const asignado = sumCents(lineas.map((l) => toCents(l.monto_proyectado_cop)));
      return {
        rubro_id: r.id,
        codigo: r.codigo,
        nombre: r.nombre,
        activo: r.activo,
        // Con varias líneas, el renglón es la suma del rubro y no una línea concreta.
        linea_id: lineas.length === 1 ? lineas[0]!.id : null,
        asignado: fromCents(asignado),
        heredado_pendiente: !r.activo && asignado > toCents("0"),
      };
    });

  const rubroPorId = new Map(input.rubros.map((r) => [r.id, r]));
  const lineas = [...input.lineas]
    .sort((a, b) => {
      const ra = rubroPorId.get(a.rubro_id);
      const rb = rubroPorId.get(b.rubro_id);
      return compareActividad(a.actividad, b.actividad) || (ra && rb ? compareRubros(ra, rb) : 0);
    })
    .map(
      (l): BudgetLineaRow => ({
        linea_id: l.id,
        actividad_id: l.actividad?.id ?? null,
        actividad_codigo: l.actividad?.codigo ?? null,
        actividad_nombre: l.actividad?.nombre ?? null,
        rubro_id: l.rubro_id,
        rubro_codigo: rubroPorId.get(l.rubro_id)?.codigo ?? null,
        rubro_nombre: rubroPorId.get(l.rubro_id)?.nombre ?? "",
        valor: fromCents(toCents(l.monto_proyectado_cop)),
      }),
    );

  const suma = sumCents(filas.map((f) => toCents(f.asignado)));
  const total = input.valorTotal === null ? null : toCents(input.valorTotal);
  return {
    estado: input.estado,
    rubros: filas,
    lineas,
    suma: fromCents(suma),
    valor_total: total === null ? null : fromCents(total),
    diferencia: total === null ? null : fromCents(suma - total),
  };
}

type BudgetReader = Pick<Prisma.TransactionClient, "rubro" | "lineaPresupuestal">;

export async function loadBudgetView(
  client: BudgetReader,
  proyectoId: string,
  estado: string,
  valorTotal: { toString(): string } | string | null,
): Promise<BudgetView> {
  const [rubros, lineas] = await Promise.all([
    client.rubro.findMany({
      where: { OR: [{ activo: true }, { lineas: { some: { proyecto_id: proyectoId } } }] },
      select: { id: true, codigo: true, nombre: true, activo: true, orden: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    }),
    client.lineaPresupuestal.findMany({
      where: { proyecto_id: proyectoId },
      select: { id: true, rubro_id: true, monto_proyectado_cop: true, actividad: { select: { id: true, codigo: true, nombre: true } } },
    }),
  ]);
  return buildBudgetView({ estado, valorTotal, rubros, lineas });
}


// ---------------------------------------------------------------------------
// Programming view
// ---------------------------------------------------------------------------

type ControlFila = {
  rubro_id: string;
  codigo: string | null;
  nombre: string;
  asignado: string;
  programado: string;
  /** Σ cells − A; informational in BORRADOR. */
  control: string;
};

export type ProgrammingView = {
  estado: string;
  periodos: string[];
  filas: { linea_id: string; rubro_id: string; periodo: string; valor: string }[];
  /** S8: one row per budget line (activity + rubro), the unit that is programmed. */
  control_por_linea: (ControlFila & { linea_id: string; actividad: LineaRow["actividad"] })[];
  /** The lines of each rubro summed. */
  control_por_rubro: ControlFila[];
  /** Derived (ADR-06): no cell above $0. The stored column is never written. */
  programacion_pendiente: boolean;
};

type ProgramacionLinea = LineaRow & {
  rubro: { codigo: string | null; nombre: string; orden: number; activo: boolean };
};
type CeldaRow = { id: string; linea_id: string; periodo: string; valor: { toString(): string } };

function buildProgrammingView(input: {
  estado: string;
  periodos: string[];
  lineas: readonly ProgramacionLinea[];
  celdas: readonly CeldaRow[];
}): ProgrammingView {
  const porRubro = (a: ProgramacionLinea, b: ProgramacionLinea) =>
    compareRubros({ id: a.rubro_id, ...a.rubro }, { id: b.rubro_id, ...b.rubro });
  const lineas = [...input.lineas].sort((a, b) => compareActividad(a.actividad, b.actividad) || porRubro(a, b));
  const ids = new Set(lineas.map((l) => l.id));
  const celdas = input.celdas
    .filter((c) => ids.has(c.linea_id))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  const zero = toCents("0");
  const filas = lineas.flatMap((l) =>
    celdas
      .filter((c) => c.linea_id === l.id)
      .map((c) => ({ linea_id: l.id, rubro_id: l.rubro_id, periodo: c.periodo, valor: fromCents(toCents(c.valor)) })),
  );
  const control = (rubro: ProgramacionLinea, grupo: readonly ProgramacionLinea[]): ControlFila => {
    const asignado = sumCents(grupo.map((l) => toCents(l.monto_proyectado_cop)));
    const programado = sumCents(
      celdas.filter((c) => grupo.some((l) => l.id === c.linea_id)).map((c) => toCents(c.valor)),
    );
    return {
      rubro_id: rubro.rubro_id,
      codigo: rubro.rubro.codigo,
      nombre: rubro.rubro.nombre,
      asignado: fromCents(asignado),
      programado: fromCents(programado),
      control: fromCents(programado - asignado),
    };
  };
  const control_por_linea = lineas.map((l) => ({ linea_id: l.id, actividad: l.actividad ?? null, ...control(l, [l]) }));
  const primeras = [...lineas].sort(porRubro).filter((l, i, arr) => arr.findIndex((o) => o.rubro_id === l.rubro_id) === i);
  const control_por_rubro = primeras.map((l) => control(l, lineas.filter((o) => o.rubro_id === l.rubro_id)));

  return {
    estado: input.estado,
    periodos: input.periodos,
    filas,
    control_por_linea,
    control_por_rubro,
    programacion_pendiente: !celdas.some((c) => toCents(c.valor) > zero),
  };
}

type ProgrammingReader = Pick<Prisma.TransactionClient, "lineaPresupuestal" | "programacionPeriodo">;

export async function loadProgrammingView(
  client: ProgrammingReader,
  proyectoId: string,
  estado: string,
  periodos: string[],
): Promise<ProgrammingView> {
  const [lineas, celdas] = await Promise.all([
    client.lineaPresupuestal.findMany({
      where: { proyecto_id: proyectoId },
      select: {
        id: true,
        rubro_id: true,
        monto_proyectado_cop: true,
        actividad: { select: { id: true, codigo: true, nombre: true } },
        rubro: { select: { codigo: true, nombre: true, orden: true, activo: true } },
      },
    }),
    client.programacionPeriodo.findMany({
      where: { proyecto_id: proyectoId },
      select: { id: true, linea_id: true, periodo: true, valor: true },
    }),
  ]);
  return buildProgrammingView({ estado, periodos, lineas, celdas });
}
