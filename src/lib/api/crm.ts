// Shared helpers for the CRM API (milestone 2): permission model, zod error
// mapping and the reusable clients list-query param parsing shared by
// GET /clients and the xlsx export.
//
// v1 PRAGMATIC permission model (no team/area table exists yet):
//   - ADMINISTRADOR / GERENCIA / COORDINADOR: full read + write everywhere.
//   - COLABORADOR: reads only clients/tasks where they are the responsable
//     (list, detail); writes only on records where they are the responsable.

import type { EstadoTarea, Prisma, RolUsuario, Tarea, Usuario } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";

export const FULL_ACCESS_ROLES: readonly RolUsuario[] = [
  "ADMINISTRADOR",
  "GERENCIA",
  "COORDINADOR",
];

export function isFullAccess(rol: RolUsuario): boolean {
  return FULL_ACCESS_ROLES.includes(rol);
}

/**
 * Read-scope client load: returns the id when the client exists, is not
 * deleted and is inside the caller's scope (COLABORADOR -> responsable self).
 * Null means "404 NOT_FOUND" for the caller.
 */
export async function loadClientScoped(id: string, usuario: Usuario) {
  return db.cliente.findFirst({
    where: {
      id,
      deleted_at: null,
      ...(isFullAccess(usuario.rol) ? {} : { responsable_id: usuario.id }),
    },
    select: { id: true },
  });
}

/**
 * Write access to a client: full roles anywhere; COLABORADOR only when they
 * are the responsable. `ok: false` with code NOT_FOUND (missing/deleted) or
 * FORBIDDEN (visible but not writable).
 */
export async function getClientForWrite(id: string, usuario: Usuario) {
  const cliente = await db.cliente.findFirst({
    where: { id, deleted_at: null },
    select: { id: true, responsable_id: true },
  });
  if (!cliente) return { ok: false as const, code: "NOT_FOUND" as const };
  if (!isFullAccess(usuario.rol) && cliente.responsable_id !== usuario.id) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }
  return { ok: true as const, cliente };
}

/**
 * Read scope for tasks (list/detail): COLABORADOR sees only tasks they are
 * the responsable of. Null means "404 NOT_FOUND" for the caller.
 */
export async function loadTaskScoped(id: string, usuario: Usuario) {
  return db.tarea.findFirst({
    where: {
      id,
      deleted_at: null,
      ...(isFullAccess(usuario.rol) ? {} : { responsable_id: usuario.id }),
    },
    select: { id: true },
  });
}

/**
 * Write access to a task: full roles anywhere; COLABORADOR when they are the
 * task's responsable or the responsable of the linked client.
 */
export async function getTaskForWrite(id: string, usuario: Usuario) {
  const tarea = await db.tarea.findFirst({
    where: { id, deleted_at: null },
    select: {
      id: true,
      responsable_id: true,
      cliente_id: true,
      estado: true,
      motivo_bloqueo: true,
      cliente: { select: { responsable_id: true } },
    },
  });
  if (!tarea) return { ok: false as const, code: "NOT_FOUND" as const };
  if (isFullAccess(usuario.rol) || tarea.responsable_id === usuario.id) {
    return { ok: true as const, tarea };
  }
  if (tarea.cliente && tarea.cliente.responsable_id === usuario.id) {
    return { ok: true as const, tarea };
  }
  return { ok: false as const, code: "FORBIDDEN" as const };
}

/** Tasks in an open state (anything but completed/cancelled). */
export const OPEN_TASK_STATES: { notIn: EstadoTarea[] } = {
  notIn: ["COMPLETADA", "CANCELADA"],
};

/** Light projection used by the clients list (shared with the xlsx export). */
export const CLIENT_BASE_SELECT = {
  id: true,
  nombre: true,
  empresa: true,
  tipo_cliente: true,
  estado: true,
  prioridad: true,
  ubicacion: true,
  responsable_id: true,
  updated_at: true,
  responsable: { select: { nombre: true } },
} as const;

/** Full projection for client detail/create responses. */
export const CLIENT_FULL_SELECT = {
  ...CLIENT_BASE_SELECT,
  tamano_org: true,
  canal_contacto_inicial: true,
  fecha_primer_contacto: true,
  prioridades_identificadas: true,
  riesgos_barreras: true,
  resumen_relacion: true,
  created_at: true,
} as const;

/** zod enum built from a catalog's values, with a Spanish error message. */
export function catalogEnum<T extends string>(values: readonly T[], error: string) {
  return z.enum(values as [T, ...T[]], { error });
}

/** zod failure -> 400 VALIDATION_ERROR envelope (PRD §8.2). */
export function zodError(err: z.ZodError) {
  return apiError(
    err.issues[0]?.message ?? "Datos inválidos.",
    400,
    "VALIDATION_ERROR",
  );
}

/** Accept YYYY-MM-DD or ISO-8601; null when not a real date. */
export function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Makes a date-only string inclusive: "2026-08-07" -> end of that day. */
export function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

export type ClientListFilters = {
  q?: string;
  tipo?: string;
  estado?: string;
  prioridad?: string;
  responsable_id?: string;
  desde?: string;
  hasta?: string;
  valor_min?: number;
  valor_max?: number;
};

/**
 * Parses and validates the shared clients list/export query params. Returns a
 * typed error response (built via apiError) when a param is invalid, mirroring
 * the `{ ok, response }` convention used across the API gate helpers.
 */
