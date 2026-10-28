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
import { MONTO_MAXIMO_CENTS, parseMonto } from "@/lib/api/presupuesto";
import { PROYECTO_NO_EXISTE } from "@/lib/api/ejecucion";
import { excederiaAsignado } from "@/lib/proyectos/ficha-financiera";
import {
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
export const GASTO_NO_EXISTE = "El gasto no existe.";
export const SIN_SOPORTE_MESSAGE = "Adjunta al menos un soporte (archivo o enlace).";
/** An expense without a live support cannot be validated (imported expenses start without one). */
export const SIN_SOPORTE_VALIDAR_MESSAGE = "Adjunta al menos un soporte al gasto antes de validarlo.";
export const MAX_SOPORTES = 5;
export const MAX_SOPORTES_MESSAGE = `Puedes adjuntar máximo ${MAX_SOPORTES} soportes.`;
export const RUBRO_SIN_ASIGNADO_MESSAGE = "Solo puedes registrar gastos en rubros con valor asignado.";
export const PERIODO_FUERA_MESSAGE = "El periodo debe corresponder a un mes del proyecto.";
export const PROYECTO_SIN_FECHAS_MESSAGE = "El proyecto no tiene fechas definidas.";
export const GASTO_VALIDADO_MESSAGE = "Un gasto validado no se puede editar.";
export const GASTO_ANULADO_MESSAGE = "Un gasto anulado no se puede editar.";
export const VALOR_POSITIVO_MESSAGE = "El valor debe ser mayor que cero.";
export const SUBTOTAL_POSITIVO_MESSAGE = "El subtotal debe ser mayor que cero.";
export const IVA_NEGATIVO_MESSAGE = "El IVA no puede ser negativo.";
export const TOTAL_ALTO_MESSAGE = "El total (subtotal más IVA) es demasiado alto.";
export const PERIODO_DOCUMENTO_FUERA_MESSAGE =
  "La fecha del documento está fuera de los meses del proyecto: elige el periodo.";

export const ESTADOS_EDITABLES: EstadoGasto[] = ["REGISTRADO", "RECHAZADO"];
const ESTADOS_VIVOS: EstadoGasto[] = ["REGISTRADO", "VALIDADO"];
const TODOS_LOS_ESTADOS: EstadoGasto[] = ["REGISTRADO", "VALIDADO", "RECHAZADO", "ANULADO"];

// ---------------------------------------------------------------------------
// Body schemas
// ---------------------------------------------------------------------------

const texto = (etiqueta: string, max: number) =>
  z
    .string({ error: `${etiqueta} es obligatorio.` })
    .trim()
    .min(1, `${etiqueta} es obligatorio.`)
    .max(max, `${etiqueta} es demasiado largo.`);

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
  descripcion: texto("La descripción", 1000),
  subtotal: z.union([z.string(), z.number()], { error: "Ingresa un subtotal válido." }),
  iva: z.union([z.string(), z.number()], { error: "Ingresa un IVA válido (puede ser 0)." }),
};

