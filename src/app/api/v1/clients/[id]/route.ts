// GET /api/v1/clients/:id — full record + responsable nombre + counts.
// PATCH /api/v1/clients/:id — partial update (any Cliente field except
//   id / created_at / deleted_at). Full roles anywhere; COLABORADOR only on
//   their own clients and cannot transfer the record to another responsable.
// DELETE /api/v1/clients/:id — soft delete (deleted_at = now), same scope.
// 404 for missing/deleted; 403 when the record is visible but not writable.

import { NextResponse } from "next/server";
import type {
  EstadoCliente,
  Prisma,
  PrioridadCliente,
  TipoCliente,
} from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { ENUM_VALUES } from "@/lib/catalogs";
import { logAudit } from "@/lib/api/audit";
import {
  catalogEnum,
  CLIENT_FULL_SELECT,
  isFullAccess,
  OPEN_TASK_STATES,
  parseDate,
  zodError,
} from "@/lib/api/crm";
import { canManageAny } from "@/lib/permissions";
import { enrichClients } from "@/app/api/v1/clients/route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH_CLIENT_SCHEMA = z.object({
  nombre: z.string().trim().min(1, "El nombre no puede estar vacío.").max(200, "El nombre es muy largo.").optional(),
  tipo_cliente: catalogEnum(
    ENUM_VALUES.TipoCliente as readonly TipoCliente[],
    "Tipo de cliente no válido.",
  ).optional(),
  empresa: z.string().nullable().optional(),
  tamano_org: z.string().nullable().optional(),
  ubicacion: z.string().nullable().optional(),
  canal_contacto_inicial: z.string().nullable().optional(),
  fecha_primer_contacto: z
    .string()
    .refine((v) => parseDate(v) !== null, "Fecha de primer contacto no válida.")
    .nullable()
    .optional(),
  prioridad: catalogEnum(
    ENUM_VALUES.PrioridadCliente as readonly PrioridadCliente[],
    "Prioridad no válida.",
  )
    .nullable()
    .optional(),
  estado: catalogEnum(
    ENUM_VALUES.EstadoCliente as readonly EstadoCliente[],
    "Estado de cliente no válido.",
  ).optional(),
  prioridades_identificadas: z.string().nullable().optional(),
  riesgos_barreras: z.string().nullable().optional(),
  resumen_relacion: z.string().nullable().optional(),
  responsable_id: z.string().optional(),
});

export const GET = withApiErrorHandling(
  "clients",
  "No pudimos cargar el cliente. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const cliente = await db.cliente.findFirst({
      where: {
        id,
        deleted_at: null,
        ...(isFullAccess(auth.usuario.rol) ? {} : { responsable_id: auth.usuario.id }),
      },
      select: {
        ...CLIENT_FULL_SELECT,
        _count: {
          select: {
            contactos: { where: { deleted_at: null } },
            oportunidades: { where: { deleted_at: null } },
            bitacora: true,
            tareas: { where: { deleted_at: null, estado: OPEN_TASK_STATES } },
          },
        },
      },
    });
    if (!cliente) {
      return apiError("El cliente no existe.", 404, "NOT_FOUND");
    }

    const [enriched] = await enrichClients([cliente.id], [{ id: cliente.id }]);

    const { _count, ...record } = cliente;
    return NextResponse.json({
      cliente: {
        ...record,
        responsable_nombre: record.responsable.nombre,
        contactos_count: _count.contactos,
        oportunidades_count: _count.oportunidades,
        bitacora_count: _count.bitacora,
        tareas_abiertas_count: _count.tareas,
        compromisos_abiertos: enriched.compromisos_abiertos,
        valor_potencial: enriched.valor_potencial,
        next_compromiso: enriched.next_compromiso,
      },
    });
  },
);

