// GET /api/v1/tasks — unified CRM + Kanban task list (PRD §8.2 / HT-19) with
// search, filters and pagination (page >= 1, limit 25 max 100). Reading is
// global: every role sees every task (no per-role scope on the list).
// POST /api/v1/tasks — create. Writing keeps the permission model of clients:
// COLABORADOR can only create tasks with themself as responsable (forced
// below); full roles can assign to anyone.

import { NextResponse } from "next/server";
import type { Prisma, EstadoTarea, OrigenTarea, PrioridadTarea, Usuario } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { ENUM_VALUES } from "@/lib/catalogs";
import { logAudit } from "@/lib/api/audit";
import {
  catalogEnum,
  OPEN_TASK_STATES,
  parseDate,
  parsePagination,
  TASK_SELECT,
  toTaskItem,
  zodError,
} from "@/lib/api/crm";
import { canEditTask } from "@/lib/permissions";

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
 * (estado, origen, vencidas, q, cliente, responsable). Reading is global now:
 * any role can filter by any responsable, so the param is never ignored.
 */
export function parseTaskFilters(
  url: URL,
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
      responsable: sp.get("responsable") ?? undefined,
      cliente: sp.get("cliente") ?? undefined,
      vencidas: sp.get("vencidas") === "true",
    },
  };
}

/**
 * Builds the shared list/export/report `where` including the deleted-rows
 * guard (PRD §8.2 soft delete). No per-role scope: reading tasks is global.
 */
export function buildTaskWhere(filters: TaskFilters, usuario: Usuario): Prisma.TareaWhereInput {
  const where: Prisma.TareaWhereInput = {
    deleted_at: null,
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

export const GET = withApiErrorHandling(
  "tasks",
  "No pudimos cargar las tareas. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const parsed = parseTaskFilters(url);
    if (!parsed.ok) return parsed.response;

    const pagination = parsePagination(url.searchParams, 100);
    if (!pagination.ok) return pagination.response;

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

    // Conteo agregado de subtareas completadas para la página actual:
    // una sola query (groupBy) en lugar de un fetch por tarjeta.
    const hechasPorTarea = new Map<string, number>();
    if (rows.length > 0) {
      const doneCounts = await db.subtarea.groupBy({
        by: ["tarea_id"],
        where: { tarea_id: { in: rows.map((r) => r.id) }, completada: true },
        _count: { _all: true },
      });
      for (const row of doneCounts) hechasPorTarea.set(row.tarea_id, row._count._all);
    }

    return NextResponse.json({
      page: pagination.page,
      limit: pagination.limit,
      total,
      items: rows.map((row) => ({
        ...toTaskItem(row, hechasPorTarea),
        puede_editar: canEditTask(
          {
            responsable_id: row.responsable_id,
            cliente_responsable_id: row.cliente?.responsable_id ?? null,
          },
          { id: auth.usuario.id, rol: auth.usuario.rol },
        ),
      })),
    });
  },
);

export const POST = withApiErrorHandling(
  "tasks",
  "No pudimos guardar la tarea. Inténtalo de nuevo.",
  async (request: Request) => {
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
    await logAudit({
      entidad: "tarea",
      entidad_id: tarea.id,
      accion: "crear",
      usuario_id: auth.usuario.id,
      cambios: parsed.data,
    });
    return NextResponse.json({ task: toTaskItem(tarea) }, { status: 201 });
  },
);