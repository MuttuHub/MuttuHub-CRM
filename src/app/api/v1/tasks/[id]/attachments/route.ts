// GET/POST /api/v1/tasks/:id/attachments — adjuntos de la tarjeta (PRD §5.2,
// contract §8.2 "POST /tasks/:id/attachments").
// POST: multipart/form-data con el campo `file`. Validación: <= 10 MB (413
// FILE_TOO_LARGE) y extensión/MIME en PDF/DOCX/XLSX/JPG/PNG (400). Se sube al
// bucket SUPABASE_STORAGE_BUCKET (default "muttu-docs") con el cliente de
// service role (src/lib/supabase/admin.ts — solo servidor) en
// `tareas/{tarea_id}/{uuid}_{nombre}` (convención análoga a /documentos/ del
// PRD §6.2, sin el "/" inicial del almacenamiento) y se registra la fila
// AdjuntoTarea. La URL de descarga es un signedUrl de 60 s.
// Sin Supabase configurado → 500: storage no puede funcionar sin credenciales.
// Storage failure → 500 envelope, nunca crash.
// Escope = mismo permiso que el PATCH de la tarea (getTaskForWrite).

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getTaskForWrite, loadTaskScoped } from "@/lib/api/crm";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_FILE_BYTES = 10 * 1024 * 1024; // PRD §8.4: tamaño máx 10 MB.
const ALLOWED_EXT = new Set(["pdf", "docx", "xlsx", "jpg", "png"]); // PRD §8.4.
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
]);
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "muttu-docs";

/** Nombre saneado para el path de storage (la columna `nombre` guarda el original). */
function safeFileName(name: string): string {
  return name.replace(/[\\/]/g, "_");
}

export const GET = withApiErrorHandling(
  "tasks",
  "No pudimos cargar los adjuntos. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const tarea = await loadTaskScoped(id, auth.usuario);
    if (!tarea) {
      return apiError("La tarea no existe.", 404, "NOT_FOUND");
    }
    const adjuntos = await db.adjuntoTarea.findMany({
      where: { tarea_id: id },
      orderBy: { created_at: "desc" },
      select: { id: true, nombre: true, tamano_bytes: true, created_at: true },
    });
    return NextResponse.json({ adjuntos });
  },
);

export const POST = withApiErrorHandling(
  "tasks",
  "No pudimos subir el archivo. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    // Storage necesita credenciales de Supabase sí o sí: sin ellas no hay upload.
    if (!isSupabaseConfigured()) {
      return apiError(
        "Plataforma no configurada. Revisa las variables de entorno.",
        500,
        "INTERNAL_ERROR",
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return apiError("Adjunta un archivo en el campo 'file'.", 400, "VALIDATION_ERROR");
    }
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    // Extensión O MIME en el set permitido: clientes (p.ej. curl) mandan
    // application/octet-stream incluso para archivos válidos.
    if (!ALLOWED_EXT.has(ext) && !ALLOWED_MIME.has(file.type)) {
      return apiError(
        "Solo se aceptan PDF, Word (.docx), Excel (.xlsx), JPG o PNG.",
        400,
        "VALIDATION_ERROR",
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return apiError("El archivo supera el límite de 10 MB.", 413, "FILE_TOO_LARGE");
    }

    const access = await getTaskForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "La tarea no existe." : "No tienes permisos sobre esta tarea.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const storagePath = `tareas/${id}/${randomUUID()}_${safeFileName(file.name)}`;
    const supabase = createSupabaseAdmin();

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, new Uint8Array(await file.arrayBuffer()), {
        contentType: file.type || "application/octet-stream",
      });
    if (uploadError) {
      console.error("[tasks] attachment upload failed:", uploadError);
      return apiError("No pudimos subir el archivo. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
    }

    const adjunto = await db.adjuntoTarea.create({
      data: { tarea_id: id, storage_path: storagePath, nombre: file.name, tamano_bytes: file.size },
      select: { id: true, nombre: true, tamano_bytes: true, created_at: true },
    });

    // Signed URL es un detalle de la respuesta, no de la fila: si falla, el
    // 201 sigue siendo válido y el cliente usa el endpoint de descarga.
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, 60);
    if (urlError) console.error("[tasks] attachment signed url failed:", urlError);

    // BUG FIX: this used to return the whole `{ signedUrl, path }` object as
    // `download_url` instead of the plain URL string the sibling download
    // route (.../download/route.ts) hands out — unwrap it the same way.
    return NextResponse.json(
      { adjunto: { ...adjunto, download_url: signedUrlData?.signedUrl ?? null } },
      { status: 201 },
    );
  },
);