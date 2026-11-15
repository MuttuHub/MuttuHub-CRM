// POST /api/v1/projects/:id/expenses/import — register many expenses from one workbook (one row per distribution
// line, no supports: they are attached afterwards, S2), feature `importar-gastos`.
//
// Multipart `archivo`, 4 MB cap, never stored. `modo=validar` answers the preview (every row valid or
// invalid with its reason, plus the non-blocking alerts) without writing. Applying creates ONLY the valid
// docs, in ONE transaction, as REGISTRADO, exactly as `POST /expenses` writes an invoice (header plus its
// `gastos_reparto` rows, same rules, same audit shape) with one shared `lote_id`; the rejected rows come back
// with their reason. File-level problems (not a workbook, missing headers, no rows, too many rows) reject the
// whole file with the 400 report.
//
// S9/T14.3: the rows of one document — same tercero and número de documento — are ONE distributed invoice, not
// duplicates; the invoice is written, alerted and checked for duplicates as a whole, and it is rejected as a
// whole when its rows do not add up.
//
// Order: project (404) -> permission (403) -> estado (409), the gate of POST /expenses -> size (413)
// -> body and file type (400) -> zip guard (400) -> file errors (400) -> preview or write.

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { MODO_INVALIDO_MESSAGE, leerModoImport } from "@/lib/api/import-modo";
import { withApiErrorHandling } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { isAllowedNameAndMime } from "@/lib/api/files";
import { gateEjecucionWrite } from "@/lib/api/ejecucion";
import { inspeccionarZip } from "@/lib/api/plantilla-import";
import { alertaSobregasto, cargarSobregastos, type AlertaGasto, type LineaGasto } from "@/lib/api/gastos";
import { IMPORT_MAX_BYTES } from "@/lib/proyectos/plantilla/columns";
import {
  parseGastosImport,
  type DatosFacturaImport,
  type FacturaGastoImport,
  type FilaGastoImport,
} from "@/lib/proyectos/gastos-import/parse";
import { alertasDeFactura, aplicarGastosImport, cargarContextoImport, duplicadosDeFactura } from "@/lib/proyectos/gastos-import/server";
import { fromCents, sumCents } from "@/lib/proyectos/money";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GASTOS_EXCEL_INVALIDO = "El archivo no es un Excel válido.";
export const GASTOS_TOO_LARGE = "El archivo supera el límite de 4 MB.";
export const GASTOS_CON_ERRORES = "El archivo tiene errores. Corrígelos y vuelve a subirlo.";
export const GASTOS_SIN_FILAS_VALIDAS = "Ninguna fila es válida: no se importó nada. Corrige los errores y vuelve a subirlo.";