export function parseClientListFilters(
  url: URL,
  validTipo: readonly string[],
  validEstado: readonly string[],
  validPrioridad: readonly string[],
):
  | { ok: true; filters: ClientListFilters }
  | { ok: false; response: Response } {
  const sp = url.searchParams;

  const tipo = sp.get("tipo") ?? undefined;
  const estado = sp.get("estado") ?? undefined;
  const prioridad = sp.get("prioridad") ?? undefined;
  if (tipo && !validTipo.includes(tipo)) {
    return { ok: false, response: apiError("Tipo de cliente no válido.", 400, "VALIDATION_ERROR") };
  }
  if (estado && !validEstado.includes(estado)) {
    return { ok: false, response: apiError("Estado de cliente no válido.", 400, "VALIDATION_ERROR") };
  }
  if (prioridad && !validPrioridad.includes(prioridad)) {
    return { ok: false, response: apiError("Prioridad no válida.", 400, "VALIDATION_ERROR") };
  }

  const desde = sp.get("desde") ?? undefined;
  const hasta = sp.get("hasta") ?? undefined;
  if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    return { ok: false, response: apiError("Fecha 'desde' no válida (YYYY-MM-DD).", 400, "VALIDATION_ERROR") };
  }
  if (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return { ok: false, response: apiError("Fecha 'hasta' no válida (YYYY-MM-DD).", 400, "VALIDATION_ERROR") };
  }

  const valorMin = sp.get("valorMin");
  const valorMax = sp.get("valorMax");
  if (valorMin !== null && (!Number.isFinite(Number(valorMin)) || Number(valorMin) < 0)) {
    return { ok: false, response: apiError("Valor mínimo no válido.", 400, "VALIDATION_ERROR") };
  }
  if (valorMax !== null && (!Number.isFinite(Number(valorMax)) || Number(valorMax) < 0)) {
    return { ok: false, response: apiError("Valor máximo no válido.", 400, "VALIDATION_ERROR") };
  }

  return {
    ok: true,
    filters: {
      q: sp.get("q")?.trim() || undefined,
      tipo,
      estado,
      prioridad,
      responsable_id: sp.get("responsable") ?? undefined,
      desde,
      hasta,
      valor_min: valorMin !== null ? Number(valorMin) : undefined,
      valor_max: valorMax !== null ? Number(valorMax) : undefined,
    },
  };
}

/**
 * Page/limit parsing: page >= 1, defaults 1/25. Default max is 1..200
 * (clients); tasks cap at 100 (PRD §8.4 game plan of the tasks module).
 */
export function parsePagination(sp: URLSearchParams, maxLimit = 200) {
  const parse = (raw: string | null, fallback: number): number | null => {
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 ? n : null;
  };
  const page = parse(sp.get("page"), 1);
  if (page === null) {
    return { ok: false as const, response: apiError("Página no válida.", 400, "VALIDATION_ERROR") };
  }
  const limit = parse(sp.get("limit"), 25);
  if (limit === null || limit > maxLimit) {
    return {
      ok: false as const,
      response: apiError(`Límite no válido (1-${maxLimit}).`, 400, "VALIDATION_ERROR"),
    };
  }
  return { ok: true as const, page, limit };
}

/** Projection for task list/detail/create/status responses (CRM + Kanban). */
export const TASK_SELECT = {
  id: true,
  titulo: true,
  descripcion: true,
  responsable_id: true,
  cliente_id: true,
  estado: true,
  origen: true,
  prioridad: true,
  fecha_entrega: true,
  etiquetas: true,
  motivo_bloqueo: true,
  created_at: true,
  updated_at: true,
  responsable: { select: { nombre: true } },
  cliente: { select: { nombre: true } },
  _count: { select: { comentarios: true } },
} as const;

export type TaskRow = Prisma.TareaGetPayload<{ select: typeof TASK_SELECT }>;

export type TaskItem = {
  id: string;
  titulo: string;
  descripcion: string | null;
  responsable_id: string;
  responsable_nombre: string;
  cliente_id: string | null;
  cliente_nombre: string | null;
  estado: Tarea["estado"];
  origen: Tarea["origen"];
  prioridad: Tarea["prioridad"];
  fecha_entrega: Tarea["fecha_entrega"];
  etiquetas: string[];
  motivo_bloqueo: string | null;
  comentarios_count: number;
  created_at: Date;
  updated_at: Date;
};

/** Row -> JSON shape shared by every task endpoint. */
export function toTaskItem(tarea: TaskRow): TaskItem {
  return {
    id: tarea.id,
    titulo: tarea.titulo,
    descripcion: tarea.descripcion,
    responsable_id: tarea.responsable_id,
    responsable_nombre: tarea.responsable.nombre,
    cliente_id: tarea.cliente_id,
    cliente_nombre: tarea.cliente?.nombre ?? null,
    estado: tarea.estado,
    origen: tarea.origen,
    prioridad: tarea.prioridad,
    fecha_entrega: tarea.fecha_entrega,
    etiquetas: tarea.etiquetas,
    motivo_bloqueo: tarea.motivo_bloqueo,
    comentarios_count: tarea._count.comentarios,
    created_at: tarea.created_at,
    updated_at: tarea.updated_at,
  };
}