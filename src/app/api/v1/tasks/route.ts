// GET /api/v1/tasks — unified CRM + Kanban task list (PRD §8.2 / HT-19) with
// search, filters and pagination (page >= 1, limit 25 max 100).
// POST /api/v1/tasks — create. Same permission model as clients: full roles
// see/edit everything; COLABORADOR only their own tasks (and on create the
// responsable is forced to self).

import { NextResponse } from "next/server";
import type { Prisma, EstadoTarea, OrigenTarea, PrioridadTarea } from "@prisma/client";
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
  const sp = url.searchParams;

  const estadoRaw = sp.get("estado") ?? undefined;
  if (estadoRaw && !ESTADOS.includes(estadoRaw as EstadoTarea)) {
    return apiError("Estado de tarea no válido.", 400, "VALIDATION_ERROR");
  }
  const origenRaw = sp.get("origen") ?? undefined;
  if (origenRaw && !ORIGENES.includes(origenRaw as OrigenTarea)) {
    return apiError("Origen no válido.", 400, "VALIDATION_ERROR");
  }
  const vencidas = sp.get("vencidas") === "true";
  // COLABORADOR is scoped to their own tasks and cannot count foreign ones.
  const responsable_id =
    auth.usuario.rol === "COLABORADOR" ? auth.usuario.id : (sp.get("responsable") ?? undefined);

  const pagination = parsePagination(sp, 100);
  if (!pagination.ok) return pagination.response;

  try {
    const where: Prisma.TareaWhereInput = {
      deleted_at: null,
      ...(isFullAccess(auth.usuario.rol) ? {} : { responsable_id: auth.usuario.id }),
    };
    const q = sp.get("q")?.trim();
    if (q) {
      where.OR = [
        { titulo: { contains: q, mode: "insensitive" } },
        { descripcion: { contains: q, mode: "insensitive" } },
        { cliente: { nombre: { contains: q, mode: "insensitive" } } },
      ];
    }
    if (responsable_id) where.responsable_id = responsable_id;
    if (estadoRaw) where.estado = estadoRaw as EstadoTarea;
    if (origenRaw) where.origen = origenRaw as OrigenTarea;
    const clienteId = sp.get("cliente") ?? undefined;
    if (clienteId) where.cliente_id = clienteId;
    if (vencidas) {
      where.fecha_entrega = { lt: new Date() };
      where.estado = OPEN_TASK_STATES;
    }

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