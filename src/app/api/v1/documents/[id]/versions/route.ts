// GET/POST /api/v1/documents/:id/versions — historial y subida de versiones
// (PRD §6.2 "Versionado").
// POST: multipart/form-data con el campo `file` (mismas reglas que la
// creación: <= 10 MB, PDF/DOCX/XLSX/JPG/PNG). La versión nueva siempre es
// max(numero_version) + 1 y pasa a ser la activa (el botón principal de
// descarga usa la de mayor numero). El versionado nunca es automático por
// detección de nombre de archivo.
// GET: todas las versiones en orden descendente, con nombre del subidor
// (resuelto por lote — DocumentoVersion no tiene FK a Usuario en el schema).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { documentStoragePath, STORAGE_BUCKET } from "@/lib/api/files";
import {
  DOCUMENT_VERSION_SELECT,
  documentAccessError,
  documentClientFolderForVersions,
  loadDocumentForRead,
  loadUserNames,
} from "@/lib/api/documents";
import { parseUploadForm } from "@/app/api/v1/documents/route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  try {
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
  } catch (err) {
    console.error("[documents] versions list failed:", err);
    return apiError("No pudimos cargar las versiones. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}

export async function POST(request: Request, ctx: RouteContext) {
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

  const form = await parseUploadForm(request, { requiereCategoria: false, categorias: [] });
  if (!form.ok) return form.response;
  const { file } = form.data;

  try {
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
    const supabase = createSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, new Uint8Array(await file.arrayBuffer()), {
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
  } catch (err) {
    console.error("[documents] version create failed:", err);
    return apiError("No pudimos guardar la versión. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}