// PATCH /api/v1/projects/:id/allies/:allyId — change an ally's role, state or contribution (S9).
// DELETE /api/v1/projects/:id/allies/:allyId — unlink the ally (S9).
//
// Same gate as the POST (`gateEscrituraAliados`). The ally is read scoped to the project, so an id
// of another project is a 404. The client is the row's identity and cannot change: unlink and link
// again instead. PATCH audits one `EDITAR proyecto_cliente` row per changed field (REQ-AUD-04).
// DELETE removes the row; `AccionAuditoria` has no delete action, so it is audited like the budget
// lines: EDITAR from the ally's values down to null. Write and audit share one transaction.

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { diffFields, logChange, logChanges } from "@/lib/api/audit-cambios";
import {
  ALIADO_NO_EXISTE_MESSAGE,
  ALIADO_PATCH_SCHEMA,
  PROYECTO_CLIENTE_SELECT,
  aliadoAuditValue,
  gateEscrituraAliados,
  toAliadoItem,
  toAporteDecimal,
} from "@/lib/proyectos/aliados-proyecto";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; allyId: string }> };

const AUDITED_FIELDS = ["rol", "estado", "aporte_cop"] as const;

async function cargarAliado(proyectoId: string, aliadoId: string) {
  return db.proyectoCliente.findFirst({
    where: { id: aliadoId, proyecto_id: proyectoId },
    select: { id: true, cliente_id: true, rol: true, estado: true, aporte_cop: true },
  });
}

export const PATCH = withApiErrorHandling(
  "projects",
  "No pudimos actualizar el aliado. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, allyId } = await ctx.params;

    const gate = await gateEscrituraAliados(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const existente = await cargarAliado(id, allyId);
    if (!existente) {
      return apiError(ALIADO_NO_EXISTE_MESSAGE, 404, "NOT_FOUND");
    }

    const body = await parseJsonBody<Record<string, unknown>>(request);
    if (body === null || typeof body !== "object") {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = ALIADO_PATCH_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return apiError(
        parsed.error.issues[0]?.message ?? "Datos no válidos.",
        400,
        "VALIDATION_ERROR",
      );
    }

    const data: Prisma.ProyectoClienteUncheckedUpdateInput & Partial<typeof existente> = {};
    if (parsed.data.rol !== undefined) data.rol = parsed.data.rol;
    if (parsed.data.estado !== undefined) data.estado = parsed.data.estado;
    if (parsed.data.aporte_cop !== undefined) {
      data.aporte_cop = toAporteDecimal(parsed.data.aporte_cop);
    }

    const antes = aliadoAuditValue(existente);
    const despues = aliadoAuditValue({ ...existente, ...data });
    const cambios = diffFields(
      antes,
      Object.fromEntries(AUDITED_FIELDS.filter((f) => f in data).map((f) => [f, despues[f]])),
      AUDITED_FIELDS,
    );

    const row = await db.$transaction(async (tx) => {
      const updated = await tx.proyectoCliente.update({
        where: { id: allyId },
        data,
        select: PROYECTO_CLIENTE_SELECT,
      });
      await logChanges(
        tx,
        cambios.map((cambio) => ({
          usuario_id: auth.usuario.id,
          accion: "EDITAR" as const,
          entidad: "proyecto_cliente",
          entidad_id: allyId,
          proyecto_id: id,
          ...cambio,
        })),
      );
      return updated;
    });

    return NextResponse.json({ aliado: toAliadoItem(row) });
  },
);

export const DELETE = withApiErrorHandling(
  "projects",
  "No pudimos quitar el aliado. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, allyId } = await ctx.params;

    const gate = await gateEscrituraAliados(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const existente = await cargarAliado(id, allyId);
    if (!existente) {
      return apiError(ALIADO_NO_EXISTE_MESSAGE, 404, "NOT_FOUND");
    }

    await db.$transaction(async (tx) => {
      await tx.proyectoCliente.delete({ where: { id: allyId } });
      await logChange(tx, {
        usuario_id: auth.usuario.id,
        accion: "EDITAR",
        entidad: "proyecto_cliente",
        entidad_id: allyId,
        proyecto_id: id,
        valor_anterior: aliadoAuditValue(existente),
        valor_nuevo: null,
      });
    });

    return new NextResponse(null, { status: 204 });
  },
);
