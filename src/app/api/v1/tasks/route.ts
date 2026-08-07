// GET /api/v1/tasks — unified CRM + Kanban task list (PRD §8.2 / HT-19) with
// search, filters and pagination (page >= 1, limit 25 max 100).
// POST /api/v1/tasks — create. Same permission model as clients: full roles
// see/edit everything; COLABORADOR only their own tasks (and on create the
// responsable is forced to self).

import { NextResponse } from "next/server";
import type { Prisma, EstadoTarea, OrigenTarea, PrioridadTarea, Usuario } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/supabase/server";
import { ENUM_VALUES } from "@/lib/catalogs";
import {
  catalogEnum,
  isFullAccess,
  OPEN_TASK_STATES,
  parseDate,
  parsePagination,
  TASK_SELECT,
  toTaskItem,
  zodError,
} from "@/lib/api/crm";

export const dynamic = "force-dynamic";

const ESTADOS = ENUM_VALUES.EstadoTarea as readonly EstadoTarea[];
const ORIGENES = ENUM_VALUES.OrigenTarea as readonly OrigenTarea[];

export type TaskFilters = {
  q?: string;
  estado?: string;
  origen?: string;
  responsable?: string;
  cliente?: string;
  vencidas: boolean;
};

/**
 * Parses and validates the shared tasks list/export/report query params
 * (estado, origen, vencidas, q, cliente, responsable). COLABORADOR can never
 * request a foreign responsable — their scope is forced downstream in
 * buildTaskWhere and the param is ignored here (same rule as clients).
 */
export function parseTaskFilters(
  url: URL,
  rol: Usuario["rol"],
):
  | { ok: true; filters: TaskFilters }
  | { ok: false; response: Response } {
  const sp = url.searchParams;

  const estadoRaw = sp.get("estado") ?? undefined;
  if (estadoRaw && !ESTADOS.includes(estadoRaw as EstadoTarea)) {
    return { ok: false, response: apiError("Estado de tarea no válido.", 400, "VALIDATION_ERROR") };
  }
  const origenRaw = sp.get("origen") ?? undefined;
  if (origenRaw && !ORIGENES.includes(origenRaw as OrigenTarea)) {
    return { ok: false, response: apiError("Origen no válido.", 400, "VALIDATION_ERROR") };
  }

  return {
    ok: true,
    filters: {
      q: sp.get("q")?.trim() || undefined,
      estado: estadoRaw,
      origen: origenRaw,
      responsable:
        rol === "COLABORADOR" ? undefined : (sp.get("responsable") ?? undefined),
      cliente: sp.get("cliente") ?? undefined,
      vencidas: sp.get("vencidas") === "true",
    },
  };
}

/**
 * Builds the shared list/export/report `where` including the COLABORADOR
 * scope (their tasks only) and the deleted-rows guard (PRD §8.2 soft delete).
 */
