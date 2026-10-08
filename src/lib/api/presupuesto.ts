// Shared plumbing of the S5 budget and programming routes, mounted under
// /api/v1/projects/:id/ (budget, programming).
//
// Same order as every v2 write: project (404) -> permission (403) -> estado (409)
// -> body (400). The BORRADOR check is repeated under a row lock inside the write
// transaction, so a baseline approval racing with an edit cannot slip a change in.

import { Prisma, type Usuario } from "@prisma/client";
import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { canManageProjects } from "@/lib/permissions";
import { canReadProject, loadProjectScoped } from "@/lib/api/projects";
import type { GateResult } from "@/lib/api/estructura";
import { fromCents, sumCents, toCents, type Cents } from "@/lib/proyectos/money";

export const PRESUPUESTO_FORBIDDEN_MESSAGE = "No tienes permisos sobre este proyecto.";
export const PRESUPUESTO_STATE_MESSAGE =
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
  const proyecto = await db.proyecto.findFirst({
    where: { id: proyectoId, deleted_at: null },
    select: { ...PRESUPUESTO_SELECT, oportunidad: { select: { valor_estimado_cop: true } } },
  });
  if (!proyecto) return { ok: false, response: apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND") };
  if (!canManageProjects(usuario)) {
    return { ok: false, response: apiError(PRESUPUESTO_FORBIDDEN_MESSAGE, 403, "FORBIDDEN") };
  }
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

/** Thrown inside a write transaction to roll it back and answer with `response`. */
export class RespuestaAbortada extends Error {
  constructor(public readonly response: Response) {
    super("abortada");
  }
}

/**
 * Locks the project row and re-checks BORRADOR. Returns the `valor_total` read
 * under the lock (a concurrent PATCH may have changed it since the gate).
 */
export async function lockProyectoBorrador(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  proyectoId: string,
): Promise<{ valor_total: string | null }> {
  const rows = await tx.$queryRaw<{ estado: string; valor_total: string | null }[]>`
    SELECT "estado", "valor_total"::text AS "valor_total" FROM "proyectos" WHERE "id" = ${proyectoId} FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new RespuestaAbortada(apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND"));
  if (row.estado !== "BORRADOR") {
    throw new RespuestaAbortada(apiError(PRESUPUESTO_STATE_MESSAGE, 409, "INVALID_STATE"));
  }
  return { valor_total: row.valor_total };
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

export type BudgetRubroRow = {
  rubro_id: string;
  codigo: string | null;
  nombre: string;
  activo: boolean;
  linea_id: string | null;
  asignado: string;
  heredado_pendiente: boolean;
};

export type BudgetView = {
  estado: string;
  rubros: BudgetRubroRow[];
  suma: string;
  valor_total: string | null;
  /** Σ A − valor_total; null while the project has no valor_total. */
  diferencia: string | null;
};

type RubroRow = { id: string; codigo: string | null; nombre: string; activo: boolean; orden: number };
type LineaRow = { id: string; rubro_id: string; monto_proyectado_cop: { toString(): string } };

/** Catalog order (`orden`), legacy rubros without a code last. */
export function compareRubros(a: RubroRow, b: RubroRow): number {
  if ((a.codigo === null) !== (b.codigo === null)) return a.codigo === null ? 1 : -1;
  return a.orden - b.orden || a.nombre.localeCompare(b.nombre);
}

export function buildBudgetView(input: {
  estado: string;
  valorTotal: { toString(): string } | string | null;
  rubros: readonly RubroRow[];
  lineas: readonly LineaRow[];
}): BudgetView {
  const porRubro = new Map(input.lineas.map((l) => [l.rubro_id, l]));
  const filas = [...input.rubros]
    .filter((r) => r.activo || porRubro.has(r.id))
    .sort(compareRubros)
    .map((r): BudgetRubroRow => {
      const linea = porRubro.get(r.id);
      const asignado = linea ? toCents(linea.monto_proyectado_cop) : toCents("0");
      return {
        rubro_id: r.id,
        codigo: r.codigo,
        nombre: r.nombre,
        activo: r.activo,
        linea_id: linea?.id ?? null,
        asignado: fromCents(asignado),
        heredado_pendiente: !r.activo && asignado > toCents("0"),
      };
    });

  const suma = sumCents(filas.map((f) => toCents(f.asignado)));
  const total = input.valorTotal === null ? null : toCents(input.valorTotal);
  return {
    estado: input.estado,
    rubros: filas,
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
      select: { id: true, rubro_id: true, monto_proyectado_cop: true },
    }),
  ]);
  return buildBudgetView({ estado, valorTotal, rubros, lineas });
}


// ---------------------------------------------------------------------------
// Programming view
// ---------------------------------------------------------------------------

export type ProgrammingView = {
  estado: string;
  periodos: string[];
  filas: { rubro_id: string; periodo: string; valor: string }[];
  control_por_rubro: {
    rubro_id: string;
    codigo: string | null;
    nombre: string;
    asignado: string;
    programado: string;
    /** Σ cells − A; informational in BORRADOR. */
    control: string;
  }[];
  /** Derived (ADR-06): no cell above $0. The stored column is never written. */
  programacion_pendiente: boolean;
};

type ProgramacionLinea = LineaRow & {
  rubro: { codigo: string | null; nombre: string; orden: number; activo: boolean };
};
type CeldaRow = { id: string; linea_id: string; periodo: string; valor: { toString(): string } };

export function buildProgrammingView(input: {
  estado: string;
  periodos: string[];
  lineas: readonly ProgramacionLinea[];
  celdas: readonly CeldaRow[];
}): ProgrammingView {
  const lineas = [...input.lineas].sort((a, b) =>
    compareRubros(
      { id: a.rubro_id, ...a.rubro },
      { id: b.rubro_id, ...b.rubro },
    ),
  );
  const rubroDeLinea = new Map(lineas.map((l) => [l.id, l.rubro_id]));
  const celdas = input.celdas
    .filter((c) => rubroDeLinea.has(c.linea_id))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  const zero = toCents("0");
  const filas = lineas.flatMap((l) =>
    celdas
      .filter((c) => c.linea_id === l.id)
      .map((c) => ({ rubro_id: l.rubro_id, periodo: c.periodo, valor: fromCents(toCents(c.valor)) })),
  );
  const control_por_rubro = lineas.map((l) => {
    const asignado = toCents(l.monto_proyectado_cop);
    const programado = sumCents(celdas.filter((c) => c.linea_id === l.id).map((c) => toCents(c.valor)));
    return {
      rubro_id: l.rubro_id,
      codigo: l.rubro.codigo,
      nombre: l.rubro.nombre,
      asignado: fromCents(asignado),
      programado: fromCents(programado),
      control: fromCents(programado - asignado),
    };
  });

  return {
    estado: input.estado,
    periodos: input.periodos,
    filas,
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
