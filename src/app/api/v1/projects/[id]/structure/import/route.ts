// POST /api/v1/projects/:id/structure/import — import the structure from the PO's
// workbook (B3): objetivos, indicadores, actividades and entregables with
// system-generated codes, keeping the budget (PO decision D-A).
//
// Multipart `archivo`, 4 MB cap, never stored. `modo=validar` answers the preview
// (the plan with its codes and what it would replace) without writing. Applying
// runs the writer ONCE inside ONE transaction: a file with any error leaves the
// draft untouched.
//
// Order: project (404) -> permission (403) -> estado (409) -> size (413) -> body
// shape and file type (400) -> zip guard (400) -> parse (400 with the report) ->
// write. Same roles as the template import; BORRADOR only.

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { gateEstructuraWrite } from "@/lib/api/estructura";
import { isAllowedNameAndMime } from "@/lib/api/files";
import { RespuestaAbortada } from "@/lib/api/presupuesto";
import { contarReemplazo, inspeccionarZip } from "@/lib/api/plantilla-import";
import { duracionSemanas, importarEstructuraPO } from "@/lib/api/estructura-po-import";
import { IMPORT_MAX_BYTES } from "@/lib/proyectos/plantilla/columns";
import { ARCHIVO_ILEGIBLE, parseEstructuraPO } from "@/lib/proyectos/estructura-po/parse";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const ESTRUCTURA_PO_STATE_MESSAGE = "Solo se puede importar la estructura en un proyecto en Borrador.";
export const ESTRUCTURA_PO_CON_ERRORES = "El archivo tiene errores. Corrígelos y vuelve a subirlo.";
export const ESTRUCTURA_PO_TOO_LARGE = "El archivo supera el límite de 4 MB.";

/** Multipart framing (boundaries, field headers) the declared length carries on top of the file. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos importar la estructura. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEstructuraWrite(auth.usuario, id, ESTRUCTURA_PO_STATE_MESSAGE);
    if (!gate.ok) return gate.response;

    const declarada = Number(request.headers.get("content-length"));
    if (Number.isFinite(declarada) && declarada > IMPORT_MAX_BYTES + MULTIPART_OVERHEAD_BYTES) {
      return apiError(ESTRUCTURA_PO_TOO_LARGE, 413, "FILE_TOO_LARGE");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const archivo = form.get("archivo");
    if (!(archivo instanceof File)) {
      return apiError("Adjunta el archivo en el campo 'archivo'.", 400, "VALIDATION_ERROR");
    }
    if (archivo.size > IMPORT_MAX_BYTES) return apiError(ESTRUCTURA_PO_TOO_LARGE, 413, "FILE_TOO_LARGE");
    if (!/\.xlsx$/i.test(archivo.name) || !isAllowedNameAndMime(archivo.name, archivo.type)) {
      return apiError("Solo se acepta el archivo en formato Excel (.xlsx).", 400, "VALIDATION_ERROR");
    }
    const soloValidar = form.get("modo") === "validar";

    const buffer = Buffer.from(await archivo.arrayBuffer());
    if (!(await inspeccionarZip(buffer))) return apiError(ARCHIVO_ILEGIBLE, 400, "VALIDATION_ERROR");

    const resultado = await parseEstructuraPO(buffer, { duracionSemanas: duracionSemanas(gate.value) });
    if (resultado.errores.length > 0) {
      return apiError(ESTRUCTURA_PO_CON_ERRORES, 400, "VALIDATION_ERROR", {
        reporte: { errores: resultado.errores, resumen: resultado.resumen, truncado: resultado.truncado },
      });
    }

    if (soloValidar) {
      return NextResponse.json({
        importado: false,
        valido: true,
        resumen: resultado.resumen,
        plan: resultado.plan,
        reemplaza: await contarReemplazo(db, id),
      });
    }

    const loteId = randomUUID();
    try {
      const resumen = await db.$transaction(
        (tx) =>
          importarEstructuraPO(tx, {
            proyectoId: id,
            usuarioId: auth.usuario.id,
            plan: resultado.plan,
            loteId,
            stateMessage: ESTRUCTURA_PO_STATE_MESSAGE,
          }),
        TX_OPTIONS,
      );
      return NextResponse.json({ importado: true, lote_id: loteId, resumen });
    } catch (error) {
      if (error instanceof RespuestaAbortada) return error.response;
      throw error;
    }
  },
);
