// GET /api/v1/projects/:id/allies — the allies of a posición propia project (T4b, S9).
// POST /api/v1/projects/:id/allies — link a client as an ally (S9, S13).
//
// GET follows the ficha's read scope (`loadProjectScoped` + `canReadProject`); a project of another
// origin simply has none. Writes go through `gateEscrituraAliados`: 404, then 403 without
// `canEditProjectData` (S14 default until D3), then 409 for a project that is not posición propia
// or is frozen. A client is an ally once per project: the unique `(proyecto_id, cliente_id)` is the
// guard and its P2002 maps to 409, so two concurrent adds cannot both pass a read-then-write check.
// The add and its `CREAR proyecto_cliente` audit row share one transaction (REQ-AUD-03).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { canReadProject, loadProjectScoped } from "@/lib/api/projects";
import {
  ALIADO_CREATE_SCHEMA,
  ALIADO_DUPLICADO_MESSAGE,
  PROYECTO_CLIENTE_SELECT,
  aliadoAuditValue,
  checkClientesAliadosExisten,
  esAliadoDuplicado,
  gateEscrituraAliados,
  toAliadoItem,
  toAporteDecimal,
} from "@/lib/proyectos/aliados-proyecto";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los aliados del proyecto. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const scoped = await loadProjectScoped(auth.usuario, id, { id: true });
    if (!scoped) {
      return apiError("El proyecto no existe.", 404, "NOT_FOUND");
    }
    if (!canReadProject(auth.usuario, scoped.es_miembro)) {
      return apiError("No tienes permisos sobre este proyecto.", 403, "FORBIDDEN");
    }

    const aliados = await db.proyectoCliente.findMany({
      where: { proyecto_id: id },
      select: PROYECTO_CLIENTE_SELECT,
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });

    return NextResponse.json({ aliados: aliados.map(toAliadoItem) });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos agregar el aliado. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEscrituraAliados(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseJsonBody<Record<string, unknown>>(request);
    if (body === null || typeof body !== "object") {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = ALIADO_CREATE_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return apiError(
        parsed.error.issues[0]?.message ?? "Datos no válidos.",
        400,
        "VALIDATION_ERROR",
      );
    }

    const missing = await checkClientesAliadosExisten([parsed.data.cliente_id]);
    if (missing) return missing;

    try {
      const row = await db.$transaction(async (tx) => {
        const created = await tx.proyectoCliente.create({
          data: {
            proyecto_id: id,
            cliente_id: parsed.data.cliente_id,
            rol: parsed.data.rol,
            estado: parsed.data.estado ?? "EN_GESTION",
            aporte_cop: toAporteDecimal(parsed.data.aporte_cop),
          },
          select: { ...PROYECTO_CLIENTE_SELECT, cliente_id: true },
        });

        await logChange(tx, {
          usuario_id: auth.usuario.id,
          accion: "CREAR",
          entidad: "proyecto_cliente",
          entidad_id: created.id,
          proyecto_id: id,
          valor_nuevo: aliadoAuditValue(created),
        });

        return created;
      });

      return NextResponse.json({ aliado: toAliadoItem(row) }, { status: 201 });
    } catch (err) {
      if (esAliadoDuplicado(err)) {
        return apiError(ALIADO_DUPLICADO_MESSAGE, 409, "CONFLICT");
      }
      throw err;
    }
  },
);
