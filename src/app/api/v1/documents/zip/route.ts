// POST /api/v1/documents/zip — descarga múltiple (PRD §6.2 "individual y
// múltiple en .zip"). Body { ids: string[] } (mín 1, máx 50 documentos, PRD
// §8.4). Por cada documento se obtiene la versión activa (signed URL de 60 s
// y fetch server-side con redirect follow), y se empaqueta un .zip con
// `documentos.zip`. Robustez por archivo: si un documento no tiene versión o
// el fetch del signed URL falla, se salta el archivo y se incluye un
// README.txt dentro del zip listando los fallos (nunca un crash). Los
// COLABORADOR no pueden incluir documentos de categorías restringidas (403
// temprano, antes de cualquier signed URL).

import JSZip from "jszip";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { zodError } from "@/lib/api/crm";
import {
  extensionFromStoragePath,
  sanitizeFileName,
  STORAGE_BUCKET,
} from "@/lib/api/files";
import {
  canReadCategory,
  loadActiveVersions,
} from "@/lib/api/documents";

export const dynamic = "force-dynamic";

const MAX_ZIP_DOCUMENTS = 50; // límite v1 de la descarga múltiple.

const ZIP_SCHEMA = z.object({
  ids: z
    .array(z.string().min(1, "Hay un id de documento vacío."))
    .min(1, "Selecciona al menos un documento.")
    .max(MAX_ZIP_DOCUMENTS, `Máximo ${MAX_ZIP_DOCUMENTS} documentos por descarga.`),
});

/** Nombre de la entrada en el zip: `${sanitize(titulo)}_v${n}${ext}`. */
function zipEntryName(titulo: string, numero: number, ext: string): string {
  return `${sanitizeFileName(titulo)}_v${numero}${ext}`;
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  // Storage necesita credenciales de Supabase sí o sí: sin ellas no hay zip.
  if (!isSupabaseConfigured()) {
    return apiError(
      "Plataforma no configurada. Revisa las variables de entorno.",
      500,
      "INTERNAL_ERROR",
    );
  }

  const body = await parseJsonBody<unknown>(request);
  if (body === null) {
    return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
  }
  const parsed = ZIP_SCHEMA.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  try {
    const ids = [...new Set(parsed.data.ids)];
    const documentos = await db.documento.findMany({
      where: { id: { in: ids }, deleted_at: null },
      select: { id: true, titulo: true, categoria: true },
    });
    if (documentos.length !== ids.length) {
      return apiError("Uno de los documentos no existe.", 404, "NOT_FOUND");
    }

    // Categorías restringidas: fuera del alcance del COLABORADOR; 403 antes de
    // generar cualquier signed URL.
    const restringido = documentos.find((d) => !canReadCategory(auth.usuario, d.categoria));
    if (restringido) {
      return apiError("No tienes permisos sobre uno de los documentos.", 403, "FORBIDDEN");
    }

    const activeVersions = await loadActiveVersions(documentos.map((d) => d.id));
    const supabase = createSupabaseAdmin();
    const zip = new JSZip();
    const fallos: string[] = [];

    for (const doc of documentos) {
      const version = activeVersions.get(doc.id);
      if (!version) {
        fallos.push(`${doc.titulo} — sin versión disponible.`);
        continue;
      }
      try {
        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(version.storage_path, 60);
        if (error || !data) throw error ?? new Error("signed url vacío");

        const resp = await fetch(data.signedUrl, { redirect: "follow" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const bytes = await resp.arrayBuffer();

        zip.file(
          zipEntryName(doc.titulo, version.numero_version, extensionFromStoragePath(version.storage_path)),
          new Uint8Array(bytes),
        );
      } catch (err) {
        console.error("[documents] zip fetch failed for", doc.id, err);
        fallos.push(`${doc.titulo} — no pudimos descargar la versión activa.`);
      }
    }

    if (fallos.length > 0) {
      zip.file(
        "README.txt",
        [
          "Muttu Hub — descarga múltiple de documentos",
          "",
          "No se pudieron incluir los siguientes archivos:",
          ...fallos.map((f) => `- ${f}`),
        ].join("\n"),
      );
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="documentos.zip"',
      },
    });
  } catch (err) {
    console.error("[documents] zip failed:", err);
    return apiError("No pudimos generar la descarga. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}