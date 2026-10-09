// POST /api/v1/projects/:id/import — import the filled Excel template (S7 U5, E-24).
//
// Multipart `archivo` (the legacy `file` name is accepted too), 4 MB cap, never
// stored. `modo=validar` (or `?dry_run=1`) validates and reports what would be
// replaced without writing anything. Applying runs the atomic writer ONCE inside
// ONE transaction: a workbook with any error leaves the draft byte-identical.
//
// Order: project (404) -> permission (403) -> estado (409) -> size (413) -> body
// shape and file type (400) -> zip guard (400) -> parse (400) -> validation (400
// with the per-rule report) -> write. ADM/GER and BORRADOR only; the route never
// changes the project estado.

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { gateEstructuraWrite } from "@/lib/api/estructura";
import { isAllowedNameAndMime } from "@/lib/api/files";
import { RespuestaAbortada } from "@/lib/api/presupuesto";
import {
  cargarContexto,
  contarReemplazo,
  importarPlantilla,
  inspeccionarZip,
  resumenDePlan,
} from "@/lib/api/plantilla-import";
import { IMPORT_MAX_BYTES } from "@/lib/proyectos/plantilla/columns";
import { construirPlan } from "@/lib/proyectos/plantilla/mapear";
import { PlantillaIlegible, parsePlantilla } from "@/lib/proyectos/plantilla/parse";
import { validarPlantilla } from "@/lib/proyectos/plantilla/validate";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const IMPORT_STATE_MESSAGE = "Solo se puede importar una plantilla en un proyecto en Borrador.";
export const PLANTILLA_INVALIDA_MESSAGE = "El archivo no es una plantilla válida.";
export const IMPORT_TOO_LARGE_MESSAGE = "El archivo supera el límite de 4 MB.";

/** Multipart framing (boundaries, field headers) the declared length carries on top of the file. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos importar la plantilla. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEstructuraWrite(auth.usuario, id, IMPORT_STATE_MESSAGE);
    if (!gate.ok) return gate.response;

    // 413 first: a declared length far above the cap is refused before reading the body.
    const declarada = Number(request.headers.get("content-length"));
    if (Number.isFinite(declarada) && declarada > IMPORT_MAX_BYTES + MULTIPART_OVERHEAD_BYTES) {
      return apiError(IMPORT_TOO_LARGE_MESSAGE, 413, "FILE_TOO_LARGE");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const archivo = form.get("archivo") ?? form.get("file");
    if (!(archivo instanceof File)) {
      return apiError("Adjunta la plantilla en el campo 'archivo'.", 400, "VALIDATION_ERROR");
    }
    if (archivo.size > IMPORT_MAX_BYTES) {
      return apiError(IMPORT_TOO_LARGE_MESSAGE, 413, "FILE_TOO_LARGE");
    }
    if (!/\.xlsx$/i.test(archivo.name) || !isAllowedNameAndMime(archivo.name, archivo.type)) {
      return apiError("Solo se acepta la plantilla en formato Excel (.xlsx).", 400, "VALIDATION_ERROR");
    }

    const soloValidar =
      form.get("modo") === "validar" || new URL(request.url).searchParams.get("dry_run") === "1";

    const buffer = Buffer.from(await archivo.arrayBuffer());
    if (!(await inspeccionarZip(buffer))) {
      return apiError(PLANTILLA_INVALIDA_MESSAGE, 400, "VALIDATION_ERROR");
    }

    try {
      let parsed;
      try {
        parsed = await parsePlantilla(buffer);
      } catch (error) {
        if (error instanceof PlantillaIlegible) {
          return apiError(PLANTILLA_INVALIDA_MESSAGE, 400, "VALIDATION_ERROR");
        }
        throw error;
      }

      const contexto = await cargarContexto(db, id);
      const resultado = validarPlantilla(parsed, contexto);
      if (resultado.errores.length > 0) {
        return apiError(
          "La plantilla tiene errores. Corrígelos y vuelve a subirla.",
          400,
          "VALIDATION_ERROR",
          {
            reporte: {
              errores: resultado.errores,
              advertencias: resultado.advertencias,
              resumen: resultado.resumen,
              truncado: resultado.truncado,
            },
          },
        );
      }

      const plan = construirPlan(parsed, contexto);

      if (soloValidar) {
        return NextResponse.json({
          importado: false,
          valido: true,
          resumen: resumenDePlan(plan),
          reemplaza: await contarReemplazo(db, id),
          advertencias: resultado.advertencias,
        });
      }

      const loteId = randomUUID();
      const resumen = await db.$transaction(
        (tx) => importarPlantilla(tx, { proyectoId: id, usuarioId: auth.usuario.id, plan, loteId }),
        TX_OPTIONS,
      );
      return NextResponse.json({
        importado: true,
        lote_id: loteId,
        resumen,
        advertencias: resultado.advertencias,
      });
    } catch (error) {
      if (error instanceof RespuestaAbortada) return error.response;
      throw error;
    }
  },
);
