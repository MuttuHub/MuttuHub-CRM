// Shared plumbing of the S6 expense routes, mounted under /api/v1/projects/:id/expenses
// (RF-20..22, RNF-03, RNF-04).
//
// Order of every write: project (404) -> permission (403) -> estado (409) -> body (400).
// The third-party identification number is personal data: it never reaches the audit ledger
// in clear (`mascara`), and the list/detail views drop it, the normalized key and the supports
// for actors who cannot view financial supports (`redactarGasto`).

import { Prisma, type Usuario } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import {
  canManageProjects,
  canViewFinancialSupports,
} from "@/lib/permissions";
import { canReadProject, loadProjectScoped, projectReadActor } from "@/lib/api/projects";
import type { GateResult } from "@/lib/api/estructura";
import { MONTO_MAXIMO_CENTS, decimalFromCents, parseMonto } from "@/lib/api/presupuesto";
import { PROYECTO_NO_EXISTE } from "@/lib/api/ejecucion";
import { excederiaAsignado } from "@/lib/proyectos/ficha-financiera";
import {
  ESTADOS_EJECUTADOS,
  excedeProgramado,
  normalizarIdentificacion,
  normalizarNumeroDocumento,
  periodoEnProyecto,
  periodoPorDefecto,
  redactarGasto,
  datosIncompletos,
  esObservado,
  type EstadoGasto,
} from "@/lib/proyectos/gastos";
import { fromCents, sumCents, toCents, type Cents } from "@/lib/proyectos/money";
import { assertIsoDate, projectPeriods } from "@/lib/proyectos/weeks";
import { isoDate } from "@/lib/proyectos/proyecto-general";

export const GASTO_FORBIDDEN_MESSAGE = "No tienes permisos sobre este proyecto.";
/** S2/T6: the reason the Gestor writes when correcting somebody else's expense. */
export const CORRECCION_SIN_MOTIVO_MESSAGE = "Escribe el motivo de la corrección.";
/** S2/T6: two people corrected the same expense and the second one is holding an older row. */
export const GASTO_CAMBIO_MESSAGE = "El gasto cambió mientras lo corregías. Vuelve a abrirlo.";
export const GASTO_NO_EXISTE = "El gasto no existe.";
const SIN_SOPORTE_MESSAGE = "Adjunta al menos un soporte (archivo o enlace).";
export const MAX_SOPORTES = 5;
export const MAX_SOPORTES_MESSAGE = `Puedes adjuntar máximo ${MAX_SOPORTES} soportes.`;
export const RUBRO_SIN_ASIGNADO_MESSAGE = "Solo puedes registrar gastos en rubros con valor asignado.";
/** S9/T14.1: the line the form chose must be one of that rubro's lines in the project. */
export const LINEA_NO_DEL_RUBRO_MESSAGE = "La línea elegida no corresponde al rubro de este proyecto.";
/** S9/T14.2-B1: the distributed invoice names its lines; a header rubro or line next to them is the ambiguity. */
export const REPARTO_MEZCLA_MESSAGE = "Una factura distribuida no lleva rubro ni línea en la cabecera.";
/** S9: «Una distribución que suma $990.000 para una factura de $1.000.000 no se guarda.» */
export const REPARTO_SUMA_MESSAGE = "Las líneas de la distribución deben sumar exactamente el total de la factura.";
export const REPARTO_SIN_FILAS_MESSAGE = "Indica al menos una línea de la distribución.";
export const REPARTO_VALOR_MESSAGE = "El valor de cada línea de la distribución debe ser mayor que cero.";
export const REPARTO_LINEA_MESSAGE = "Cada línea de la distribución debe ser una línea del proyecto con valor asignado.";
/** S9/T14.2-B1: a split invoice is re-split only with its full distribution; otherwise its rows stop summing. */
export const REPARTO_REQUERIDO_MESSAGE = "Envía la distribución completa para corregir una factura repartida.";
export const PERIODO_FUERA_MESSAGE = "El periodo debe corresponder a un mes del proyecto.";
const PROYECTO_SIN_FECHAS_MESSAGE = "El proyecto no tiene fechas definidas.";
export const GASTO_VALIDADO_MESSAGE = "Un gasto validado no se puede editar.";
export const GASTO_ANULADO_MESSAGE = "Un gasto anulado no se puede editar.";
export const SUBTOTAL_POSITIVO_MESSAGE = "El subtotal debe ser mayor que cero.";
export const IVA_NEGATIVO_MESSAGE = "El IVA no puede ser negativo.";
const TOTAL_ALTO_MESSAGE = "El total (subtotal más IVA) es demasiado alto.";
export const PERIODO_DOCUMENTO_FUERA_MESSAGE =
  "La fecha del documento está fuera de los meses del proyecto: elige el periodo.";

export const ESTADOS_EDITABLES: EstadoGasto[] = ["REGISTRADO", "RECHAZADO"];
const TODOS_LOS_ESTADOS: EstadoGasto[] = ["REGISTRADO", "VALIDADO", "RECHAZADO", "ANULADO"];

// ---------------------------------------------------------------------------
// Body schemas
// ---------------------------------------------------------------------------

/** `genero` keeps the Spanish agreement right: «El nombre … es obligatorio» / «La descripción … es obligatoria». */
const texto = (etiqueta: string, max: number, genero: "m" | "f" = "m") => {
  const terminacion = genero === "f" ? "a" : "o";
  return z
    .string({ error: `${etiqueta} es obligatori${terminacion}.` })
    .trim()
    .min(1, `${etiqueta} es obligatori${terminacion}.`)
    .max(max, `${etiqueta} es demasiado larg${terminacion}.`);
};

