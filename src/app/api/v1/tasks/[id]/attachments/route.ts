// GET/POST /api/v1/tasks/:id/attachments — adjuntos de la tarjeta (PRD §5.2,
// contract §8.2 "POST /tasks/:id/attachments").
// POST: multipart/form-data con el campo `file`. Validación: tamaño máximo
// configurable vía MAX_FILE_SIZE_MB (default 25 MB si no está seteada o es
// inválida; 413 FILE_TOO_LARGE) y extensión/MIME en PDF/DOC/DOCX/XLSX/PPT/PPTX/CSV/TXT/ZIP/
// JPG/JPEG/PNG/HEIC (400). Se sube al
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
import { loadDocCategories } from "@/lib/api/documents";
import { sanitizeFileName } from "@/lib/api/files";
import { logAudit } from "@/lib/api/audit";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// PRD §8.4: tamaño máx configurable vía MAX_FILE_SIZE_MB (Vercel env var),
// default 25 MB si no está seteada o no es un número válido.
const DEFAULT_MAX_FILE_MB = 25;
const configuredMaxFileMb = Number.parseInt(process.env.MAX_FILE_SIZE_MB ?? "", 10);
const MAX_FILE_MB =
  Number.isFinite(configuredMaxFileMb) && configuredMaxFileMb > 0
    ? configuredMaxFileMb
    : DEFAULT_MAX_FILE_MB;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ALLOWED_EXT = new Set([
  "pdf",
  "docx",
  "xlsx",
  "jpg",
  "png",
  "doc",
  "ppt",
  "pptx",
  "csv",
  "txt",
  "jpeg",
  "heic",
  "zip",
]); // PRD §8.4 + lista ampliada aprobada por el cliente.
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
  "image/heic",
  "image/heif",
  "application/zip",
  "application/x-zip-compressed",
]);
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "muttu-docs";

/**
 * Espeja el adjunto en el Repositorio de Documentos (QA audit finding #12):
 * antes, un archivo subido a una tarea solo vivía en `adjuntos_tareas` y
 * nunca aparecía en /documentos. Reusa el mismo `storage_path` (no vuelve a
 * subir el archivo) y, si la tarea tiene cliente vinculado, lo vincula
 * también ahí.
 *
 * Categoría: preferimos "Otro" (una tarea no tiene concepto de categoría
 * propio), pero contra el catálogo EN VIVO — si un admin la renombró o la
 * sacó del catálogo, caemos a la primera categoría disponible en vez de
 * escribir un valor que ya no existe en ningún lado (bug de code review).
 *
 * Los 4 writes van en una transacción (bug de code review: antes eran pasos
 * sueltos en un solo try/catch sin rollback — si fallaba después de crear el
 * Documento, quedaba huérfano y sin versión, visible en el repositorio sin
 * archivo para descargar). `logAudit` queda deliberadamente FUERA de la
 * transacción: es best-effort por diseño (ver su propio try/catch interno),
 * no necesita la misma garantía de atomicidad que la escritura de negocio.
 *
 * Best-effort a propósito: si el espejo falla, el adjunto ya quedó guardado
 * en la tarea (lo que el usuario pidió) y eso no debe perderse por un
 * problema al escribir el documento espejo — se loguea y listo.
 */
async function mirrorAttachmentAsDocument(params: {
  tareaId: string;
  clienteId: string | null;
  adjuntoId: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  usuarioId: string;
}): Promise<void> {
  try {
    const { categorias } = await loadDocCategories();
    const categoria = categorias.includes("Otro") ? "Otro" : (categorias[0] ?? "Otro");

    const documentoId = await db.$transaction(async (tx) => {
      const documento = await tx.documento.create({
        data: { titulo: params.fileName, categoria, autor_id: params.usuarioId },
      });
      if (params.clienteId) {
        await tx.documentoCliente.create({
          data: { documento_id: documento.id, cliente_id: params.clienteId },
        });
      }
      await tx.documentoVersion.create({
        data: {
          documento_id: documento.id,
          numero_version: 1,
          storage_path: params.storagePath,
          tamano_bytes: params.fileSize,
          tipo_archivo: params.fileType,
          subido_por_id: params.usuarioId,
        },
      });
      await tx.adjuntoTarea.update({
        where: { id: params.adjuntoId },
        data: { documento_id: documento.id },
      });
      return documento.id;
    });

    await logAudit({
      entidad: "documento",
      entidad_id: documentoId,
      accion: "crear",
      usuario_id: params.usuarioId,
      cambios: { titulo: params.fileName, categoria, origen: "adjunto_tarea", tarea_id: params.tareaId },
    });
  } catch (err) {
    console.error("[tasks] failed to mirror attachment into document repository:", err);
  }
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
        "Solo se aceptan PDF, Word, Excel, PowerPoint, CSV, TXT, ZIP, JPG, JPEG, PNG o HEIC.",
        400,
        "VALIDATION_ERROR",
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return apiError(`El archivo supera el límite de ${MAX_FILE_MB} MB.`, 413, "FILE_TOO_LARGE");
    }

    const access = await getTaskForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "La tarea no existe." : "No tienes permisos sobre esta tarea.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const storagePath = `tareas/${id}/${randomUUID()}_${sanitizeFileName(file.name)}`;
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

    await mirrorAttachmentAsDocument({
      tareaId: id,
      clienteId: access.tarea.cliente_id,
      adjuntoId: adjunto.id,
      storagePath,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || "application/octet-stream",
      usuarioId: auth.usuario.id,
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