export function buildTaskWhere(filters: TaskFilters, usuario: Usuario): Prisma.TareaWhereInput {
  const where: Prisma.TareaWhereInput = {
    deleted_at: null,
    ...(isFullAccess(usuario.rol) ? {} : { responsable_id: usuario.id }),
  };
  const q = filters.q;
  if (q) {
    where.OR = [
      { titulo: { contains: q, mode: "insensitive" } },
      { descripcion: { contains: q, mode: "insensitive" } },
      { cliente: { nombre: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (filters.responsable) where.responsable_id = filters.responsable;
  if (filters.estado) where.estado = filters.estado as EstadoTarea;
  if (filters.origen) where.origen = filters.origen as OrigenTarea;
  if (filters.cliente) where.cliente_id = filters.cliente;
  if (filters.vencidas) {
    where.fecha_entrega = { lt: new Date() };
    where.estado = OPEN_TASK_STATES;
  }
  return where;
}

export const TASK_SCHEMA = z.object({
  titulo: z
    .string()
    .trim()
    .min(1, "El título de la tarea es obligatorio.")
    .max(200, "El título es muy largo."),
  descripcion: z.string().max(2000, "La descripción es muy larga.").nullable().optional(),
  responsable_id: z.string().min(1, "El responsable es obligatorio."),
  cliente_id: z.string().optional(),
  estado: catalogEnum(ESTADOS, "Estado de tarea no válido.").optional(),
  origen: catalogEnum(ORIGENES, "Origen no válido.").optional(),
  prioridad: catalogEnum(
    ENUM_VALUES.PrioridadTarea as readonly PrioridadTarea[],
    "Prioridad no válida.",
  )
    .nullable()
    .optional(),
  fecha_entrega: z
    .string()
    .refine((v) => parseDate(v) !== null, "Fecha de entrega no válida.")
    .nullable()
    .optional(),
  etiquetas: z
    .array(z.string().trim().min(1, "Hay una etiqueta vacía.").max(50, "Etiqueta muy larga."))
    .max(20, "Demasiadas etiquetas (máximo 20).")
    .nullable()
    .optional(),
  motivo_bloqueo: z.string().trim().max(2000, "El motivo de bloqueo es muy largo.").nullable().optional(),
});

// motivo_bloqueo is mandatory exactly when the task ends up BLOQUEADA.
export function bloqueoValido(estado: string | undefined, motivo: string | null | undefined): boolean {
  if (estado !== "BLOQUEADA") return true;
  return typeof motivo === "string" && motivo.trim().length > 0;
}

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = parseTaskFilters(url, auth.usuario.rol);
  if (!parsed.ok) return parsed.response;

  const pagination = parsePagination(url.searchParams, 100);
  if (!pagination.ok) return pagination.response;

  try {
    const where = buildTaskWhere(parsed.filters, auth.usuario);

    const [rows, total] = await Promise.all([
      db.tarea.findMany({
        where,
        select: TASK_SELECT,
        orderBy: { updated_at: "desc" },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      db.tarea.count({ where }),
    ]);

    return NextResponse.json({
      page: pagination.page,
      limit: pagination.limit,
      total,
      items: rows.map(toTaskItem),
    });
  } catch (err) {
    console.error("[tasks] list failed:", err);
    return apiError("No pudimos cargar las tareas. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody<unknown>(request);
  if (body === null) {
    return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
  }
  const parsed = TASK_SCHEMA.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  if (!bloqueoValido(parsed.data.estado, parsed.data.motivo_bloqueo)) {
    return apiError("Indica un motivo para bloquear.", 400, "VALIDATION_ERROR");
  }

  try {
    // COLABORADOR can only create tasks they will be the responsable of.
    const responsable_id =
      auth.usuario.rol === "COLABORADOR" ? auth.usuario.id : parsed.data.responsable_id;

    const responsable = await db.usuario.findFirst({
      where: { id: responsable_id, activo: true },
      select: { id: true, nombre: true },
    });
    if (!responsable) {
      return apiError("El responsable no existe o está inactivo.", 400, "VALIDATION_ERROR");
    }

    if (parsed.data.cliente_id) {
      const cliente = await db.cliente.findFirst({
        where: { id: parsed.data.cliente_id, deleted_at: null },
        select: { id: true },
      });
      if (!cliente) {
        return apiError("El cliente no existe o fue eliminado.", 400, "VALIDATION_ERROR");
      }
    }

    const tarea = await db.tarea.create({
      data: {
        titulo: parsed.data.titulo,
        descripcion: parsed.data.descripcion?.trim() || null,
        responsable_id,
        cliente_id: parsed.data.cliente_id,
        estado: parsed.data.estado ?? "POR_HACER",
        origen: parsed.data.origen ?? "KANBAN",
        prioridad: parsed.data.prioridad,
        fecha_entrega:
          parsed.data.fecha_entrega === undefined || parsed.data.fecha_entrega === null
            ? undefined
            : parseDate(parsed.data.fecha_entrega),
        etiquetas: parsed.data.etiquetas ?? [],
        motivo_bloqueo: parsed.data.motivo_bloqueo?.trim() || null,
      },
      select: TASK_SELECT,
    });
    return NextResponse.json({ task: toTaskItem(tarea) }, { status: 201 });
  } catch (err) {
    console.error("[tasks] create failed:", err);
    return apiError("No pudimos guardar la tarea. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}