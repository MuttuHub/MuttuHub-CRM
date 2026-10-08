// GET /api/v1/projects/:id/progress/:progressId/attachments — live medios of an avance (S4 U3).
// POST — attach a medio: confirm an object already uploaded with a signed URL
// (`{ storage_path, nombre, tamano_bytes, tipo_mime? }`) or link an external https
// URL (`{ url_externa, nombre }`).
//
// Write: ADMINISTRADOR/GERENCIA or an active-member COORDINADOR on an EN_EJECUCION
// project (404 -> 403 -> 409), on a non-voided avance (409). A file is confirmed
// only when its key sits under THIS project's `soportes` prefix, the object exists
// in storage and is not larger than declared or than the app limit; the stored row
// keeps the REAL size. Never deletes from storage; the same object cannot back two
// medios. Once an avance has a live medio it `cuenta` (REQ-EXE-03).

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logChange } from "@/lib/api/audit-cambios";
import { conflict, isUniqueViolation, parseEstructuraBody } from "@/lib/api/estructura";
import {
  avanceCuenta,
  gateEjecucionRead,
  gateEjecucionWrite,
  loadAvanceParaMedio,
  toMedioView,
} from "@/lib/api/ejecucion";
import { MAX_FILE_BYTES, STORAGE_BUCKET, isAllowedNameAndMime, isValidExternalUrl } from "@/lib/api/files";
import { assertKeyBelongsToTarget, storedObjectSize } from "@/lib/api/signed-upload";
import { getSemaforoParametrosV2 } from "@/lib/settings";
import { FILE_TYPE_MESSAGE } from "./sign/route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; progressId: string }> };

export const STORAGE_PATH_INDEX = "soportes_proyecto_storage_path_key";
export const MEDIO_DUPLICADO_MESSAGE = "Ese archivo ya está adjunto como medio.";
export const MEDIO_CLAVE_MESSAGE = "La ruta del archivo no corresponde a este proyecto.";
export const MEDIO_ARCHIVO_MESSAGE = "El archivo no está disponible o supera el tamaño declarado.";
export const MEDIO_URL_MESSAGE = "El enlace debe ser una URL https válida (máximo 2000 caracteres).";

const nombreField = z
  .string({ error: "El nombre es obligatorio." })
  .trim()
  .min(1, "El nombre es obligatorio.")
  .max(200, "El nombre es demasiado largo.");

export const MEDIO_ARCHIVO_SCHEMA = z
  .object({
    storage_path: z.string({ error: "La ruta del archivo es obligatoria." }).min(1, "La ruta del archivo es obligatoria.").max(500),
    nombre: nombreField,
    tamano_bytes: z.number({ error: "El tamaño no es válido." }).int("El tamaño no es válido.").min(1, "El tamaño no es válido."),
    tipo_mime: z.string().max(200).nullable().optional(),
  })
  .strict();

export const MEDIO_ENLACE_SCHEMA = z
  .object({
    url_externa: z.string({ error: MEDIO_URL_MESSAGE }).refine(isValidExternalUrl, { message: MEDIO_URL_MESSAGE }),
    nombre: nombreField,
  })
  .strict();

export const MEDIO_CREATE_SCHEMA = z.union([MEDIO_ARCHIVO_SCHEMA, MEDIO_ENLACE_SCHEMA]);

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los medios. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, progressId } = await ctx.params;

    const gate = await gateEjecucionRead(auth.usuario, id);
    if (!gate.ok) return gate.response;
    const avance = await loadAvanceParaMedio(id, progressId, { permitirAnulado: true });
    if (!avance.ok) return avance.response;

    const medios = await db.soporteProyecto.findMany({
      where: { avance_id: progressId, proyecto_id: id, deleted_at: null },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });
    return NextResponse.json({ medios: medios.map(toMedioView) });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos adjuntar el medio. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, progressId } = await ctx.params;

    const gate = await gateEjecucionWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;
    const avance = await loadAvanceParaMedio(id, progressId);
    if (!avance.ok) return avance.response;

    // A link body names `url_externa`; anything else is read as a file confirmation, so the
    // validation message points at the right field instead of a generic union error.
    const probe = await parseJsonBody<unknown>(request.clone());
    const esEnlace = probe !== null && typeof probe === "object" && "url_externa" in probe;
    const body = await parseEstructuraBody(request, esEnlace ? MEDIO_ENLACE_SCHEMA : MEDIO_ARCHIVO_SCHEMA);
    if (!body.ok) return body.response;
    const input = body.value;

    let datos: {
      nombre: string;
      storage_path: string | null;
      url_externa: string | null;
      tipo_mime: string | null;
      tamano_bytes: number | null;
    };

    if ("url_externa" in input) {
      datos = { nombre: input.nombre, storage_path: null, url_externa: input.url_externa, tipo_mime: null, tamano_bytes: null };
    } else {
      const tipoMime = input.tipo_mime ?? null;
      if (!isAllowedNameAndMime(input.nombre, tipoMime)) {
        return apiError(FILE_TYPE_MESSAGE, 400, "VALIDATION_ERROR");
      }
      if (!assertKeyBelongsToTarget(input.storage_path, { kind: "proyecto_soporte", proyectoId: id })) {
        return apiError(MEDIO_CLAVE_MESSAGE, 400, "VALIDATION_ERROR");
      }
      if (!isSupabaseConfigured()) {
        return apiError("Plataforma no configurada. Revisa las variables de entorno.", 500, "INTERNAL_ERROR");
      }
      const realSize = await storedObjectSize(createSupabaseAdmin(), STORAGE_BUCKET, input.storage_path);
      if (realSize === null || realSize > input.tamano_bytes || realSize > MAX_FILE_BYTES) {
        return apiError(MEDIO_ARCHIVO_MESSAGE, 400, "VALIDATION_ERROR");
      }
      datos = {
        nombre: input.nombre,
        storage_path: input.storage_path,
        url_externa: null,
        tipo_mime: tipoMime,
        tamano_bytes: realSize,
      };
    }

    const parametros = await getSemaforoParametrosV2();

    try {
      const { medio, medios } = await db.$transaction(async (tx) => {
        const created = await tx.soporteProyecto.create({
          data: { proyecto_id: id, avance_id: progressId, subido_por_id: auth.usuario.id, ...datos },
        });
        await logChange(tx, {
          usuario_id: auth.usuario.id,
          accion: "CREAR",
          entidad: "avance",
          entidad_id: progressId,
          proyecto_id: id,
          campo: "medio",
          valor_nuevo: {
            medio_id: created.id,
            nombre: created.nombre,
            tipo: created.storage_path ? "archivo" : "enlace",
            url_externa: created.url_externa,
            tamano_bytes: created.tamano_bytes,
          },
        });
        const total = await tx.soporteProyecto.count({ where: { avance_id: progressId, deleted_at: null } });
        return { medio: created, medios: total };
      });

      return NextResponse.json(
        { medio: toMedioView(medio), cuenta: avanceCuenta(false, parametros.avance_requiere_medio.valor, medios) },
        { status: 201 },
      );
    } catch (err) {
      if (isUniqueViolation(err, STORAGE_PATH_INDEX)) return conflict(MEDIO_DUPLICADO_MESSAGE);
      throw err;
    }
  },
);
