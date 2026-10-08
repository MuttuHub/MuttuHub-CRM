// GET /api/v1/projects/:id/expenses/:expenseId/attachments/:attachmentId/download (S6 U5).
//
// A stored support answers `{ tipo: "archivo", url, expires_in: 60 }` with a 60 s signed URL; a link
// support answers its https URL. Unlike the avance medios, expense supports are restricted to the
// actors who can view financial supports (ADM/GER or an active-member COORDINADOR; RNF-03): 404 for a
// missing project -> 403 -> 404 for a support that is not a live support of THAT expense and project.
//
// RNF-04: every issuance is logged in the append-only `acceso_soportes` AFTER the URL was signed.
// Fail closed: when the insert fails the answer is a 500 and no URL leaves the server.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { GASTO_FORBIDDEN_MESSAGE, gateGastoRead } from "@/lib/api/gastos";
import { STORAGE_BUCKET } from "@/lib/api/files";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; expenseId: string; attachmentId: string }> };

export const DOWNLOAD_TTL_SECONDS = 60;
export const SOPORTE_GASTO_NO_EXISTE = "El soporte no existe.";

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos generar la descarga. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, expenseId, attachmentId } = await ctx.params;

    const gate = await gateGastoRead(auth.usuario, id);
    if (!gate.ok) return gate.response;
    if (!gate.value.puedeVerSoportes) return apiError(GASTO_FORBIDDEN_MESSAGE, 403, "FORBIDDEN");

    const soporte = await db.soporteProyecto.findFirst({
      where: { id: attachmentId, gasto_id: expenseId, proyecto_id: id, deleted_at: null },
      select: { id: true, storage_path: true, url_externa: true },
    });
    if (!soporte) return apiError(SOPORTE_GASTO_NO_EXISTE, 404, "NOT_FOUND");

    let respuesta: { tipo: "archivo" | "enlace"; url: string | null; expires_in: number | null };
    if (!soporte.storage_path) {
      respuesta = { tipo: "enlace", url: soporte.url_externa, expires_in: null };
    } else {
      if (!isSupabaseConfigured()) {
        return apiError("Plataforma no configurada. Revisa las variables de entorno.", 500, "INTERNAL_ERROR");
      }
      const { data, error } = await createSupabaseAdmin()
        .storage.from(STORAGE_BUCKET)
        .createSignedUrl(soporte.storage_path, DOWNLOAD_TTL_SECONDS);
      if (error || !data) {
        console.error("[projects] expense support signed url failed:", error);
        return apiError("No pudimos generar el enlace de descarga. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
      }
      respuesta = { tipo: "archivo", url: data.signedUrl, expires_in: DOWNLOAD_TTL_SECONDS };
    }

    try {
      await db.accesoSoporte.create({
        data: { soporte_id: soporte.id, proyecto_id: id, usuario_id: auth.usuario.id },
      });
    } catch (err) {
      console.error("[projects] acceso_soportes insert failed:", err);
      return apiError("No pudimos registrar el acceso al soporte. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
    }
    return NextResponse.json(respuesta);
  },
);
