// S11/T14.5-A (EV-07) — the server side of «Cerrar gastos de la actividad».
//
// Three things live here, and nothing else:
//
// 1. The closure state of an activity. It is stored on `Actividad` (`gastos_cerrados_at`, `gastos_cerrados_nota`,
//    `gastos_cerrados_por`) because the PO describes the closure of the ACTIVITY («la actividad muestra saldo»,
//    «no se pueden registrar gastos en una actividad cerrada») and a closure per line would have nowhere to keep
//    the mandatory note.
// 2. The two writers. Closing demands a note (`nota`) that explains the difference between the assigned amount
//    and the executed one; reopening demands a `motivo` and clears the three columns. Both are audited with the
//    same helpers every other project write uses (`logChanges`, which writes inside the caller's transaction),
//    and both pin the state in the `UPDATE`, so closing twice or reopening an open activity is a 409 and never a
//    silent success — not even when two requests race.
// 3. The single predicate the three expense writers call (POST /expenses, the Excel import and a correction that
//    moves an expense into another activity): the lines of a closed activity are refused with the reason and the
//    way to undo it. One helper, one message, three call sites.
//
// What is deliberately NOT here: the ahorro or the sobreejecución. Closing gathers the number, it does not
// compute it — the financial sheet (5-B) reads `gastos_cerrados_at` and the executed amount and derives both.
// Storing a computed amount here would freeze a number that a later correction has to keep in step.

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { apiError, RespuestaAbortada } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { diffFields, logChanges, type CambioInput } from "@/lib/api/audit-cambios";

/** The note explains the difference and can be a paragraph: same ceiling as the motive of a state change. */
const CIERRE_GASTOS_MAX = 1000;

export const NOTA_CIERRE_OBLIGATORIA = "La nota del cierre es obligatoria.";
export const NOTA_CIERRE_LARGA = "La nota del cierre es demasiado larga.";
export const MOTIVO_REAPERTURA_OBLIGATORIO = "El motivo de la reapertura es obligatorio.";
export const MOTIVO_REAPERTURA_LARGO = "El motivo de la reapertura es demasiado largo.";

/** S11: the exact copy the three expense writers answer, with the reason and how to undo it. */
export const GASTOS_CERRADOS_MESSAGE =
  "Esta actividad tiene los gastos cerrados: no admite gastos nuevos. Reábrela con un motivo para registrar más.";
export const ACTIVIDAD_YA_CERRADA_MESSAGE = "La actividad ya tiene los gastos cerrados.";
export const ACTIVIDAD_SIN_CIERRE_MESSAGE = "La actividad no tiene los gastos cerrados.";
export const ACTIVIDAD_NO_EXISTE = "La actividad no existe.";

/** The closure body: the mandatory note. `.strict()` rejects a body the route does not understand. */
export const CIERRE_GASTOS_SCHEMA = z
  .object({
    nota: z
      .string({ error: NOTA_CIERRE_OBLIGATORIA })
      .trim()
      .min(1, NOTA_CIERRE_OBLIGATORIA)
      .max(CIERRE_GASTOS_MAX, NOTA_CIERRE_LARGA),
  })
  .strict();

/** The reopening body: D4 accepts the «Propuesto» of S11, so a motivo is required and audited. */
export const REAPERTURA_GASTOS_SCHEMA = z
  .object({
    motivo: z
      .string({ error: MOTIVO_REAPERTURA_OBLIGATORIO })
      .trim()
      .min(1, MOTIVO_REAPERTURA_OBLIGATORIO)
      .max(CIERRE_GASTOS_MAX, MOTIVO_REAPERTURA_LARGO),
  })
  .strict();

/** The closure columns, as the routes read them and the writers diff them. */
export const CIERRE_GASTOS_SELECT = {
  id: true,
  gastos_cerrados_at: true,
  gastos_cerrados_nota: true,
  gastos_cerrados_por: true,
} as const;

export type CierreGastosRow = Prisma.ActividadGetPayload<{ select: typeof CIERRE_GASTOS_SELECT }>;

/** The closure columns, in the order they are audited. */
const CAMPOS_CIERRE = ["gastos_cerrados_at", "gastos_cerrados_nota", "gastos_cerrados_por"] as const;

/**
 * What the financial screen reads (5-B): the state as a boolean plus the note, the instant and the actor. The
 * driver's `Date` becomes an ISO string, like every other route of the module; nothing is computed here.
 */
export type CierreGastosView = {
  id: string;
  gastos_cerrados: boolean;
  gastos_cerrados_at: string | null;
  gastos_cerrados_nota: string | null;
  gastos_cerrados_por: string | null;
};

export function toCierreGastosView(row: CierreGastosRow): CierreGastosView {
  return {
    id: row.id,
    gastos_cerrados: row.gastos_cerrados_at !== null,
    gastos_cerrados_at: row.gastos_cerrados_at === null ? null : row.gastos_cerrados_at.toISOString(),
    gastos_cerrados_nota: row.gastos_cerrados_nota,
    gastos_cerrados_por: row.gastos_cerrados_por,
  };
}

type CierreTx = Pick<Prisma.TransactionClient, "actividad" | "auditoriaCambio">;

type CierreWriterInput = {
  /** The row the route read, used for the audit diff; the UPDATE below re-checks the state it carries. */
  actividad: CierreGastosRow;
  proyectoId: string;
  usuarioId: string;
};

/** What the two writers touch: the three closure columns, in the shape the audit diff and `updateMany` take. */
type CierreData = {
  gastos_cerrados_at: Date | null;
  gastos_cerrados_nota: string | null;
  gastos_cerrados_por: string | null;
};