/** Multipart framing (boundaries, field headers) the declared length carries on top of the file. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export type ErrorImportacionGastos = { fila: number | null; rubro: string | null; mensaje: string };

type FacturaValida = FacturaGastoImport & { datos: DatosFacturaImport };
const esFacturaValida = (f: FacturaGastoImport): f is FacturaValida => f.error === null && f.datos !== null;

const errorDeFila = (f: FilaGastoImport): ErrorImportacionGastos => ({
  fila: f.fila,
  rubro: f.rubroTexto === "" ? null : f.rubroTexto,
  mensaje: f.error as string,
});

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos importar los gastos. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEjecucionWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const declarada = Number(request.headers.get("content-length"));
    if (Number.isFinite(declarada) && declarada > IMPORT_MAX_BYTES + MULTIPART_OVERHEAD_BYTES) {
      return apiError(GASTOS_TOO_LARGE, 413, "FILE_TOO_LARGE");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const archivo = form.get("archivo");
    if (!(archivo instanceof File)) {
      return apiError("Adjunta los gastos en el campo 'archivo'.", 400, "VALIDATION_ERROR");
    }
    if (archivo.size > IMPORT_MAX_BYTES) return apiError(GASTOS_TOO_LARGE, 413, "FILE_TOO_LARGE");
    if (!/\.xlsx$/i.test(archivo.name) || !isAllowedNameAndMime(archivo.name, archivo.type)) {
      return apiError("Solo se aceptan los gastos en formato Excel (.xlsx).", 400, "VALIDATION_ERROR");
    }
    const modo = leerModoImport(form.get("modo"));
    if (modo === null) return apiError(MODO_INVALIDO_MESSAGE, 400, "VALIDATION_ERROR");
    const soloValidar = modo === "validar";

    const buffer = Buffer.from(await archivo.arrayBuffer());
    if (!(await inspeccionarZip(buffer))) return apiError(GASTOS_EXCEL_INVALIDO, 400, "VALIDATION_ERROR");

    const { contexto, lineas } = await cargarContextoImport(gate.value);
    const resultado = await parseGastosImport(buffer, contexto);
    if (resultado.erroresArchivo.length > 0) {
      const errores: ErrorImportacionGastos[] = resultado.erroresArchivo.map((mensaje) => ({ fila: null, rubro: null, mensaje }));
      return apiError(GASTOS_CON_ERRORES, 400, "VALIDATION_ERROR", { reporte: { errores } });
    }

    const validas = resultado.filas.filter((f) => f.error === null);
    const facturasValidas = resultado.facturas.filter(esFacturaValida);
    // The rows that open a document: the alerts of the whole invoice are shown once, on its first row.
    const primerasFilas = new Set(resultado.facturas.map((f) => f.filas[0]));

    if (soloValidar) {
      // Two grouped queries for the whole workbook, whatever the number of rows (R4-IMPORT-PREVIEW-NPLUS1).
      const lote = await cargarSobregastos(db, [...lineas.values()]);
      const vista = await Promise.all(
        resultado.filas.map(async (f) => {
          const alertas: AlertaGasto[] = [];
          if (f.error === null && f.datos !== null) {
            const linea = lineas.get(f.datos.linea_id) as LineaGasto;
            const nivel = lote.nivel(linea, { periodo: f.datos.periodo, monto: f.datos.cents });
            const alerta = alertaSobregasto(nivel);
            if (alerta) alertas.push(alerta);
            // S9: the duplicate control is the document's, so it is asked (and shown) once per invoice.
            if (primerasFilas.has(f.fila)) {
              alertas.push(...(await duplicadosDeFactura(auth.usuario, id, { id: `previa-${f.fila}`, datos: f.datos })));
            }
          }
          return {
            fila: f.fila,
            rubro: f.rubroTexto === "" ? null : f.rubroTexto,
            actividad: f.actividadTexto === "" ? null : f.actividadTexto,
            tercero: f.datos?.tercero_nombre ?? null,
            numero_documento: f.datos?.numero_documento ?? null,
            valor: f.datos ? fromCents(f.datos.cents) : null,
            periodo: f.datos?.periodo ?? null,
            valida: f.error === null,
            mensaje: f.error,
            alertas,
          };
        }),
      );
      return NextResponse.json({
        importado: false,
        resumen: {
          total: resultado.filas.length,
          validas: validas.length,
          invalidas: resultado.filas.length - validas.length,
          valor_validas: fromCents(sumCents(validas.map((f) => f.datos?.cents ?? BigInt(0)))),
        },
        filas: vista,
      });
    }

    if (facturasValidas.length === 0) {
      return apiError(GASTOS_SIN_FILAS_VALIDAS, 400, "VALIDATION_ERROR", {
        reporte: { errores: resultado.filas.map(errorDeFila) },
      });
    }

    const loteId = randomUUID();
    const creados = await db.$transaction((tx) =>
      aplicarGastosImport(tx, { proyectoId: id, usuarioId: auth.usuario.id, facturas: facturasValidas, lineas, loteId }),
    );

    const alertas: { fila: number; alertas: AlertaGasto[] }[] = [];
    for (const creado of creados) {
      const delFila = await alertasDeFactura(auth.usuario, id, creado);
      if (delFila.length > 0) alertas.push({ fila: creado.fila, alertas: delFila });
    }

    return NextResponse.json({
      importado: true,
      creados: creados.length,
      lote_id: loteId,
      valor_total: fromCents(sumCents(creados.map((c) => c.datos.cents))),
      gastos: creados.map((c) => ({ fila: c.fila, id: c.id })),
      rechazadas: resultado.filas.filter((f) => f.error !== null).map(errorDeFila),
      alertas,
    });
  },
);
