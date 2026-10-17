// POST /api/v1/projects/:id/budget/import — load the budget from the PO's simple
// workbook (`rubro | valor (COP)`), feature `importar-presupuesto-po`.
//
// Multipart `archivo`, 4 MB cap, never stored. `modo=validar` answers the preview
// (current vs new amount per rubro, the new sum against `valor_total`) without
// writing. Applying writes in ONE transaction exactly what the manual budget
// edit (`PUT /budget`) writes: the same lines and one audit entry per changed
// line. Every ACTIVE rubro is covered: one missing from the file goes to $0.
// The monthly programming is never touched.
//
// Order: project (404) -> permission (403) -> estado (409), the same gate as the
// manual edit -> size (413) -> body and file type (400) -> zip guard (400) ->
// rows (400 with the per-row report) -> preview or write.

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { isAllowedNameAndMime } from "@/lib/api/files";
import { RespuestaAbortada, gatePresupuestoWrite, loadBudgetView } from "@/lib/api/presupuesto";
import { inspeccionarZip } from "@/lib/api/plantilla-import";
import { IMPORT_MAX_BYTES } from "@/lib/proyectos/plantilla/columns";
import { parsePresupuestoPO } from "@/lib/proyectos/presupuesto-po/parse";
import { construirVistaPrevia } from "@/lib/proyectos/presupuesto-po/preview";
import { aplicarPresupuestoPO } from "@/lib/proyectos/presupuesto-po/server";
import type { Cents } from "@/lib/proyectos/money";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const PRESUPUESTO_EXCEL_INVALIDO = "El archivo no es un Excel válido.";
export const PRESUPUESTO_TOO_LARGE = "El archivo supera el límite de 4 MB.";
export const PRESUPUESTO_CON_ERRORES = "El archivo tiene errores. Corrígelos y vuelve a subirlo.";

/** Multipart framing (boundaries, field headers) the declared length carries on top of the file. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export type ErrorImportacionPresupuesto = { fila: number | null; rubro: string | null; mensaje: string };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos importar el presupuesto. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gatePresupuestoWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const declarada = Number(request.headers.get("content-length"));
    if (Number.isFinite(declarada) && declarada > IMPORT_MAX_BYTES + MULTIPART_OVERHEAD_BYTES) {
      return apiError(PRESUPUESTO_TOO_LARGE, 413, "FILE_TOO_LARGE");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const archivo = form.get("archivo");
    if (!(archivo instanceof File)) {
      return apiError("Adjunta el presupuesto en el campo 'archivo'.", 400, "VALIDATION_ERROR");
    }
    if (archivo.size > IMPORT_MAX_BYTES) return apiError(PRESUPUESTO_TOO_LARGE, 413, "FILE_TOO_LARGE");
    if (!/\.xlsx$/i.test(archivo.name) || !isAllowedNameAndMime(archivo.name, archivo.type)) {
      return apiError("Solo se acepta el presupuesto en formato Excel (.xlsx).", 400, "VALIDATION_ERROR");
    }
    const soloValidar = form.get("modo") === "validar";

    const buffer = Buffer.from(await archivo.arrayBuffer());
    if (!(await inspeccionarZip(buffer))) return apiError(PRESUPUESTO_EXCEL_INVALIDO, 400, "VALIDATION_ERROR");

    // Only ACTIVE rubros match: a suspended one in the file is an unknown rubro.
    const catalogo = await db.rubro.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true, activo: true },
    });
    const resultado = await parsePresupuestoPO(
      buffer,
      catalogo.filter((r) => r.activo),
    );

    const errores: ErrorImportacionPresupuesto[] = [
      ...resultado.erroresArchivo.map((mensaje) => ({ fila: null, rubro: null, mensaje })),
      ...resultado.filas.flatMap((f) =>
        f.error === null ? [] : [{ fila: f.fila, rubro: f.rubroTexto === "" ? null : f.rubroTexto, mensaje: f.error }],
      ),
    ];
    if (errores.length > 0) {
      return apiError(PRESUPUESTO_CON_ERRORES, 400, "VALIDATION_ERROR", { reporte: { errores } });
    }

    const montos = new Map<string, Cents>();
    for (const fila of resultado.filas) montos.set(fila.rubroId as string, fila.cents as Cents);

    if (soloValidar) {
      const view = await loadBudgetView(db, id, gate.value.estado, gate.value.valor_total);
      return NextResponse.json({ importado: false, valido: true, ...construirVistaPrevia(view, montos) });
    }

    try {
      const aplicado = await db.$transaction((tx) =>
        aplicarPresupuestoPO(tx, {
          proyectoId: id,
          usuarioId: auth.usuario.id,
          montos,
          oportunidad: gate.value.oportunidad,
        }),
      );
      return NextResponse.json({ importado: true, ...aplicado });
    } catch (error) {
      if (error instanceof RespuestaAbortada) return error.response;
      throw error;
    }
  },
);
