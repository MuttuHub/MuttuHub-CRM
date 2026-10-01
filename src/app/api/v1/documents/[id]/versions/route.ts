// GET/POST /api/v1/documents/:id/versions — historial y subida de versiones
// (PRD §6.2 "Versionado").
// POST: multipart/form-data con el campo `file` (política única compartida con
// la creación, src/lib/api/files.ts: <= 25 MB configurables, PDF/DOCX/XLSX/
// PPTX/JPG/JPEG/PNG). Alternativa ADR-13 (S0.9b): `application/json` con
// `{ storage_path, nombre, tamano_bytes, tipo_mime? }` confirma un objeto ya
// subido directo a Storage con un signed URL de POST /api/v1/uploads/sign; el
// servidor revalida el permiso, que la ruta pertenezca a ESTE documento y que
// el objeto exista y no supere el tamaño declarado, y luego inserta la misma
// fila (sin leer bytes, por lo que no corre la extracción de texto). La versión
// nueva siempre es
// max(numero_version) + 1 y pasa a ser la activa (el botón principal de
// descarga usa la de mayor numero). El versionado nunca es automático por
// detección de nombre de archivo.
// GET: todas las versiones en orden descendente, con nombre del subidor
// (resuelto por lote — DocumentoVersion no tiene FK a Usuario en el schema).

import { NextResponse } from "next/server";
import type { Usuario } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  MAX_FILE_BYTES,
  STORAGE_BUCKET,
  documentStoragePath,
  isAllowedNameAndMime,
} from "@/lib/api/files";
import { assertKeyBelongsToTarget, storedObjectSize } from "@/lib/api/signed-upload";
import { extractForVersion } from "@/lib/api/extract-text";
import { logAudit } from "@/lib/api/audit";
import {
  DOCUMENT_VERSION_SELECT,
  documentAccessError,
  documentClientFolderForVersions,
  loadDocumentForRead,
  loadUserNames,
} from "@/lib/api/documents";
import { parseUploadForm } from "@/app/api/v1/documents/route";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // la extracción de texto agrega trabajo a la subida (plan 4B)

type RouteContext = { params: Promise<{ id: string }> };

type ConfirmBody = {
  storage_path?: unknown;
  nombre?: unknown;
  tamano_bytes?: unknown;
  tipo_mime?: unknown;
};

/**
 * ADR-13 confirm mode (S0.9b): the browser already uploaded the bytes straight
 * to Storage, so this request carries metadata only. It authorises exactly
 * like the multipart path, rejects a key that is not this document's, verifies
 * the object exists in Storage and is not larger than declared/MAX_FILE_BYTES,
 * then inserts the same version row (same audit, same response shape).
 */
async function confirmSignedVersion(
  request: Request,
  documentoId: string,
  usuario: Usuario,
): Promise<Response> {
  const body = await parseJsonBody<ConfirmBody>(request);
  const storagePath = body?.storage_path;
  const nombre = body?.nombre;
  const tamanoBytes = body?.tamano_bytes;
  const tipoMime = typeof body?.tipo_mime === "string" ? body.tipo_mime : null;
  if (
    typeof storagePath !== "string" ||
    typeof nombre !== "string" ||
    typeof tamanoBytes !== "number" ||
    !Number.isInteger(tamanoBytes) ||
    tamanoBytes <= 0
  ) {
    return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
  }
  if (!isAllowedNameAndMime(nombre, tipoMime)) {
    return apiError(
      "Solo se aceptan PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), JPG/JPEG o PNG.",
      400,
      "VALIDATION_ERROR",
    );
  }

  const access = await loadDocumentForRead(documentoId, usuario);
  if (!access.ok) return documentAccessError(access.code);

  const clienteId = await documentClientFolderForVersions(documentoId);
  if (!assertKeyBelongsToTarget(storagePath, { kind: "documento", clienteId, documentoId })) {
    return apiError(
      "La ruta del archivo no corresponde a este documento.",
      400,
      "VALIDATION_ERROR",
    );
  }

  const supabase = createSupabaseAdmin();
  const realSize = await storedObjectSize(supabase, STORAGE_BUCKET, storagePath);
  if (realSize === null || realSize > tamanoBytes || realSize > MAX_FILE_BYTES) {
    return apiError(
      "El archivo no está disponible o supera el tamaño declarado.",
      400,
      "VALIDATION_ERROR",
    );
  }

  const ultima = await db.documentoVersion.findFirst({
    where: { documento_id: documentoId },
    orderBy: { numero_version: "desc" },
    select: { numero_version: true },
  });
  const numero = ultima ? ultima.numero_version + 1 : 1;

  // No inline text extraction: this path deliberately never reads the bytes
  // into the function. The row keeps the schema default texto_estado and the
  // backfill can pick it up later.
  const version = await db.documentoVersion.create({
    data: {
      documento_id: documentoId,
      numero_version: numero,
      storage_path: storagePath,
      tamano_bytes: realSize,
      tipo_archivo: tipoMime ?? "application/octet-stream",
      subido_por_id: usuario.id,
    },
    select: DOCUMENT_VERSION_SELECT,
  });

  await logAudit({
    entidad: "documento",
    entidad_id: documentoId,
    accion: "editar",
    usuario_id: usuario.id,
    cambios: { nueva_version: numero, nombre_archivo: nombre },
  });

  return NextResponse.json(
    {
      version: version.numero_version,
      id: version.id,
      numero_version: version.numero_version,
      tamano_bytes: version.tamano_bytes,
      tipo_archivo: version.tipo_archivo,
      created_at: version.created_at,
      subido_por_id: version.subido_por_id,
      subido_por_nombre: usuario.nombre,
    },
    { status: 201 },
  );
}