export const PATCH = withApiErrorHandling(
  "clients",
  "No pudimos actualizar el cliente. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = PATCH_CLIENT_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    // BUG FIX: this used to check the built `data` object's key count AFTER
    // `responsable_id` was excluded from it — a body containing ONLY
    // `responsable_id` built an empty `data` and got rejected with "Envía al
    // menos un campo" before the reassignment logic below ever ran. Check
    // what the client actually sent instead.
    if (Object.keys(parsed.data).length === 0) {
      return apiError("Envía al menos un campo para actualizar.", 400, "VALIDATION_ERROR");
    }

    const cliente = await db.cliente.findFirst({ where: { id, deleted_at: null } });
    if (!cliente) {
      return apiError("El cliente no existe.", 404, "NOT_FOUND");
    }
    if (!canManageAny(auth.usuario.rol) && cliente.responsable_id !== auth.usuario.id) {
      return apiError("No tienes permisos para actualizar este cliente.", 403, "FORBIDDEN");
    }

    // COLABORADOR cannot hand the client over to another responsable.
    if (
      !canManageAny(auth.usuario.rol) &&
      parsed.data.responsable_id !== undefined &&
      parsed.data.responsable_id !== auth.usuario.id
    ) {
      return apiError(
        "No puedes cambiar el responsable de un cliente que no es tuyo.",
        403,
        "FORBIDDEN",
      );
    }

    const data: Prisma.ClienteUncheckedUpdateInput = {};
    if (parsed.data.nombre !== undefined) data.nombre = parsed.data.nombre;
    if (parsed.data.tipo_cliente !== undefined) data.tipo_cliente = parsed.data.tipo_cliente;
    if (parsed.data.empresa !== undefined) data.empresa = parsed.data.empresa;
    if (parsed.data.tamano_org !== undefined) data.tamano_org = parsed.data.tamano_org;
    if (parsed.data.ubicacion !== undefined) data.ubicacion = parsed.data.ubicacion;
    if (parsed.data.canal_contacto_inicial !== undefined) {
      data.canal_contacto_inicial = parsed.data.canal_contacto_inicial;
    }
    if (parsed.data.prioridad !== undefined) data.prioridad = parsed.data.prioridad;
    if (parsed.data.estado !== undefined) data.estado = parsed.data.estado;
    if (parsed.data.prioridades_identificadas !== undefined) {
      data.prioridades_identificadas = parsed.data.prioridades_identificadas;
    }
    if (parsed.data.riesgos_barreras !== undefined) data.riesgos_barreras = parsed.data.riesgos_barreras;
    if (parsed.data.resumen_relacion !== undefined) data.resumen_relacion = parsed.data.resumen_relacion;
    if (parsed.data.fecha_primer_contacto !== undefined) {
      data.fecha_primer_contacto =
        parsed.data.fecha_primer_contacto === null
          ? null
          : parseDate(parsed.data.fecha_primer_contacto);
    }

    if (parsed.data.responsable_id !== undefined) {
      const nuevoResponsable = await db.usuario.findFirst({
        where: { id: parsed.data.responsable_id, activo: true },
      });
      if (!nuevoResponsable) {
        return apiError("El responsable no existe o está inactivo.", 400, "VALIDATION_ERROR");
      }
      data.responsable_id = parsed.data.responsable_id;
    }

    const updated = await db.cliente.update({
      where: { id },
      data,
      select: CLIENT_FULL_SELECT,
    });
    await logAudit({
      entidad: "cliente",
      entidad_id: id,
      accion: "editar",
      usuario_id: auth.usuario.id,
      cambios: parsed.data,
    });
    return NextResponse.json({ cliente: { ...updated, responsable_nombre: updated.responsable.nombre } });
  },
);

export const DELETE = withApiErrorHandling(
  "clients",
  "No pudimos eliminar el cliente. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const cliente = await db.cliente.findFirst({ where: { id, deleted_at: null } });
    if (!cliente) {
      return apiError("El cliente no existe.", 404, "NOT_FOUND");
    }
    if (!canManageAny(auth.usuario.rol) && cliente.responsable_id !== auth.usuario.id) {
      return apiError("No tienes permisos para eliminar este cliente.", 403, "FORBIDDEN");
    }

    await db.cliente.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    await logAudit({
      entidad: "cliente",
      entidad_id: id,
      accion: "eliminar",
      usuario_id: auth.usuario.id,
    });
    return new NextResponse(null, { status: 204 });
  },
);