/** The audit rows the caller's `logChanges` writes, one per changed column. */
function filasDeCierre(input: CierreWriterInput, data: CierreData): CambioInput[] {
  const comun = {
    usuario_id: input.usuarioId,
    accion: "EDITAR" as const,
    entidad: "actividad",
    entidad_id: input.actividad.id,
    proyecto_id: input.proyectoId,
  };
  return diffFields(input.actividad, data, CAMPOS_CIERRE).map((cambio) => ({ ...comun, ...cambio }));
}

async function cierreEscribiendo(
  tx: CierreTx,
  input: CierreWriterInput,
  data: CierreData,
  donde: Prisma.ActividadWhereInput,
  respuestaSiNada: Response,
  extra: readonly CambioInput[] = [],
): Promise<CierreGastosView> {
  // The state is pinned in the WHERE, not read-then-written: a second close (or a reopening of a row another
  // request already opened) matches zero rows and answers 409 instead of overwriting the first one.
  const { count } = await tx.actividad.updateMany({ where: { ...donde, proyecto_id: input.proyectoId }, data });
  if (count === 0) throw new RespuestaAbortada(respuestaSiNada);

  const filas = [...filasDeCierre(input, data), ...extra];
  if (filas.length > 0) await logChanges(tx as Prisma.TransactionClient, filas);

  const despues = await tx.actividad.findFirstOrThrow({
    where: { id: input.actividad.id, proyecto_id: input.proyectoId },
    select: CIERRE_GASTOS_SELECT,
  });
  return toCierreGastosView(despues);
}

/**
 * Closes the activity's expenses. `where` pins `gastos_cerrados_at: null`, so an activity already closed is a
 * 409 CONFLICT even when the row changed after the route read it. The note is recorded twice on purpose: as the
 * column the screen shows and as the audit row that explains «why the difference» (S11).
 */
export async function cerrarGastosActividad(
  tx: CierreTx,
  input: CierreWriterInput & { nota: string },
): Promise<CierreGastosView> {
  return cierreEscribiendo(
    tx,
    input,
    {
      gastos_cerrados_at: new Date(),
      gastos_cerrados_nota: input.nota,
      gastos_cerrados_por: input.usuarioId,
    },
    { id: input.actividad.id, deleted_at: null, gastos_cerrados_at: null },
    apiError(ACTIVIDAD_YA_CERRADA_MESSAGE, 409, "CONFLICT"),
  );
}

/**
 * Reopens the activity's expenses: the three columns go back to null and the motivo explains the reopening in
 * the ledger (D4). `where` pins `gastos_cerrados_at` NOT NULL, so an activity that is not closed is a 409.
 */
export async function reabrirGastosActividad(
  tx: CierreTx,
  input: CierreWriterInput & { motivo: string },
): Promise<CierreGastosView> {
  // The motive is not a column (the reopening only clears), so it travels as its own audit row, in the same
  // lote as the three cleared columns: the ledger reads the reopening as one operation.
  const motivo: CambioInput = {
    usuario_id: input.usuarioId,
    accion: "EDITAR",
    entidad: "actividad",
    entidad_id: input.actividad.id,
    proyecto_id: input.proyectoId,
    campo: "motivo_reapertura",
    valor_anterior: null,
    valor_nuevo: input.motivo,
  };
  return cierreEscribiendo(
    tx,
    input,
    { gastos_cerrados_at: null, gastos_cerrados_nota: null, gastos_cerrados_por: null },
    { id: input.actividad.id, deleted_at: null, gastos_cerrados_at: { not: null } },
    apiError(ACTIVIDAD_SIN_CIERRE_MESSAGE, 409, "CONFLICT"),
    [motivo],
  );
}

// ---------------------------------------------------------------------------
// The gate of the expense writers (S11: «no se pueden registrar gastos en una actividad cerrada»)
// ---------------------------------------------------------------------------

/** The client the predicate accepts: the shared `db` or the transaction of a writer that proves it live. */
type CierreDb = Pick<Prisma.TransactionClient, "lineaPresupuestal">;

/**
 * The line ids whose activity has its expenses closed. One bounded query whatever the number of lines, and the
 * closure is filtered in JS from the row's own `actividad` (a legacy line without activity is open): the check
 * never runs a query per row. An empty list asks nothing.
 */
export async function lineasEnActividadesCerradas(
  lineaIds: readonly string[],
  client: CierreDb = db,
): Promise<Set<string>> {
  const ids = [...new Set(lineaIds)];
  if (ids.length === 0) return new Set();

  const filas = await client.lineaPresupuestal.findMany({
    where: { id: { in: ids } },
    select: { id: true, actividad: { select: { gastos_cerrados_at: true } } },
  });
  return new Set(filas.filter((fila) => fila.actividad?.gastos_cerrados_at != null).map((fila) => fila.id));
}

/**
 * The one check the three expense writers call. A 409 INVALID_STATE with the S11 copy — the reason and how to
 * undo it — when any of the lines belongs to a closed activity; `null` when every line is open, so the caller
 * keeps going and writes as before.
 */
export async function rechazarGastosCerrados(
  lineaIds: readonly string[],
  client: CierreDb = db,
): Promise<Response | null> {
  const cerradas = await lineasEnActividadesCerradas(lineaIds, client);
  if (cerradas.size === 0) return null;
  return apiError(GASTOS_CERRADOS_MESSAGE, 409, "INVALID_STATE");
}

/**
 * The lines that ENTER the expense: the requested ones that were not already on it. A correction is judged on
 * this difference — moving an expense into a closed activity is refused, while a correction that keeps the
 * activity it already has stays possible (S11 closes the activity to new expenses, not to its own history).
 */
export function lineasQueEntran(pedidas: readonly string[], actuales: readonly string[]): string[] {
  const yaEstaban = new Set(actuales);
  return [...new Set(pedidas)].filter((lineaId) => !yaEstaban.has(lineaId));
}
