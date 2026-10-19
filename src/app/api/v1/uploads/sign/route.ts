// POST /api/v1/uploads/sign — ADR-13 signed direct-to-storage upload (S0.9b).
//
// The app's policy is 25 MB, but any multipart upload through a route handler
// is capped by the hosting platform's request-body limit (~4.5 MB on Vercel),
// which binds BEFORE the route's own checks. This endpoint keeps the bytes out
// of the function: it authorises the actor on the target, validates the shared
// upload policy, computes the storage KEY server-side (never accepts one from
// the client) and returns a Supabase signed upload URL plus the policy limits.
// The browser then uploads straight to Storage and confirms with metadata only
// (see the JSON branch of the document/version/attachment routes).
//
// Never returns the service key, bucket credentials, or a public object URL.

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getTaskForWrite } from "@/lib/api/crm";
import {
  documentAccessError,
  documentClientFolderForVersions,
  guardDocumentCreate,
  loadDocumentForRead,
} from "@/lib/api/documents";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import {
  ALLOWED_FILE_EXTENSIONS,
  MAX_FILE_BYTES,
  MAX_FILE_MB,
  STORAGE_BUCKET,
  documentStoragePath,
  isAllowedNameAndMime,
} from "@/lib/api/files";
import { withApiErrorHandling } from "@/lib/api/handler";
import { taskAttachmentStoragePath } from "@/lib/api/signed-upload";
import { db } from "@/lib/db";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SignBody = {
  kind?: unknown;
  ref_id?: unknown;
  nombre?: unknown;
  tamano_bytes?: unknown;
  tipo_mime?: unknown;
  cliente_id?: unknown;
  titulo?: unknown;
  categoria?: unknown;
  force?: unknown;
};

const BAD_BODY = "Cuerpo de la solicitud no válido.";
const BAD_TYPE =
  "Solo se aceptan PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), JPG/JPEG o PNG.";

