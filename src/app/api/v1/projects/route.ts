// GET/POST /api/v1/projects — Proyecto list and creation (RF-01, design.md
// "CRUD de Proyecto con permisos"). Creation is gated by `canCreateProject`
// (management roles only, T9) — a COLABORADOR can later be assigned as
// `responsable_id` and edit that project via `canManageProject`, but cannot
// create one from this route. Read scope mirrors `canViewProject`'s
// per-record rule: a `canViewManagementDashboard` actor (management role or
// the `puede_ver_tablero_gerencial` flag) sees every project; everyone else
// sees only the projects where they are the `responsable`.
//
// `cliente_id` and `oportunidad_id` are NOT interchangeable here: this route
// never accepts `oportunidad_id` in the body (D1/T2) — that value is written
// exclusively by `.../opportunities/:opportunityId/project/route.ts`.

import { NextResponse } from "next/server";
import { z } from "zod";
import type { LineaEstrategica, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { ENUM_VALUES } from "@/lib/catalogs";
import { catalogEnum, parseDate, zodError } from "@/lib/api/crm";
import { logAudit } from "@/lib/api/audit";
import { canCreateProject, canViewManagementDashboard } from "@/lib/permissions";
import { PROJECT_SELECT, toProjectItem } from "@/lib/api/projects";

export const dynamic = "force-dynamic";

export const PROJECT_SCHEMA = z.object({
  codigo: z
    .string()
    .trim()
    .min(1, "El código de proyecto es obligatorio.")
    .max(60, "El código es muy largo."),
  nombre: z.string().trim().min(1, "El nombre es obligatorio.").max(200, "El nombre es muy largo."),
  cliente_id: z.string().min(1, "El cliente es obligatorio."),
  territorio: z.string().trim().min(1, "El territorio es obligatorio.").max(160, "El territorio es muy largo."),
  linea_estrategica: catalogEnum(
    ENUM_VALUES.LineaEstrategica as readonly LineaEstrategica[],
    "Línea estratégica no válida.",
  ),
  fecha_inicio: z.string().refine((v) => parseDate(v) !== null, "Fecha de inicio no válida."),
  fecha_fin: z.string().refine((v) => parseDate(v) !== null, "Fecha de fin no válida."),
  beneficiarios_meta: z.number().int().min(0, "Los beneficiarios meta no pueden ser negativos.").optional(),
  responsable_id: z.string().min(1, "El responsable es obligatorio.").optional(),
});

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los proyectos. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const actor = {
      id: auth.usuario.id,
      rol: auth.usuario.rol,
      puede_ver_tablero_gerencial: auth.usuario.puede_ver_tablero_gerencial,
    };
    const where: Prisma.ProyectoWhereInput = canViewManagementDashboard(actor)
      ? { deleted_at: null }
      : { deleted_at: null, responsable_id: auth.usuario.id };

    // Fase 2b.6: filtro opcional para el CTA "Crear proyecto" del diálogo de
    // oportunidad — le permite mostrar un enlace al proyecto existente en
    // lugar del botón. Mismo alcance de visibilidad que el resto de esta
    // ruta: no es un bypass de canViewProject.
    const oportunidadId = new URL(request.url).searchParams.get("oportunidad_id");
    if (oportunidadId) where.oportunidad_id = oportunidadId;

    const rows = await db.proyecto.findMany({
      where,
      select: PROJECT_SELECT,
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json({
      proyectos: rows.map((r) => toProjectItem(r, { id: auth.usuario.id, rol: auth.usuario.rol })),
    });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos guardar el proyecto. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    if (!canCreateProject({ id: auth.usuario.id, rol: auth.usuario.rol })) {
      return apiError("No tienes permisos para crear proyectos.", 403, "FORBIDDEN");
    }

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = PROJECT_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const cliente = await db.cliente.findFirst({
      where: { id: parsed.data.cliente_id, deleted_at: null },
      select: { id: true },
    });
    if (!cliente) {
      return apiError("El cliente no existe.", 400, "VALIDATION_ERROR");
    }

    const responsable_id = parsed.data.responsable_id ?? auth.usuario.id;
    const responsable = await db.usuario.findFirst({
      where: { id: responsable_id, activo: true },
      select: { id: true },
    });
    if (!responsable) {
      return apiError("El responsable no existe o está inactivo.", 400, "VALIDATION_ERROR");
    }

    const proyecto = await db.proyecto.create({
      data: {
        codigo: parsed.data.codigo,
        nombre: parsed.data.nombre,
        cliente_id: parsed.data.cliente_id,
        territorio: parsed.data.territorio,
        linea_estrategica: parsed.data.linea_estrategica,
        fecha_inicio: parseDate(parsed.data.fecha_inicio)!,
        fecha_fin: parseDate(parsed.data.fecha_fin)!,
        beneficiarios_meta: parsed.data.beneficiarios_meta ?? 0,
        responsable_id,
      },
      select: PROJECT_SELECT,
    });

    await logAudit({
      entidad: "proyecto",
      entidad_id: proyecto.id,
      accion: "crear",
      usuario_id: auth.usuario.id,
      cambios: parsed.data,
    });

    return NextResponse.json(
      { proyecto: toProjectItem(proyecto, { id: auth.usuario.id, rol: auth.usuario.rol }) },
      { status: 201 },
    );
  },
);
