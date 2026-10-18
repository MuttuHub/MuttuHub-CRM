// GET /api/v1/projects/:id/supports — read-only list of every live soporte of the project (v7 "Soportes" tab).
// POST — create a project-origin document (contract, agreement, minutes) as a confirmed file or an https link.
//
// Metadata only: the storage key is never exposed and downloads keep going through the signed-URL routes of
// each origin (avance attachments, expense attachments, project documents). Read access follows the ficha
// (404 -> 403). Supports attached to expenses are financial (RNF-03): they are omitted for actors who cannot
// view them. Measurement supports have no download route yet, so they are listed with `url_externa` only when
// they are links.
//
// Write (POST): managers or an active-member COORDINADOR on a BORRADOR/EN_EJECUCION/SUSPENDIDO project
// (404 -> 403 -> 409). A file is confirmed only when its key sits under THIS project's `soportes` prefix, the
// object exists in storage and is not larger than declared or than the app limit; the stored row keeps the
// REAL size. Create is audited inside the same transaction.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { conflict, isUniqueViolation } from "@/lib/api/estructura";
import { gateGastoRead } from "@/lib/api/gastos";
import {
  DOCUMENTO_DUPLICADO_MESSAGE,
  STORAGE_PATH_INDEX,
  gateSoporteProyectoWrite,
  toDocumentoProyectoView,
  validarSoporte,
} from "@/lib/api/soportes";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export type SoporteOrigen = "avance" | "indicador" | "gasto" | "proyecto";

export type SoporteListView = {
  id: string;
  nombre: string;
  tipo: "archivo" | "enlace";
  tipo_mime: string | null;
  tamano_bytes: number | null;
  origen: SoporteOrigen;
  /** Id of the avance or expense that owns the soporte (the download routes need it); null otherwise. */
  origen_id: string | null;
  /** Human label of what the soporte backs (activity/deliverable, indicator, expense document). */
  vinculo: string | null;
  /** Only for link supports that are not financial. */
  url_externa: string | null;
  subido_por: string | null;
  /** Uploader id: the ficha uses it to decide who may delete their own project documents. */
  subido_por_id: string;
  created_at: string;
};

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los soportes. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateGastoRead(auth.usuario, id);
    if (!gate.ok) return gate.response;
    const { puedeVerSoportes } = gate.value;

    const rows = await db.soporteProyecto.findMany({
      where: {
        proyecto_id: id,
        deleted_at: null,
        ...(puedeVerSoportes ? {} : { gasto_id: null }),
      },
      orderBy: [{ created_at: "desc" }, { id: "asc" }],
      include: {
        avance: { select: { entregable: { select: { codigo: true, descripcion: true } } } },
        medicion: { select: { indicador: { select: { codigo: true, nombre: true } } } },
        gasto: { select: { numero_documento: true, descripcion: true } },
      },
    });

    const autores = await db.usuario.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.subido_por_id))] } },
      select: { id: true, nombre: true },
    });
    const nombrePorId = new Map(autores.map((autor) => [autor.id, autor.nombre]));

    const soportes: SoporteListView[] = rows.map((row) => {
      const origen: SoporteOrigen = row.avance_id
        ? "avance"
        : row.medicion_id
          ? "indicador"
          : row.gasto_id
            ? "gasto"
            : "proyecto";
      const vinculo = row.avance
        ? `${row.avance.entregable.codigo} · ${row.avance.entregable.descripcion}`
        : row.medicion
          ? `${row.medicion.indicador.codigo} · ${row.medicion.indicador.nombre}`
          : row.gasto
            ? `Gasto ${row.gasto.numero_documento} · ${row.gasto.descripcion}`
            : null;
      return {
        id: row.id,
        nombre: row.nombre,
        tipo: row.storage_path ? "archivo" : "enlace",
        tipo_mime: row.tipo_mime,
        tamano_bytes: row.tamano_bytes,
        origen,
        origen_id: row.avance_id ?? row.gasto_id ?? null,
        vinculo,
        url_externa: origen === "gasto" ? null : row.url_externa,
        subido_por: nombrePorId.get(row.subido_por_id) ?? null,
        subido_por_id: row.subido_por_id,
        created_at: row.created_at.toISOString(),
      };
    });

    return NextResponse.json({ soportes });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos guardar el documento. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateSoporteProyectoWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseJsonBody<unknown>(request);
    const soporte = await validarSoporte(id, body);
    if (!soporte.ok) return soporte.response;

    try {
      const documento = await db.$transaction(async (tx) => {
        const created = await tx.soporteProyecto.create({
          data: { proyecto_id: id, subido_por_id: auth.usuario.id, ...soporte.value },
        });
        await logChange(tx, {
          usuario_id: auth.usuario.id,
          accion: "CREAR",
          entidad: "proyecto",
          entidad_id: id,
          proyecto_id: id,
          campo: "documento",
          valor_nuevo: {
            documento_id: created.id,
            nombre: created.nombre,
            tipo: created.storage_path ? "archivo" : "enlace",
          },
        });
        return created;
      });

      return NextResponse.json({ soporte: toDocumentoProyectoView(documento) }, { status: 201 });
    } catch (err) {
      if (isUniqueViolation(err, STORAGE_PATH_INDEX)) return conflict(DOCUMENTO_DUPLICADO_MESSAGE);
      throw err;
    }
  },
);