export const GET = withApiErrorHandling(
  "documents",
  "No pudimos cargar las versiones. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const access = await loadDocumentForRead(id, auth.usuario);
    if (!access.ok) return documentAccessError(access.code);

    const versiones = await db.documentoVersion.findMany({
      where: { documento_id: id },
      orderBy: { numero_version: "desc" },
      select: DOCUMENT_VERSION_SELECT,
    });
    const userNames = await loadUserNames([...new Set(versiones.map((v) => v.subido_por_id))]);

    return NextResponse.json({
      versiones: versiones.map((v) => ({
        ...v,
        subido_por_nombre: userNames.get(v.subido_por_id) ?? "—",
      })),
    });
  },
);

export const POST = withApiErrorHandling(
  "documents",
  "No pudimos guardar la versión. Inténtalo de nuevo.",
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

    // ADR-13 confirm mode (JSON metadata) vs the multipart path (bytes).
    if ((request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      return confirmSignedVersion(request, id, auth.usuario);
    }

    const form = await parseUploadForm(request, { requiereCategoria: false, categorias: [] });
    if (!form.ok) return form.response;
    const { file } = form.data;

    const access = await loadDocumentForRead(id, auth.usuario);
    if (!access.ok) return documentAccessError(access.code);

    // La siguiente versión es max(numero_version) + 1 (PRD §6.2). El unique
    // @@unique([documento_id, numero_version]) protege contra colisiones y el
    // catch externo la degrada a 500 sin crash.
    const ultima = await db.documentoVersion.findFirst({
      where: { documento_id: id },
      orderBy: { numero_version: "desc" },
      select: { numero_version: true },
    });
    const numero = ultima ? ultima.numero_version + 1 : 1;

    const storagePath = documentStoragePath(
      await documentClientFolderForVersions(id),
      id,
      numero,
      file.name,
    );
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const supabase = createSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) {
      console.error("[documents] version upload failed:", uploadError);
      return apiError("No pudimos subir el archivo. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
    }

    const version = await db.documentoVersion.create({
      data: {
        documento_id: id,
        numero_version: numero,
        storage_path: storagePath,
        tamano_bytes: file.size,
        tipo_archivo: file.type || "application/octet-stream",
        subido_por_id: auth.usuario.id,
      },
      select: DOCUMENT_VERSION_SELECT,
    });

    // Extracción inline (plan Fase 2, 4B): después del commit de la versión,
    // nunca lanza. "error" queda para que el backfill lo reintente.
    try {
      const extracted = await extractForVersion(fileBytes, file.name, file.type);
      await db.documentoVersion.update({
        where: { id: version.id },
        data: extracted,
      });
    } catch (err) {
      console.error("[documents] version text extraction failed:", err);
    }

    await logAudit({
      entidad: "documento",
      entidad_id: id,
      accion: "editar",
      usuario_id: auth.usuario.id,
      cambios: { nueva_version: numero, nombre_archivo: file.name },
    });

    return NextResponse.json(
      {
        version: version.numero_version,
        id: version.id,
        numero_version: version.numero_version,
        tamano_bytes: version.tamano_bytes,
        tipo_archivo: version.tipo_archivo,
        created_at: version.created_at,
        subido_por_id: version.subido_por_id,
        subido_por_nombre: auth.usuario.nombre,
      },
      { status: 201 },
    );
  },
);