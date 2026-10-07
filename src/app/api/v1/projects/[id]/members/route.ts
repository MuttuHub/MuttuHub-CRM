// GET /api/v1/projects/:id/members — ACTIVE team members (contract E-07, P02).
// POST /api/v1/projects/:id/members — add a COORDINADOR to the team (E-07, P07).
//
// Authorization follows the other project routes: the project is read first, so
// a missing or soft-deleted one answers 404, and only then the actor is
// checked. GET reuses the membership-aware read scope (`loadProjectScoped` +
// `canReadProject`, the same gate as the ficha); POST is a manager-only action
// (`canManageProjects`, P07).
//
// The "already an active member" conflict is NOT a read-then-write check: the
// partial unique index `proyecto_miembros_activo_uq` is the guard and its P2002
// maps to 409, so a concurrent add cannot slip a second active row through.
// Re-adding a previously removed member inserts a new row and succeeds.
//
// The add is audited as `CREAR proyecto_miembro` inside the same transaction
// (REQ-ACC-07): a failed audit rolls the membership back with it.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { canManageProjects } from "@/lib/permissions";
import { logChange } from "@/lib/api/audit-cambios";
import {
  PROYECTO_MIEMBRO_SELECT,
  canReadProject,
  loadProjectScoped,
  toProyectoMiembroItemV2,
} from "@/lib/api/projects";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** E-07 body: only the user being added. */
export const MIEMBRO_CREATE_SCHEMA = z.object({
  usuario_id: z.string().min(1, "El usuario no es válido."),
});

/** Message the SDD's REQ-ACC-07 scenario quotes for a non-COORDINADOR target. */
const NOT_COORDINADOR_MESSAGE =
  "Solo un Coordinador puede ser integrante del equipo del proyecto.";

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar el equipo del proyecto. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    // Same existence read as the ficha: it folds the membership probe in, so
    // `es_miembro` is resolved from `proyecto_miembros` before deciding.
    const scoped = await loadProjectScoped(auth.usuario, id, { id: true });
    if (!scoped) {
      return apiError("El proyecto no existe.", 404, "NOT_FOUND");
    }

    // 404 before 403: existence is settled, visibility is a read-scope decision.
    if (!canReadProject(auth.usuario, scoped.es_miembro)) {
      return apiError("No tienes permisos sobre este proyecto.", 403, "FORBIDDEN");
    }

    const miembros = await db.proyectoMiembro.findMany({
      where: { proyecto_id: id, removed_at: null },
      select: PROYECTO_MIEMBRO_SELECT,
      // Deterministic: rows of one transaction share `created_at`.
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });

    return NextResponse.json({ miembros: miembros.map(toProyectoMiembroItemV2) });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos agregar al integrante. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    // Plain existence read: the manager gate does not need a membership probe,
    // and a non-manager is denied with 403 after the 404.
    const proyecto = await db.proyecto.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (!proyecto) {
      return apiError("El proyecto no existe.", 404, "NOT_FOUND");
    }

    if (!canManageProjects(auth.usuario)) {
      return apiError("No tienes permisos sobre este proyecto.", 403, "FORBIDDEN");
    }

    const body = await parseJsonBody<Record<string, unknown>>(request);
    // A syntactically valid JSON scalar (`"x"`, 42, false) is not a body:
    // `usuario_id in body` would throw on a primitive and surface as 500.
    if (body === null || typeof body !== "object") {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }

    const parsed = MIEMBRO_CREATE_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return apiError(
        parsed.error.issues[0]?.message ?? "Datos no válidos.",
        400,
        "VALIDATION_ERROR",
      );
    }

    // Only COORDINADOR users may be executor members, and only while the
    // account is active — the same `activo: true` rule the responsable pickers
    // and every other assignment path apply (REQ-ACC-07).
    const usuario = await db.usuario.findFirst({
      where: { id: parsed.data.usuario_id },
      select: { id: true, rol: true, activo: true },
    });
    if (!usuario) {
      return apiError("El usuario no existe.", 400, "VALIDATION_ERROR");
    }
    if (!usuario.activo) {
      return apiError("El usuario no existe o está inactivo.", 400, "VALIDATION_ERROR");
    }
    if (usuario.rol !== "COORDINADOR") {
      return apiError(NOT_COORDINADOR_MESSAGE, 400, "VALIDATION_ERROR");
    }

    try {
      const row = await db.$transaction(async (tx) => {
        const created = await tx.proyectoMiembro.create({
          data: {
            proyecto_id: id,
            usuario_id: usuario.id,
            agregado_por_id: auth.usuario.id,
          },
          select: PROYECTO_MIEMBRO_SELECT,
        });

        await logChange(tx, {
          usuario_id: auth.usuario.id,
          accion: "CREAR",
          entidad: "proyecto_miembro",
          entidad_id: created.id,
          proyecto_id: id,
          valor_nuevo: { usuario_id: usuario.id, agregado_por_id: auth.usuario.id },
        });

        return created;
      });

      return NextResponse.json({ miembro: toProyectoMiembroItemV2(row) }, { status: 201 });
    } catch (err) {
      // The partial unique index is the real guard: a read-then-write check
      // would race. Its name is in the driver error, so an unrelated unique
      // violation still surfaces as 500.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        JSON.stringify(err.meta ?? {}).includes("proyecto_miembros_activo_uq")
      ) {
        return apiError("Este usuario ya es integrante del equipo del proyecto.", 409, "CONFLICT");
      }
      throw err;
    }
  },
);