export const GASTO_CREATE_SCHEMA = z
  .object({
    rubro_id: GASTO_FIELDS.rubro_id,
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

export const GASTO_PATCH_SCHEMA = z
  .object({
    rubro_id: GASTO_FIELDS.rubro_id.optional(),
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
  })
  .strict();

/** One row of an expense: the create body without its supports (the Excel import carries none). */
export const GASTO_FILA_SCHEMA = GASTO_CREATE_SCHEMA.omit({ soportes: true });

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

/** A strictly positive amount in exact cents (decimal string or number, max two decimals), without HTTP. */
export function evaluarValorGasto(value: unknown): { ok: true; cents: Cents } | { ok: false; message: string } {
  const parsed = parseMonto(value);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  if (parsed.cents <= BigInt(0)) return { ok: false, message: VALOR_POSITIVO_MESSAGE };
  return { ok: true, cents: parsed.cents };
}

/** A strictly positive amount in exact cents (decimal string or number, max two decimals). */
export function parseValorGasto(value: unknown): { ok: true; cents: Cents } | { ok: false; response: Response } {
  const evaluated = evaluarValorGasto(value);
  if (!evaluated.ok) return { ok: false, response: apiError(evaluated.message, 400, "VALIDATION_ERROR") };
  return evaluated;
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

/** A rubro only takes expenses while its assigned amount is above zero. */
export function tieneAsignado(monto: { toString(): string }): boolean {
  return toCents(monto) > BigInt(0);
}

/** The budget line of a rubro in the project; the rubro needs an assigned amount above zero. */
export async function resolverLinea(
  proyectoId: string,
  rubroId: string,
): Promise<{ ok: true; value: LineaGasto } | { ok: false; response: Response }> {
  const linea = await db.lineaPresupuestal.findFirst({
    where: { proyecto_id: proyectoId, rubro_id: rubroId },
    select: { id: true, monto_proyectado_cop: true, rubro: { select: { id: true, codigo: true, nombre: true } } },
  });
  if (!linea || !tieneAsignado(linea.monto_proyectado_cop)) {
    return { ok: false, response: apiError(RUBRO_SIN_ASIGNADO_MESSAGE, 400, "VALIDATION_ERROR") };
  }
  return { ok: true, value: { id: linea.id, asignado: toCents(linea.monto_proyectado_cop), rubro: linea.rubro } };
}

/** The period must be a month of the project; it defaults to the month of the document date. Without HTTP. */
export function evaluarPeriodo(
  proyecto: Pick<GastoProyecto, "fecha_inicio" | "fecha_fin">,
  fechaDocumento: string,
  periodo: string | undefined,
): { ok: true; value: string } | { ok: false; message: string } {
  if (!proyecto.fecha_inicio || !proyecto.fecha_fin) return { ok: false, message: PROYECTO_SIN_FECHAS_MESSAGE };
  const periodos = projectPeriods(isoDate(proyecto.fecha_inicio), isoDate(proyecto.fecha_fin));
  const elegido = periodo ?? periodoPorDefecto(fechaDocumento);
  if (!periodoEnProyecto(elegido, periodos)) return { ok: false, message: PERIODO_FUERA_MESSAGE };
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

/** Early warning: would the VALIDADO total of the line plus `nuevo` exceed the assigned amount. */
export async function superaAsignado(
  tx: Pick<Prisma.TransactionClient, "gasto">,
  linea: { id: string; asignado: Cents },
  nuevo: Cents,
  excluirGastoId?: string,
): Promise<boolean> {
  const total = await tx.gasto.aggregate({
    where: { linea_id: linea.id, estado: "VALIDADO", ...(excluirGastoId ? { id: { not: excluirGastoId } } : {}) },
    _sum: { monto_cop: true },
  });
  const validado = total._sum.monto_cop ? toCents(total._sum.monto_cop) : BigInt(0);
  return excederiaAsignado({ asignado: linea.asignado, validado, nuevo });
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
  | { tipo: "DUPLICADO"; gasto_id: string | null; proyecto_codigo: string | null; mensaje: string };

export const SOBREGASTO_ADVERTENCIA =
  "Este gasto, sumado a los gastos validados, superaría el valor asignado al rubro.";

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
      estado: { in: ESTADOS_VIVOS },
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
  soportes: { where: { deleted_at: null }, orderBy: [{ created_at: "asc" }, { id: "asc" }] },
} satisfies Prisma.GastoInclude;

export type GastoConRelaciones = Prisma.GastoGetPayload<{ include: typeof GASTO_INCLUDE }>;

export type SoporteGastoView = {
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
  /** Derived: the third-party type or number is missing, so the expense cannot be validated yet. */
  datos_incompletos: boolean;
  registrado_por_id: string;
  created_at: string;
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

export function toGastoView(row: GastoConRelaciones, opts: { puedeVerSoportes: boolean }): GastoView {
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
    datos_incompletos: datosIncompletos(row),
    registrado_por_id: row.registrado_por_id,
    created_at: row.created_at.toISOString(),
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
  const vigentes = rows.filter((row) => ESTADOS_VIVOS.includes(row.estado));
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
export function mascara(numero: string | null): string | null {
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
