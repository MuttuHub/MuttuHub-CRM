// GET /api/v1/projects/:id/supports/:supportId/download — opens a project-origin document (DOC1).
//
// A stored file answers `{ tipo: "archivo", url, expires_in: 60 }` with a 60 s signed URL; a link
// answers its https URL. Same audience as the supports list (any estado): managers, a member
// COORDINADOR and the gerencial flag. A document is only addressable through its own project and
// only while it is live and of project origin (404).
//
// RNF-04: every issuance is logged in the append-only `acceso_soportes` AFTER the URL was signed.
// Fail closed: when the insert fails the answer is a 500 and no URL leaves the server.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { gateGastoRead } from "@/lib/api/gastos";
import { STORAGE_BUCKET } from "@/lib/api/files";
import { DOCUMENTO_NO_EXISTE, PLATAFORMA_MESSAGE, SOPORTE_ORIGEN_PROYECTO } from "@/lib/api/soportes";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; supportId: string }> };

export const DOWNLOAD_TTL_SECONDS = 60;

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos generar la descarga. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, supportId } = await ctx.params;

    const gate = await gateGastoRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const documento = await db.soporteProyecto.findFirst({
      where: { id: supportId, proyecto_id: id, deleted_at: null, ...SOPORTE_ORIGEN_PROYECTO },
      select: { id: true, storage_path: true, url_externa: true },
    });
    if (!documento) return apiError(DOCUMENTO_NO_EXISTE, 404, "NOT_FOUND");

    let respuesta: { tipo: "archivo" | "enlace"; url: string | null; expires_in: number | null };
    if (!documento.storage_path) {
      respuesta = { tipo: "enlace", url: documento.url_externa, expires_in: null };
    } else {
      if (!isSupabaseConfigured()) {
        return apiError(PLATAFORMA_MESSAGE, 500, "INTERNAL_ERROR");
      }
      const { data, error } = await createSupabaseAdmin()
        .storage.from(STORAGE_BUCKET)
        .createSignedUrl(documento.storage_path, DOWNLOAD_TTL_SECONDS);
      if (error || !data) {
        console.error("[projects] project document signed url failed:", error);
        return apiError("No pudimos generar el enlace de descarga. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
      }
      respuesta = { tipo: "archivo", url: data.signedUrl, expires_in: DOWNLOAD_TTL_SECONDS };
    }

    try {
      await db.accesoSoporte.create({
        data: { soporte_id: documento.id, proyecto_id: id, usuario_id: auth.usuario.id },
      });
    } catch (err) {
      console.error("[projects] acceso_soportes insert failed:", err);
      return apiError("No pudimos registrar el acceso al soporte. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
    }
    return NextResponse.json(respuesta);
  },
);
