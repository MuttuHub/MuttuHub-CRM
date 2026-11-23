// GET /api/v1/reports/tag/export?etiqueta=&desde=&hasta=&formato=xlsx — the tag report (T3, S6) as Excel, with
// the same scope and figures as `GET /api/v1/reports/tag` (both use `cargarReporteEtiqueta`). `formato=pdf` is a
// 400 (the printable version is /print/reportes/etiqueta). Every download writes an `EXPORTAR` audit row,
// without failing the download when the audit write fails.

import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { apiError } from "@/lib/api/errors";
import { logChange } from "@/lib/api/audit-cambios";
import { PORTAFOLIO_FORBIDDEN_MESSAGE, puedeVerPortafolio } from "@/lib/api/portafolio";
import { respuestaXlsx, validarFormato } from "@/lib/api/export-http";
import { cargarReporteEtiqueta } from "@/lib/reportes/etiqueta";
import { slugEtiqueta, xlsxReporteEtiqueta } from "@/lib/reportes/etiqueta-xlsx";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(
  "reports-tag",
  "No pudimos generar el archivo. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const url = new URL(request.url);
    // 403 first, like the weekly export: whoever cannot see the dashboard learns nothing about the formats.
    if (!puedeVerPortafolio(auth.usuario)) return apiError(PORTAFOLIO_FORBIDDEN_MESSAGE, 403, "FORBIDDEN");
    const formato = validarFormato(url.searchParams.get("formato"));
    if (formato) return formato;

    const result = await cargarReporteEtiqueta(auth.usuario, url);
    if (!result.ok) return result.response;
    const reporte = result.value;
    const buffer = await xlsxReporteEtiqueta(reporte);

    try {
      await logChange(db, {
        usuario_id: auth.usuario.id,
        accion: "EXPORTAR",
        entidad: "proyecto",
        entidad_id: "reporte-etiqueta",
        proyecto_id: null,
        campo: "reporte_etiqueta",
        valor_nuevo: {
          formato: "xlsx",
          etiqueta: reporte.etiqueta,
          desde: reporte.periodo.desde,
          hasta: reporte.periodo.hasta,
          corte: reporte.corte,
          proyectos: reporte.proyectos.length,
          clientes: reporte.clientes.length,
        },
      });
    } catch (error) {
      console.error("[reports-tag] export audit failed:", error);
    }

    return respuestaXlsx(buffer, `reporte-etiqueta-${slugEtiqueta(reporte.etiqueta)}-${reporte.corte}.xlsx`);
  },
);