export const POST = withApiErrorHandling(
  "uploads",
  "No pudimos preparar la subida. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    // Storage necesita credenciales de Supabase sí o sí: sin ellas no hay URL.
    if (!isSupabaseConfigured()) {
      return apiError(
        "Plataforma no configurada. Revisa las variables de entorno.",
        500,
        "INTERNAL_ERROR",
      );
    }

    const body = await parseJsonBody<SignBody>(request);
    if (!body || typeof body !== "object") {
      return apiError(BAD_BODY, 400, "VALIDATION_ERROR");
    }
    const { kind, ref_id: refId, nombre, tamano_bytes: tamanoBytes } = body;
    if (
      kind !== "tarea_adjunto" &&
      kind !== "documento_version" &&
      kind !== "documento_nuevo"
    ) {
      return apiError(BAD_BODY, 400, "VALIDATION_ERROR");
    }
    // ref_id identifies an EXISTING target. A brand-new document has no id yet
    // (the endpoint pre-generates it below), so it is the only kind that does
    // not carry one.
    if (kind !== "documento_nuevo" && (typeof refId !== "string" || !refId.trim())) {
      return apiError(BAD_BODY, 400, "VALIDATION_ERROR");
    }
    if (typeof nombre !== "string" || !nombre.trim()) {
      return apiError(BAD_BODY, 400, "VALIDATION_ERROR");
    }
    if (
      typeof tamanoBytes !== "number" ||
      !Number.isInteger(tamanoBytes) ||
      tamanoBytes <= 0
    ) {
      return apiError(BAD_BODY, 400, "VALIDATION_ERROR");
    }
    const tipoMime = typeof body.tipo_mime === "string" ? body.tipo_mime : null;
    const clienteId =
      typeof body.cliente_id === "string" && body.cliente_id.trim()
        ? body.cliente_id.trim()
        : null;
    const titulo = typeof body.titulo === "string" ? body.titulo : "";
    const categoria = typeof body.categoria === "string" ? body.categoria : "";
    const force = body.force === true;
    // Creating a document also has to describe the row it will create: the
    // create gates in the authorise phase run before any URL is issued
    // (correction B1), so the shape phase must require titulo and categoria.
    if (
      kind === "documento_nuevo" &&
      (typeof body.titulo !== "string" ||
        !body.titulo.trim() ||
        typeof body.categoria !== "string" ||
        !body.categoria.trim())
    ) {
      return apiError(BAD_BODY, 400, "VALIDATION_ERROR");
    }

    // Shared policy, checked before any URL is issued.
    if (!isAllowedNameAndMime(nombre, tipoMime)) {
      return apiError(BAD_TYPE, 400, "VALIDATION_ERROR");
    }
    if (tamanoBytes > MAX_FILE_BYTES) {
      return apiError(`El archivo supera el límite de ${MAX_FILE_MB} MB.`, 413, "FILE_TOO_LARGE");
    }

    // Authorise the target and choose the key server-side. Never accept a key
    // from the client.
    let storagePath: string;
    // Only a brand-new document gets a pre-generated id returned to the client
    // so the confirm step can prove the key it received is the key it used.
    let documentoId: string | undefined;
    if (kind === "tarea_adjunto") {
      const access = await getTaskForWrite(refId as string, auth.usuario);
      if (!access.ok) {
        return apiError(
          access.code === "NOT_FOUND" ? "La tarea no existe." : "No tienes permisos sobre esta tarea.",
          access.code === "NOT_FOUND" ? 404 : 403,
          access.code,
        );
      }
      storagePath = taskAttachmentStoragePath(refId as string, nombre);
    } else if (kind === "documento_version") {
      const access = await loadDocumentForRead(refId as string, auth.usuario);
      if (!access.ok) return documentAccessError(access.code);
      // Same next-version and client-folder rules the versions route uses.
      const ultima = await db.documentoVersion.findFirst({
        where: { documento_id: refId as string },
        orderBy: { numero_version: "desc" },
        select: { numero_version: true },
      });
      const numero = ultima ? ultima.numero_version + 1 : 1;
      const versionClienteId = await documentClientFolderForVersions(refId as string);
      storagePath = documentStoragePath(versionClienteId, refId as string, numero, nombre);
    } else {
      // ADR-13 / S0.9b item 1: creating a document pre-generates the id and
      // signs the FINAL key (no temporary key, no rename — the never-delete
      // policy forbids moving the object afterwards). The id returned here is
      // the id the confirm step must create.
      //
      // Correction B1: run the SAME create gates the multipart branch runs
      // (categoria validity, restricted-category authorization, duplicate-title
      // conflict) BEFORE issuing the URL, so a request that the old multipart
      // flow rejected side-effect-free never leaves an orphan Storage object.
      // The confirm branch re-runs them as defence in depth (the sign→confirm
      // race is unavoidable).
      const gate = await guardDocumentCreate({
        usuario: auth.usuario,
        titulo,
        categoria,
        force,
      });
      if (!gate.ok) return gate.response;

      if (clienteId) {
        const cliente = await db.cliente.findFirst({
          where: { id: clienteId, deleted_at: null },
          select: { id: true },
        });
        if (!cliente) {
          return apiError("El cliente no existe o fue eliminado.", 400, "VALIDATION_ERROR");
        }
      }
      documentoId = randomUUID();
      storagePath = documentStoragePath(clienteId, documentoId, 1, nombre);
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error || !data) {
      console.error("[uploads] signed upload URL failed:", error);
      return apiError("No pudimos preparar la subida. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
    }

    return NextResponse.json({
      storage_path: storagePath,
      token: data.token,
      signed_url: data.signedUrl,
      max_bytes: MAX_FILE_BYTES,
      allowed_extensions: [...ALLOWED_FILE_EXTENSIONS],
      ...(documentoId ? { documento_id: documentoId } : {}),
    });
  },
);