const fechaField = z
  .string({ error: "La fecha del documento es obligatoria." })
  .refine(
    (value) => {
      try {
        assertIsoDate(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "La fecha del documento no es válida." },
  );

const GASTO_FIELDS = {
  rubro_id: z.string({ error: "El rubro es obligatorio." }).min(1, "El rubro es obligatorio."),
  fecha_documento: fechaField,
  periodo: z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/, "El periodo no es válido (AAAA-MM)."),
  tipo_soporte: z.enum(["FACTURA_PROVEEDOR", "CUENTA_COBRO_PERSONA_NATURAL", "OTRO"], {
    error: "El tipo de soporte no es válido.",
  }),
  tercero_nombre: texto("El nombre del tercero", 200),
  tercero_tipo_id: z.enum(["NIT", "CC", "CE"], { error: "El tipo de identificación no es válido." }).nullable(),
  tercero_numero_id: z
    .string()
    .trim()
    .max(40, "El número de identificación es demasiado largo.")
    .nullable(),
  numero_documento: texto("El número de documento", 100),
  descripcion: texto("La descripción", 1000, "f"),
  subtotal: z.union([z.string(), z.number()], { error: "Ingresa un subtotal válido." }),
  iva: z.union([z.string(), z.number()], { error: "Ingresa un IVA válido (puede ser 0)." }),
};

/** One row of a distributed invoice: the budget line and the amount that belongs to it (S9/T14.2-B1). */
const GASTO_REPARTO_SCHEMA = z
  .object({
    linea_id: z.string({ error: REPARTO_LINEA_MESSAGE }).min(1, REPARTO_LINEA_MESSAGE),
    valor: z.union([z.string(), z.number()], { error: REPARTO_VALOR_MESSAGE }),
  })
  .strict();

const repartosField = z
  .array(GASTO_REPARTO_SCHEMA, { error: REPARTO_SIN_FILAS_MESSAGE })
  .min(1, REPARTO_SIN_FILAS_MESSAGE)
  .optional();

const GASTO_CREATE_BASE = z
  .object({
    /** Optional with `repartos`: the distribution names the lines and the header keeps no rubro of its own. */
    rubro_id: GASTO_FIELDS.rubro_id.optional(),
    /**
     * S9/T14.1: the exact budget line (activity + rubro) the form chose. Optional, so a caller that only
     * knows the rubro keeps working; when it arrives it must be one of that rubro's lines in the project.
     */
    linea_id: z.string().min(1, LINEA_NO_DEL_RUBRO_MESSAGE).optional(),
    /** S9/T14.2-B1: the distributed invoice, one row per activity + rubro. Excludes `rubro_id`/`linea_id`. */
    repartos: repartosField,
    fecha_documento: GASTO_FIELDS.fecha_documento,
    periodo: GASTO_FIELDS.periodo.optional(),
    tipo_soporte: GASTO_FIELDS.tipo_soporte,
    tercero_nombre: GASTO_FIELDS.tercero_nombre,
    tercero_tipo_id: GASTO_FIELDS.tercero_tipo_id.optional(),
    tercero_numero_id: GASTO_FIELDS.tercero_numero_id.optional(),
    numero_documento: GASTO_FIELDS.numero_documento,
    descripcion: GASTO_FIELDS.descripcion,
    subtotal: GASTO_FIELDS.subtotal,
    iva: GASTO_FIELDS.iva,
    soportes: z
      .array(z.unknown(), { error: SIN_SOPORTE_MESSAGE })
      .min(1, SIN_SOPORTE_MESSAGE)
      .max(MAX_SOPORTES, MAX_SOPORTES_MESSAGE),
  })
  .strict();

/** The fields the distribution rule reads: the create body, and the import row that omits `soportes`. */
type GastoConRepartos = { rubro_id?: string; linea_id?: string; repartos?: unknown[] };

/** Without `repartos` the body keeps its legacy shape: `rubro_id` (and the optional `linea_id`) are required. */
function revisarRepartosDeGasto(value: GastoConRepartos, ctx: z.RefinementCtx) {
  if (value.repartos === undefined) {
    if (value.rubro_id === undefined) {
      ctx.addIssue({ code: "custom", message: "El rubro es obligatorio.", path: ["rubro_id"] });
    }
    return;
  }
  // S9/T14.2-B1: a body that mixes both would leave the invoice described twice: that ambiguity is the bug.
  if (value.rubro_id !== undefined) ctx.addIssue({ code: "custom", message: REPARTO_MEZCLA_MESSAGE, path: ["rubro_id"] });
  if (value.linea_id !== undefined) ctx.addIssue({ code: "custom", message: REPARTO_MEZCLA_MESSAGE, path: ["linea_id"] });
}

export const GASTO_CREATE_SCHEMA = GASTO_CREATE_BASE.superRefine(revisarRepartosDeGasto);

const GASTO_PATCH_BASE = z
  .object({
    rubro_id: GASTO_FIELDS.rubro_id.optional(),
    /** S9/T14.2-B1: new distribution of the invoice; it excludes `rubro_id`, as in the create body. */
    repartos: repartosField,
    fecha_documento: GASTO_FIELDS.fecha_documento.optional(),
    periodo: GASTO_FIELDS.periodo.optional(),
    tipo_soporte: GASTO_FIELDS.tipo_soporte.optional(),
    tercero_nombre: GASTO_FIELDS.tercero_nombre.optional(),
    tercero_tipo_id: GASTO_FIELDS.tercero_tipo_id.optional(),
    tercero_numero_id: GASTO_FIELDS.tercero_numero_id.optional(),
    numero_documento: GASTO_FIELDS.numero_documento.optional(),
    descripcion: GASTO_FIELDS.descripcion.optional(),
    subtotal: GASTO_FIELDS.subtotal.optional(),
    iva: GASTO_FIELDS.iva.optional(),
    /** Optional here: the route demands it only when the Gestor corrects another person's expense. */
    motivo: z.string().trim().min(1, CORRECCION_SIN_MOTIVO_MESSAGE).max(500, "El motivo es demasiado largo.").optional(),
    /** The `updated_at` the client read; when it arrives, the write refuses to overwrite a newer row. */
    updated_at: z.string().optional(),
  })
  .strict();

export const GASTO_PATCH_SCHEMA = GASTO_PATCH_BASE.superRefine((value, ctx) => {
  if (value.repartos !== undefined && value.rubro_id !== undefined) {
    ctx.addIssue({ code: "custom", message: REPARTO_MEZCLA_MESSAGE, path: ["rubro_id"] });
  }
});

/** One row of an expense: the create body without its supports (the Excel import carries none). */
export const GASTO_FILA_SCHEMA = GASTO_CREATE_BASE.omit({ soportes: true }).superRefine(revisarRepartosDeGasto);

/** Query of the pre-save duplicate check: the create body's identity fields, never the amount. */
export const GASTO_DUPLICADO_QUERY_SCHEMA = GASTO_CREATE_BASE.pick({
  tercero_tipo_id: true,
  tercero_numero_id: true,
  numero_documento: true,
});

export type MontosGasto = { ok: true; subtotal: Cents; iva: Cents; total: Cents };
export type MontosGastoError = { ok: false; campo: "Subtotal" | "IVA" | "Total"; message: string };

/**
 * AJ-04: Subtotal (> 0) plus IVA (>= 0, may be 0) in exact cents; the Total is always their sum and is never
 * typed. The error names the column so the import can answer with row and column. Without HTTP.
 */
export function evaluarMontosGasto(subtotal: unknown, iva: unknown): MontosGasto | MontosGastoError {
  const sub = parseMonto(subtotal);
  if (!sub.ok) return { ok: false, campo: "Subtotal", message: sub.message };
  if (sub.cents <= BigInt(0)) return { ok: false, campo: "Subtotal", message: SUBTOTAL_POSITIVO_MESSAGE };
  const imp = parseMonto(iva);
  if (!imp.ok) {
    const negativo = imp.message === "El monto no puede ser negativo.";
    return { ok: false, campo: "IVA", message: negativo ? IVA_NEGATIVO_MESSAGE : imp.message };
  }
  const total = sub.cents + imp.cents;
  if (total > MONTO_MAXIMO_CENTS) return { ok: false, campo: "Total", message: TOTAL_ALTO_MESSAGE };
  return { ok: true, subtotal: sub.cents, iva: imp.cents, total };
}

/** Same as `evaluarMontosGasto`, answering 400. */
export function parseMontosGasto(subtotal: unknown, iva: unknown): MontosGasto | { ok: false; response: Response } {
  const evaluated = evaluarMontosGasto(subtotal, iva);
  if (!evaluated.ok) return { ok: false, response: apiError(evaluated.message, 400, "VALIDATION_ERROR") };
  return evaluated;
}

/** One requested distribution row, already in exact cents. */
export type RepartoPedido = { linea_id: string; valor: Cents };

/**
 * S9/T14.2-B1: the distribution of a distributed invoice. Every row is positive and exact, and the rows add up
 * to the invoice total (subtotal + IVA, the value the header stores) — never to the subtotal alone. The example of
 * the PO: 350.000 + 650.000 = 1.000.000 is saved; 990.000 for a 1.000.000 invoice is not. Without HTTP.
 */
export function evaluarRepartos(
  repartos: readonly { linea_id: string; valor: string | number }[],
  total: Cents,
): { ok: true; value: RepartoPedido[] } | { ok: false; message: string } {
  const filas: RepartoPedido[] = [];
  for (const fila of repartos) {
    const monto = parseMonto(fila.valor);
    if (!monto.ok || monto.cents <= BigInt(0) || monto.cents > MONTO_MAXIMO_CENTS) {
      return { ok: false, message: REPARTO_VALOR_MESSAGE };
    }
    filas.push({ linea_id: fila.linea_id, valor: monto.cents });
  }
  if (sumCents(filas.map((fila) => fila.valor)) !== total) return { ok: false, message: REPARTO_SUMA_MESSAGE };
  return { ok: true, value: filas };
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

export type GastoProyecto = {
  id: string;
  estado: string;
  fecha_inicio: Date | null;
  fecha_fin: Date | null;
};

/** 404 -> 403 for a read; also resolves whether the actor may view supports and third-party ids. */
export async function gateGastoRead(
  usuario: Usuario,
  proyectoId: string,
): Promise<GateResult<{ proyecto: GastoProyecto; puedeVerSoportes: boolean }>> {
  const scoped = await loadProjectScoped(usuario, proyectoId, {
    id: true,
    estado: true,
    fecha_inicio: true,
    fecha_fin: true,
  });
  if (!scoped) return { ok: false, response: apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND") };
  if (!canReadProject(usuario, scoped.es_miembro)) {
    return { ok: false, response: apiError(GASTO_FORBIDDEN_MESSAGE, 403, "FORBIDDEN") };
  }
  return {
    ok: true,
    value: {
      proyecto: scoped.row,
      puedeVerSoportes: canViewFinancialSupports(projectReadActor(usuario, scoped.es_miembro)),
    },
  };
}

// ---------------------------------------------------------------------------
// Line, period and overspend resolution
// ---------------------------------------------------------------------------

export type LineaGasto = {
  id: string;
  asignado: Cents;
  rubro: { id: string; codigo: string | null; nombre: string };
};

/** T14.2-B1: a distribution row also names the activity of its line (null on a legacy line, «Sin actividad»). */
export type LineaReparto = LineaGasto & { actividad_id: string | null };

/** One row of a distributed invoice: the resolved line and the amount that belongs to it. */
export type RepartoFactura = { linea: LineaReparto; valor: Cents };

/** A rubro only takes expenses while its assigned amount is above zero. */
export function tieneAsignado(monto: { toString(): string }): boolean {
  return toCents(monto) > BigInt(0);
}

/**
 * The budget line of a rubro in the project; the rubro needs an assigned amount above zero.
 *
 * S9/T14.1: with `lineaId` the line has to be one of that rubro's lines in this project — never an arbitrary
 * one — and anything else is a 400. Without it (an older caller that only knows the rubro) the rubro's line is
 * resolved as before.
 */
export async function resolverLinea(
  proyectoId: string,
  rubroId: string,
  lineaId?: string,
): Promise<{ ok: true; value: LineaReparto } | { ok: false; response: Response }> {
  const linea = await db.lineaPresupuestal.findFirst({
    where: lineaId
      ? { id: lineaId, proyecto_id: proyectoId, rubro_id: rubroId }
      : { proyecto_id: proyectoId, rubro_id: rubroId },
    select: {
      id: true,
      actividad_id: true,
      monto_proyectado_cop: true,
      rubro: { select: { id: true, codigo: true, nombre: true } },
    },
  });
  if (!linea) {
    return {
      ok: false,
      response: apiError(lineaId ? LINEA_NO_DEL_RUBRO_MESSAGE : RUBRO_SIN_ASIGNADO_MESSAGE, 400, "VALIDATION_ERROR"),
    };
  }
  if (!tieneAsignado(linea.monto_proyectado_cop)) {
    return { ok: false, response: apiError(RUBRO_SIN_ASIGNADO_MESSAGE, 400, "VALIDATION_ERROR") };
  }
  return {
    ok: true,
    value: {
      id: linea.id,
      actividad_id: linea.actividad_id,
      asignado: toCents(linea.monto_proyectado_cop),
      rubro: linea.rubro,
    },
  };
}

/**
 * S9/T14.2-B1: every line of the distribution has to be a line of this project with an assigned amount above
 * zero. Rows come back in the order the client sent them: the first one is the line the header points at.
 */
export async function resolverRepartos(
  proyectoId: string,
  repartos: readonly RepartoPedido[],
): Promise<{ ok: true; value: RepartoFactura[] } | { ok: false; response: Response }> {
  const lineas = await db.lineaPresupuestal.findMany({
    where: { id: { in: repartos.map((fila) => fila.linea_id) }, proyecto_id: proyectoId },
    select: {
      id: true,
      actividad_id: true,
      monto_proyectado_cop: true,
      rubro: { select: { id: true, codigo: true, nombre: true } },
    },
  });
  const porId = new Map(lineas.map((linea) => [linea.id, linea]));
  const value: RepartoFactura[] = [];
  for (const fila of repartos) {
    const linea = porId.get(fila.linea_id);
    if (!linea || !tieneAsignado(linea.monto_proyectado_cop)) {
      return { ok: false, response: apiError(REPARTO_LINEA_MESSAGE, 400, "VALIDATION_ERROR") };
    }
    value.push({
      linea: {
        id: linea.id,
        actividad_id: linea.actividad_id,
        asignado: toCents(linea.monto_proyectado_cop),
        rubro: linea.rubro,
      },
      valor: fila.valor,
    });
  }
  return { ok: true, value };
}

/**
 * The period must be a month of the project; it defaults to the month of the document date (and asks to be
 * chosen when that month is outside the project). Without HTTP.
 */
export function evaluarPeriodo(
  proyecto: Pick<GastoProyecto, "fecha_inicio" | "fecha_fin">,
  fechaDocumento: string,
  periodo: string | undefined,
): { ok: true; value: string } | { ok: false; message: string } {
  if (!proyecto.fecha_inicio || !proyecto.fecha_fin) return { ok: false, message: PROYECTO_SIN_FECHAS_MESSAGE };
  const periodos = projectPeriods(isoDate(proyecto.fecha_inicio), isoDate(proyecto.fecha_fin));
  const elegido = periodo ?? periodoPorDefecto(fechaDocumento);
  if (!periodoEnProyecto(elegido, periodos)) {
    // Defaulted from a date outside the project: the person has to choose the period (AJ-05).
    return { ok: false, message: periodo === undefined ? PERIODO_DOCUMENTO_FUERA_MESSAGE : PERIODO_FUERA_MESSAGE };
  }
  return { ok: true, value: elegido };
}

/** The period must be a month of the project; it defaults to the month of the document date. */
export function resolverPeriodo(
  proyecto: GastoProyecto,
  fechaDocumento: string,
  periodo: string | undefined,
): { ok: true; value: string } | { ok: false; response: Response } {
  const evaluated = evaluarPeriodo(proyecto, fechaDocumento, periodo);
  if (!evaluated.ok) return { ok: false, response: apiError(evaluated.message, 400, "VALIDATION_ERROR") };
  return evaluated;
}

/** Early warning: would the executed total of the line plus `nuevo` exceed the assigned amount. */
export async function superaAsignado(
  tx: Pick<Prisma.TransactionClient, "gasto">,
  linea: { id: string; asignado: Cents },
  nuevo: Cents,
  excluirGastoId?: string,
): Promise<boolean> {
  const total = await tx.gasto.aggregate({
    where: {
      linea_id: linea.id,
      estado: { in: [...ESTADOS_EJECUTADOS] },
      ...(excluirGastoId ? { id: { not: excluirGastoId } } : {}),
    },
    _sum: { monto_cop: true },
  });
  const ejecutado = total._sum.monto_cop ? toCents(total._sum.monto_cop) : BigInt(0);
  return excederiaAsignado({ asignado: linea.asignado, ejecutado, nuevo });
}

/** Normalized keys written by the app and used only for the duplicate lookup (RF-21). */
export function clavesNormalizadas(input: {
  tercero_tipo_id: "NIT" | "CC" | "CE" | null;
  tercero_numero_id: string | null;
  numero_documento: string;
}) {
  return {
    tercero_id_norm: normalizarIdentificacion(input.tercero_tipo_id, input.tercero_numero_id),
    numero_documento_norm: normalizarNumeroDocumento(input.numero_documento),
  };
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export type AlertaGasto =
  | { tipo: "SOBREGASTO"; mensaje: string }
  | { tipo: "SOBREGASTO_PROGRAMADO"; mensaje: string }
  | { tipo: "DUPLICADO"; gasto_id: string | null; proyecto_codigo: string | null; mensaje: string };

/** S2: the critical alert carries the exact text the PO asked for. */
export const SOBREGASTO_MENSAJE = "Solicita un traslado al Gerente";
export const SOBREGASTO_PROGRAMADO_ADVERTENCIA =
  "Este gasto supera lo programado del rubro hasta este periodo.";

export type NivelSobregasto = "ASIGNADO" | "PROGRAMADO" | null;

/** Maps the level computed after saving to its alert: the critical one wins over the programmed warning. */
export function alertaSobregasto(nivel: NivelSobregasto): AlertaGasto | null {
  if (nivel === "ASIGNADO") return { tipo: "SOBREGASTO", mensaje: SOBREGASTO_MENSAJE };
  if (nivel === "PROGRAMADO") return { tipo: "SOBREGASTO_PROGRAMADO", mensaje: SOBREGASTO_PROGRAMADO_ADVERTENCIA };
  return null;
}

/**
 * Overspend level after saving (S2, L16), never blocking: the assigned total (`ASIGNADO`, critical) when the
 * executed total of the line already exceeds it, else the programmed level (`PROGRAMADO`) when the executed
 * accumulated up to `periodo` exceeds the amount programmed up to that same period. The critical level is
 * taken as given (the callers already store it as `alerta_sobregasto`) and skips the programmed query.
 *
 * `nuevo` predicts an amount that is not written yet (the import preview); after a write the executed sum
 * already includes the row. `excluirGastoId` leaves the edited row out when the update has not landed yet.
 */
export async function nivelSobregasto(
  tx: Pick<Prisma.TransactionClient, "gasto" | "programacionPeriodo">,
  linea: { id: string },
  input: { periodo: string; critico: boolean; nuevo?: Cents; excluirGastoId?: string },
): Promise<NivelSobregasto> {
  if (input.critico) return "ASIGNADO";
  const [programado, ejecutado] = await Promise.all([
    tx.programacionPeriodo.aggregate({
      where: { linea_id: linea.id, periodo: { lte: input.periodo } },
      _sum: { valor: true },
    }),
    tx.gasto.aggregate({
      where: {
        linea_id: linea.id,
        estado: { in: [...ESTADOS_EJECUTADOS] },
        periodo: { lte: input.periodo },
        ...(input.excluirGastoId ? { id: { not: input.excluirGastoId } } : {}),
      },
      _sum: { monto_cop: true },
    }),
  ]);
  const programadoCents = programado._sum.valor ? toCents(programado._sum.valor) : BigInt(0);
  const ejecutadoCents = ejecutado._sum.monto_cop ? toCents(ejecutado._sum.monto_cop) : BigInt(0);
  return excedeProgramado({ programado: programadoCents, ejecutado: ejecutadoCents + (input.nuevo ?? BigInt(0)) })
    ? "PROGRAMADO"
    : null;
}

/** A distribution row with the critical level already computed for its own line. */
export type RepartoConCritico = RepartoFactura & { critico: boolean };

/**
 * S9/T14.2-B1: the overspend level of the invoice as a whole, read from each distribution row against its own
 * line — never the header's line with the whole total. The critical level wins; a single-row invoice answers
 * exactly what `nivelSobregasto` answered before, with one call.
 */
export async function nivelSobregastoDeFactura(
  tx: Pick<Prisma.TransactionClient, "gasto" | "programacionPeriodo">,
  repartos: readonly RepartoConCritico[],
  periodo: string,
): Promise<NivelSobregasto> {
  let nivel: NivelSobregasto = null;
  for (const reparto of repartos) {
    const cada = await nivelSobregasto(tx, reparto.linea, { periodo, critico: reparto.critico });
    if (cada === "ASIGNADO") return "ASIGNADO";
    if (cada === "PROGRAMADO") nivel = "PROGRAMADO";
  }
  return nivel;
}

/** One batch's programmed and executed amounts, loaded once instead of once per row. */
export type LoteSobregasto = {
  /** `alerta_sobregasto`: the line's executed total plus this amount passes its assigned total. */
  critico(linea: { id: string; asignado: Cents }, monto: Cents): boolean;
  /** The same two levels as `nivelSobregasto`, answered from the batch's memory. */
  nivel(linea: { id: string; asignado: Cents }, input: { periodo: string; monto: Cents }): NivelSobregasto;
  /** Keeps a row the batch has just written visible to the rows that follow it. */
  registrar(lineaId: string, periodo: string, monto: Cents): void;
};

type PorLinea = Map<string, Map<string, bigint>>;

function acumular(porLinea: PorLinea, lineaId: string, periodo: string, monto: bigint) {
  const periodos = porLinea.get(lineaId) ?? new Map<string, bigint>();
  periodos.set(periodo, (periodos.get(periodo) ?? BigInt(0)) + monto);
  porLinea.set(lineaId, periodos);
}

/** Cumulative through `periodo`: periods are `YYYY-MM`, so the comparison is lexicographic. */
function sumarHasta(porLinea: PorLinea, lineaId: string, periodo: string): bigint {
  let total = BigInt(0);
  for (const [cada, valor] of porLinea.get(lineaId) ?? []) if (cada <= periodo) total += valor;
  return total;
}

function sumarTodo(porLinea: PorLinea, lineaId: string): bigint {
  let total = BigInt(0);
  for (const valor of porLinea.get(lineaId)?.values() ?? []) total += valor;
  return total;
}

/**
 * The importer's overspend arithmetic, loaded once: `programacionPeriodo` and `gasto` grouped by line and
 * period (R4-IMPORT-PREVIEW-NPLUS1 / R4-IMPORT-APPLY-NPLUS1). The rows a batch writes are registered here as
 * they are created, so each one still counts for the ones that follow without going back to the database.
 */
export async function cargarSobregastos(
  tx: Pick<Prisma.TransactionClient, "gasto" | "programacionPeriodo">,
  lineas: readonly { id: string }[],
): Promise<LoteSobregasto> {
  const ids = lineas.map((linea) => linea.id);
  const [programados, ejecutados] = await Promise.all([
    tx.programacionPeriodo.groupBy({ by: ["linea_id", "periodo"], where: { linea_id: { in: ids } }, _sum: { valor: true } }),
    tx.gasto.groupBy({
      by: ["linea_id", "periodo"],
      where: { linea_id: { in: ids }, estado: { in: [...ESTADOS_EJECUTADOS] } },
      _sum: { monto_cop: true },
    }),
  ]);
  const programado: PorLinea = new Map();
  for (const fila of programados) {
    if (fila._sum.valor) acumular(programado, fila.linea_id, fila.periodo, toCents(fila._sum.valor));
  }
  const ejecutado: PorLinea = new Map();
  for (const fila of ejecutados) {
    if (fila._sum.monto_cop) acumular(ejecutado, fila.linea_id, fila.periodo, toCents(fila._sum.monto_cop));
  }

  const critico = (linea: { id: string; asignado: Cents }, monto: Cents) =>
    excederiaAsignado({ asignado: linea.asignado, ejecutado: sumarTodo(ejecutado, linea.id), nuevo: monto });

  return {
    critico,
    nivel(linea, { periodo, monto }) {
      if (critico(linea, monto)) return "ASIGNADO";
      const programadoHasta = sumarHasta(programado, linea.id, periodo);
      const ejecutadoHasta = sumarHasta(ejecutado, linea.id, periodo) + monto;
      return excedeProgramado({ programado: programadoHasta, ejecutado: ejecutadoHasta }) ? "PROGRAMADO" : null;
    },
    registrar(lineaId, periodo, monto) {
      acumular(ejecutado, lineaId, periodo, monto);
    },
  };
}

/**
 * RF-21: a live expense (REGISTRADO or VALIDADO) of ANY project with the same normalized
 * identification and document number. It never blocks. The project code (and the expense id)
 * are revealed only when the actor may read that project.
 */
export async function buscarDuplicados(
  usuario: Usuario,
  gasto: { id: string; proyecto_id: string; tercero_id_norm: string | null; numero_documento_norm: string; estado: EstadoGasto },
): Promise<AlertaGasto[]> {
  if (gasto.tercero_id_norm === null) return [];

  const coincidencias = await db.gasto.findMany({
    where: {
      tercero_id_norm: gasto.tercero_id_norm,
      numero_documento_norm: gasto.numero_documento_norm,
      estado: { in: [...ESTADOS_EJECUTADOS] },
      id: { not: gasto.id },
    },
    select: { id: true, proyecto_id: true, proyecto: { select: { codigo: true } } },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    take: 5,
  });
  // The WHERE clause is `esDuplicado` expressed in SQL (same keys, live estados, another row).
  const reales = coincidencias;
  if (reales.length === 0) return [];

  let legibles = new Set<string>();
  if (canManageProjects(usuario)) {
    legibles = new Set(reales.map((otro) => otro.proyecto_id));
  } else {
    legibles.add(gasto.proyecto_id);
    const otros = reales.map((otro) => otro.proyecto_id).filter((id) => id !== gasto.proyecto_id);
    if (otros.length > 0) {
      const miembros = await db.proyectoMiembro.findMany({
        where: { usuario_id: usuario.id, removed_at: null, proyecto_id: { in: otros } },
        select: { proyecto_id: true },
      });
      for (const miembro of miembros) legibles.add(miembro.proyecto_id);
    }
  }

  return reales.map((otro) => {
    const visible = legibles.has(otro.proyecto_id);
    const donde = visible ? `proyecto ${otro.proyecto.codigo}` : "en otro proyecto";
    return {
      tipo: "DUPLICADO" as const,
      gasto_id: visible ? otro.id : null,
      proyecto_codigo: visible ? otro.proyecto.codigo : null,
      mensaje: `Ya existe un gasto con el mismo NIT/cédula y número de documento (${donde}).`,
    };
  });
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export const GASTO_INCLUDE = {
  linea: { select: { rubro: { select: { id: true, codigo: true, nombre: true } } } },
  /**
   * S9/T14.2-B1: the distribution rows, in write order; the header's line is the first row's line. The
   * `monto_proyectado_cop` of the line feeds the per-row overspend check of a correction.
   */
  repartos: {
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: {
      linea_id: true,
      valor: true,
      linea: {
        select: {
          id: true,
          actividad_id: true,
          monto_proyectado_cop: true,
          rubro: { select: { id: true, codigo: true, nombre: true } },
        },
      },
    },
  },
  soportes: { where: { deleted_at: null }, orderBy: [{ created_at: "asc" }, { id: "asc" }] },
} satisfies Prisma.GastoInclude;

export type GastoConRelaciones = Prisma.GastoGetPayload<{ include: typeof GASTO_INCLUDE }>;

/** A distribution row as both the include and a freshly written row can describe it. */
export type RepartoConLinea = {
  linea_id: string;
  valor: { toString(): string };
  linea: { actividad_id: string | null; rubro: LineaGasto["rubro"] };
};

/** The rows exactly as they were written, in the order the client sent them (the header's line first). */
export function repartosDeLineas(filas: readonly RepartoFactura[]): RepartoConLinea[] {
  return filas.map((fila) => ({
    linea_id: fila.linea.id,
    valor: decimalFromCents(fila.valor),
    linea: { actividad_id: fila.linea.actividad_id, rubro: fila.linea.rubro },
  }));
}

/** A `Gasto` row as the mapper needs it: a hand-built row (the sibling routes' tests) may omit the relation. */
export type GastoVistaFuente = Omit<GastoConRelaciones, "repartos"> & { repartos?: readonly RepartoConLinea[] };

type RepartoGastoView = {
  linea_id: string;
  /** Activity of the line; null on a legacy line with no activity («Sin actividad», D4). */
  actividad_id: string | null;
  rubro: { id: string; codigo: string | null; nombre: string };
  /** Decimal(15,2) as a string. */
  valor: string;
};

type SoporteGastoView = {
  id: string;
  nombre: string;
  tipo: "archivo" | "enlace";
  url_externa: string | null;
  tipo_mime: string | null;
  tamano_bytes: number | null;
  subido_por_id: string;
  created_at: string;
};

export type GastoView = {
  id: string;
  proyecto_id: string;
  rubro: { id: string; codigo: string | null; nombre: string };
  fecha_documento: string;
  periodo: string;
  tipo_soporte: string;
  tercero_nombre: string;
  tercero_tipo_id: string | null;
  /** Omitted for actors who cannot view financial supports (RNF-03). */
  tercero_numero_id?: string | null;
  numero_documento: string;
  descripcion: string;
  /** The Total (Subtotal + IVA): the executed amount. */
  valor: string;
  subtotal: string;
  /** Shown apart for information only; the budget always consumes the Total. */
  iva: string;
  estado: EstadoGasto;
  alerta_sobregasto: boolean;
  /** Derived: the period differs from the month of the document date (AJ-05). */
  periodo_modificado: boolean;
  /** Derived: the third-party type or number is missing, so the expense cannot be validated yet. */
  datos_incompletos: boolean;
  registrado_por_id: string;
  created_at: string;
  /** Optimistic concurrency for a correction: the PATCH pins the value it read (S2/T6). */
  updated_at: string;
  validado_por_id: string | null;
  validado_at: string | null;
  rechazado_por_id: string | null;
  rechazado_at: string | null;
  motivo_rechazo: string | null;
  anulado_por_id: string | null;
  anulado_at: string | null;
  motivo_anulacion: string | null;
  /** Omitted for actors who cannot view financial supports (RNF-03). */
  soportes?: SoporteGastoView[];
  /** Live supports of the expense. Omitted together with `soportes` (RNF-03). */
  soportes_count?: number;
  /**
   * S9/T14.2-B1: the distribution of the invoice: one row per activity + rubro. The first row is the one the
   * header points at (`Gasto.linea_id`); an invoice without `repartos` in the body has exactly one row with its
   * whole total, so the rows always add up to `valor`.
   */
  repartos: RepartoGastoView[];
};

const iso = (value: Date | null) => (value ? value.toISOString() : null);

/** The storage key is never exposed: downloads go through the signed-URL route. */
function toSoporteGastoView(row: GastoConRelaciones["soportes"][number]): SoporteGastoView {
  return {
    id: row.id,
    nombre: row.nombre,
    tipo: row.storage_path ? "archivo" : "enlace",
    url_externa: row.url_externa,
    tipo_mime: row.tipo_mime,
    tamano_bytes: row.tamano_bytes,
    subido_por_id: row.subido_por_id,
    created_at: row.created_at.toISOString(),
  };
}

/** S9/T14.2-B1: one distribution row of the payload, with the activity and the rubro the screen shows. */
function toRepartoView(row: RepartoConLinea): RepartoGastoView {
  return {
    linea_id: row.linea_id,
    actividad_id: row.linea.actividad_id,
    rubro: row.linea.rubro,
    valor: fromCents(toCents(row.valor)),
  };
}

export function toGastoView(row: GastoVistaFuente, opts: { puedeVerSoportes: boolean }): GastoView {
  const repartos = (row.repartos ?? []).map(toRepartoView);
  // The header's line is the line of the first row the client sent: keep that row first in the payload.
  const cabecera = repartos.findIndex((reparto) => reparto.linea_id === row.linea_id);
  if (cabecera > 0) repartos.unshift(...repartos.splice(cabecera, 1));
  const completo = {
    id: row.id,
    proyecto_id: row.proyecto_id,
    rubro: row.linea.rubro,
    fecha_documento: isoDate(row.fecha_documento),
    periodo: row.periodo,
    tipo_soporte: row.tipo_soporte,
    tercero_nombre: row.tercero_nombre,
    tercero_tipo_id: row.tercero_tipo_id,
    tercero_numero_id: row.tercero_numero_id,
    numero_documento: row.numero_documento,
    descripcion: row.descripcion,
    valor: fromCents(toCents(row.monto_cop)),
    subtotal: fromCents(toCents(row.subtotal_cop)),
    iva: fromCents(toCents(row.iva_cop)),
    estado: row.estado,
    alerta_sobregasto: row.alerta_sobregasto,
    periodo_modificado: row.periodo !== periodoPorDefecto(isoDate(row.fecha_documento)),
    datos_incompletos: datosIncompletos(row),
    registrado_por_id: row.registrado_por_id,
    created_at: row.created_at.toISOString(),
    /** Optimistic concurrency for a correction: the PATCH pins the value it read (S2/T6). */
    updated_at: row.updated_at.toISOString(),
    validado_por_id: row.validado_por_id,
    validado_at: iso(row.validado_at),
    rechazado_por_id: row.rechazado_por_id,
    rechazado_at: iso(row.rechazado_at),
    motivo_rechazo: row.motivo_rechazo,
    anulado_por_id: row.anulado_por_id,
    anulado_at: iso(row.anulado_at),
    motivo_anulacion: row.motivo_anulacion,
    soportes: row.soportes.map(toSoporteGastoView),
    soportes_count: row.soportes.length,
    repartos,
  };
  return redactarGasto(completo, opts) as GastoView;
}

export type TotalesGasto = Record<EstadoGasto, { cantidad: number; valor: string }>;

export function totalesPorEstado(rows: readonly { estado: EstadoGasto; monto_cop: { toString(): string } }[]): TotalesGasto {
  const out = {} as TotalesGasto;
  for (const estado of TODOS_LOS_ESTADOS) {
    const delEstado = rows.filter((row) => row.estado === estado);
    out[estado] = {
      cantidad: delEstado.length,
      valor: fromCents(sumCents(delEstado.map((row) => toCents(row.monto_cop)))),
    };
  }
  return out;
}

export type ResumenGastos = {
  /** Expenses that count: REGISTRADO and VALIDADO. */
  vigentes: number;
  /** Vigentes with at least one live support. Omitted without financial-support access (RNF-03). */
  con_soporte?: number;
  /** D5: REGISTRADO with the overspend alert or incomplete data. */
  observados: { cantidad: number; valor: string };
};

export function resumenGastos(
  rows: readonly {
    estado: EstadoGasto;
    monto_cop: { toString(): string };
    alerta_sobregasto: boolean;
    tercero_tipo_id: string | null;
    tercero_numero_id: string | null;
    soportes: readonly unknown[];
  }[],
  opts: { puedeVerSoportes: boolean },
): ResumenGastos {
  const vigentes = rows.filter((row) => ESTADOS_EJECUTADOS.includes(row.estado));
  const observados = rows.filter((row) =>
    esObservado({ estado: row.estado, alerta_sobregasto: row.alerta_sobregasto, datos_incompletos: datosIncompletos(row) }),
  );
  return {
    vigentes: vigentes.length,
    ...(opts.puedeVerSoportes ? { con_soporte: vigentes.filter((row) => row.soportes.length > 0).length } : {}),
    observados: {
      cantidad: observados.length,
      valor: fromCents(sumCents(observados.map((row) => toCents(row.monto_cop)))),
    },
  };
}

// ---------------------------------------------------------------------------
// Audit values (RNF-04)
// ---------------------------------------------------------------------------

/** Last three characters only; the full identification never reaches the ledger. */
function mascara(numero: string | null): string | null {
  if (numero === null) return null;
  const limpio = numero.replace(/[^A-Za-z0-9]/g, "");
  return limpio === "" ? null : `***${limpio.slice(-3)}`;
}

export type GastoAuditable = {
  rubro_id: string;
  fecha_documento: string;
  periodo: string;
  tipo_soporte: string;
  tercero_nombre: string;
  tercero_tipo_id: string | null;
  tercero_numero_id: string | null;
  numero_documento: string;
  descripcion: string;
  subtotal: string;
  iva: string;
  valor: string;
};

export const CAMPOS_AUDITABLES_GASTO = [
  "rubro_id",
  "fecha_documento",
  "periodo",
  "tipo_soporte",
  "tercero_nombre",
  "tercero_tipo_id",
  "tercero_numero_id",
  "numero_documento",
  "descripcion",
  "subtotal",
  "iva",
  "valor",
] as const satisfies readonly (keyof GastoAuditable)[];

export function gastoAuditable(input: {
  rubro_id: string;
  fecha_documento: Date | string;
  periodo: string;
  tipo_soporte: string;
  tercero_nombre: string;
  tercero_tipo_id: string | null;
  tercero_numero_id: string | null;
  numero_documento: string;
  descripcion: string;
  subtotal_cop: { toString(): string };
  iva_cop: { toString(): string };
  monto_cop: { toString(): string };
}): GastoAuditable {
  return {
    rubro_id: input.rubro_id,
    fecha_documento: isoDate(input.fecha_documento),
    periodo: input.periodo,
    tipo_soporte: input.tipo_soporte,
    tercero_nombre: input.tercero_nombre,
    tercero_tipo_id: input.tercero_tipo_id,
    tercero_numero_id: mascara(input.tercero_numero_id),
    numero_documento: input.numero_documento,
    descripcion: input.descripcion,
    subtotal: fromCents(toCents(input.subtotal_cop)),
    iva: fromCents(toCents(input.iva_cop)),
    valor: fromCents(toCents(input.monto_cop)),
  };
}
