// GET/POST /api/v1/projects/:id/attachments — SoporteProyecto list/create
// (RF-04/RF-06, D8, design.md Fase 3b). A soporte is EXACTLY one of: file
// upload OR external link (`https://` only), never both, never neither —
// the Postgres CHECK from Unit 1 is the real backstop, this route is the
// friendly 400. It hangs off the project directly, or off ONE of an
// `actividad_id`/`gasto_id` (never both — `destino_unico` CHECK), both
// re-validated here against THIS project before the write, same pattern as
// `activities/route.ts`'s cross-project `meta_id` check. No `logAudit` call
// yet: `AuditEntidad` doesn't carry `"soporte"` until Fase 4a.5 widens it
// (same deviation already established in Fase 3a for "actividad").

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { Prisma, TipoSoporte } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getProjectForWrite, loadProjectScoped } from "@/lib/api/projects";
import {
  ALLOWED_FILE_EXTENSIONS,
  ALLOWED_FILE_MIME,
  MAX_FILE_BYTES,
  STORAGE_BUCKET,
  isAllowedFileType,
  isValidExternalUrl,
  projectSupportStoragePath,
} from "@/lib/api/files";
import { ENUM_VALUES } from "@/lib/catalogs";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const SUPPORT_SELECT = {
  id: true,
  proyecto_id: true,
  actividad_id: true,
  gasto_id: true,
  tipo: true,
  nombre: true,
  storage_path: true,
  url_externa: true,
  tamano_bytes: true,
  documento_id: true,
  subido_por_id: true,
  created_at: true,
} as const;

export type SupportRow = Prisma.SoporteProyectoGetPayload<{ select: typeof SUPPORT_SELECT }>;

/**
 * Añade `download_url` a cada fila: para `storage_path`, un signed URL de
 * 60 s (best-effort, igual disciplina que el adjunto de tareas — un fallo
 * de storage no rompe el listado); para `url_externa`, el valor tal cual
 * (nunca se resuelve en el servidor — D8/Threat Matrix: no hay SSRF porque
 * el backend jamás la fetchea).
 */
