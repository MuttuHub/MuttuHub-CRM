// GET /api/v1/projects/:id/progress/:progressId/attachments — live medios of an avance (S4 U3).
// POST — attach a medio: confirm an object already uploaded with a signed URL
// (`{ storage_path, nombre, tamano_bytes, tipo_mime? }`) or link an external https
// URL (`{ url_externa, nombre }`).
//
// Write: ADMINISTRADOR/GERENCIA or an active-member COORDINADOR on an EN_EJECUCION
// project (404 -> 403 -> 409), on a non-voided avance (409). A file is confirmed
// only when its key sits under THIS project's `soportes` prefix, the object exists
// in storage and is not larger than declared or than the app limit; the stored row
// keeps the REAL size. Never deletes from storage; the same object cannot back two
// medios. Once an avance has a live medio it `cuenta` (REQ-EXE-03).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { conflict, isUniqueViolation } from "@/lib/api/estructura";
import {
  avanceCuenta,
  gateEjecucionRead,
  gateEjecucionWrite,
  loadAvanceParaMedio,
  toMedioView,
} from "@/lib/api/ejecucion";
import { MEDIO_DUPLICADO_MESSAGE, STORAGE_PATH_INDEX, validarSoporte } from "@/lib/api/soportes";
import { getSemaforoParametrosV2 } from "@/lib/settings";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; progressId: string }> };

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los medios. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, progressId } = await ctx.params;

    const gate = await gateEjecucionRead(auth.usuario, id);
    if (!gate.ok) return gate.response;
    const avance = await loadAvanceParaMedio(id, progressId, { permitirAnulado: true });
    if (!avance.ok) return avance.response;

    const medios = await db.soporteProyecto.findMany({
      where: { avance_id: progressId, proyecto_id: id, deleted_at: null },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });
    return NextResponse.json({ medios: medios.map(toMedioView) });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos adjuntar el medio. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, progressId } = await ctx.params;

    const gate = await gateEjecucionWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;
    const avance = await loadAvanceParaMedio(id, progressId);
    if (!avance.ok) return avance.response;

    const body = await parseJsonBody<unknown>(request);
    const soporte = await validarSoporte(id, body);
    if (!soporte.ok) return soporte.response;
    const datos = soporte.value;

    const parametros = await getSemaforoParametrosV2();

    try {
      const { medio, medios } = await db.$transaction(async (tx) => {
        const created = await tx.soporteProyecto.create({
          data: { proyecto_id: id, avance_id: progressId, subido_por_id: auth.usuario.id, ...datos },
        });
        await logChange(tx, {
          usuario_id: auth.usuario.id,
          accion: "CREAR",
          entidad: "avance",
          entidad_id: progressId,
          proyecto_id: id,
          campo: "medio",
          valor_nuevo: {
            medio_id: created.id,
            nombre: created.nombre,
            tipo: created.storage_path ? "archivo" : "enlace",
            url_externa: created.url_externa,
            tamano_bytes: created.tamano_bytes,
          },
        });
        const total = await tx.soporteProyecto.count({ where: { avance_id: progressId, deleted_at: null } });
        return { medio: created, medios: total };
      });

      return NextResponse.json(
        { medio: toMedioView(medio), cuenta: avanceCuenta(false, parametros.avance_requiere_medio.valor, medios) },
        { status: 201 },
      );
    } catch (err) {
      if (isUniqueViolation(err, STORAGE_PATH_INDEX)) return conflict(MEDIO_DUPLICADO_MESSAGE);
      throw err;
    }
  },
);