export async function resolveDownloadUrls(
  soportes: SupportRow[],
): Promise<(SupportRow & { download_url: string | null })[]> {
  const needsSignedUrl = soportes.some((s) => s.storage_path);
  const supabaseReady = needsSignedUrl && isSupabaseConfigured();
  const supabase = supabaseReady ? createSupabaseAdmin() : null;

  return Promise.all(
    soportes.map(async (soporte) => {
      if (soporte.url_externa) {
        return { ...soporte, download_url: soporte.url_externa };
      }
      if (soporte.storage_path && supabase) {
        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(soporte.storage_path, 60);
        if (error) console.error("[projects] soporte signed url failed:", error);
        return { ...soporte, download_url: data?.signedUrl ?? null };
      }
      return { ...soporte, download_url: null };
    }),
  );
}

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los soportes del proyecto. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const access = await loadProjectScoped(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El proyecto no existe." : "No tienes permisos sobre este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const soportes = await db.soporteProyecto.findMany({
      where: { proyecto_id: id, deleted_at: null },
      select: SUPPORT_SELECT,
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json({ soportes: await resolveDownloadUrls(soportes) });
  },
);

const TIPO_SOPORTE_VALUES = new Set(ENUM_VALUES.TipoSoporte);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos crear el soporte. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }

    const nombre = form.get("nombre");
    if (typeof nombre !== "string" || nombre.trim().length === 0) {
      return apiError("El nombre del soporte es obligatorio.", 400, "VALIDATION_ERROR");
    }
    const tipoRaw = form.get("tipo");
    if (typeof tipoRaw !== "string" || !TIPO_SOPORTE_VALUES.has(tipoRaw)) {
      return apiError("El tipo de soporte no es válido.", 400, "VALIDATION_ERROR");
    }
    const tipo = tipoRaw as TipoSoporte;

    const file = form.get("file");
    const url = form.get("url");
    const hasFile = file instanceof File;
    const hasUrl = typeof url === "string" && url.trim().length > 0;
    if (hasFile === hasUrl) {
      return apiError(
        "Debes adjuntar un archivo o un enlace, no ambos ni ninguno.",
        400,
        "VALIDATION_ERROR",
      );
    }
    if (hasUrl && !isValidExternalUrl(url)) {
      return apiError("El enlace debe usar el esquema https://.", 400, "VALIDATION_ERROR");
    }
    if (hasFile) {
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      if (!ALLOWED_FILE_EXTENSIONS.has(ext) && !ALLOWED_FILE_MIME.has(file.type)) {
        return apiError(
          "Solo se aceptan PDF, DOCX, XLSX, PPTX, JPG o PNG.",
          400,
          "VALIDATION_ERROR",
        );
      }
      if (file.size > MAX_FILE_BYTES) {
        return apiError("El archivo supera el límite de 10 MB.", 413, "FILE_TOO_LARGE");
      }
      if (!isAllowedFileType(file)) {
        return apiError(
          "Solo se aceptan PDF, DOCX, XLSX, PPTX, JPG o PNG.",
          400,
          "VALIDATION_ERROR",
        );
      }
    }

    const actividadIdRaw = form.get("actividad_id");
    const gastoIdRaw = form.get("gasto_id");
    const actividadId = typeof actividadIdRaw === "string" && actividadIdRaw.length > 0 ? actividadIdRaw : null;
    const gastoId = typeof gastoIdRaw === "string" && gastoIdRaw.length > 0 ? gastoIdRaw : null;
    if (actividadId && gastoId) {
      return apiError(
        "Un soporte no puede pertenecer a una actividad y a un gasto de gastos a la vez.",
        400,
        "VALIDATION_ERROR",
      );
    }

    const access = await getProjectForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El proyecto no existe."
          : "No tienes permisos para crear soportes en este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    if (actividadId) {
      const actividad = await db.actividad.findFirst({
        where: { id: actividadId, proyecto_id: id, deleted_at: null },
        select: { id: true },
      });
      if (!actividad) {
        return apiError("La actividad no existe o no pertenece a este proyecto.", 400, "VALIDATION_ERROR");
      }
    }
    if (gastoId) {
      const gasto = await db.gasto.findFirst({
        where: { id: gastoId, proyecto_id: id, deleted_at: null },
        select: { id: true },
      });
      if (!gasto) {
        return apiError("El gasto no existe o no pertenece a este proyecto.", 400, "VALIDATION_ERROR");
      }
    }

    const soporteId = randomUUID();
    let storagePath: string | null = null;
    let tamanoBytes: number | null = null;

    if (hasFile) {
      if (!isSupabaseConfigured()) {
        return apiError(
          "Plataforma no configurada. Revisa las variables de entorno.",
          500,
          "INTERNAL_ERROR",
        );
      }
      storagePath = projectSupportStoragePath(id, soporteId, file.name);
      const supabase = createSupabaseAdmin();
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, new Uint8Array(await file.arrayBuffer()), {
          contentType: file.type || "application/octet-stream",
        });
      if (uploadError) {
        console.error("[projects] soporte upload failed:", uploadError);
        return apiError("No pudimos subir el archivo. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
      }
      tamanoBytes = file.size;
    }

    const soporte = await db.soporteProyecto.create({
      data: {
        id: soporteId,
        proyecto_id: id,
        actividad_id: actividadId,
        gasto_id: gastoId,
        tipo,
        nombre: nombre.trim(),
        storage_path: storagePath,
        url_externa: hasUrl ? url : null,
        tamano_bytes: tamanoBytes,
        subido_por_id: auth.usuario.id,
      },
      select: SUPPORT_SELECT,
    });

    const [withUrl] = await resolveDownloadUrls([soporte]);
    return NextResponse.json({ soporte: withUrl }, { status: 201 });
  },
);
