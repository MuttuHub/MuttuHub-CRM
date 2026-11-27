// GET /api/v1/reports/project/export?proyecto_id=&formato=xlsx — the project report (T9b, S15, S17) as Excel,
// with the same access and figures as `GET /api/v1/reports/project` (both use `cargarReporteProyecto`): 400 without
// a project, 404 for a missing one, 403 for one the user cannot read. The access check runs before the format
// check, so whoever cannot read the project learns nothing about the formats; `formato=pdf` is a 400 (the
// printable version is the print page). Every download writes an `EXPORTAR` audit row on the project, without
// failing the download when the audit write fails.

import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { respuestaXlsx, validarFormato } from "@/lib/api/export-http";
import { cargarReporteProyecto } from "@/lib/reportes/proyecto";
import { slugCodigoProyecto, xlsxReporteProyecto } from "@/lib/reportes/proyecto-xlsx";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(
  "reports-project",
  "No pudimos generar el archivo. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const url = new URL(request.url);

    const result = await cargarReporteProyecto(auth.usuario, url);
    if (!result.ok) return result.response;
    const formato = validarFormato(url.searchParams.get("formato"));
    if (formato) return formato;

    const reporte = result.value;
    const proyecto = reporte.resumen.proyecto;
    const buffer = await xlsxReporteProyecto(reporte);

    try {
      await logChange(db, {
        usuario_id: auth.usuario.id,
        accion: "EXPORTAR",
        entidad: "proyecto",
        entidad_id: proyecto.id,
        proyecto_id: proyecto.id,
        campo: "reporte_proyecto",
        valor_nuevo: {
          formato: "xlsx",
          corte: reporte.corte,
          aliados: reporte.aliados.length,
          oportunidades: reporte.oportunidades?.length ?? null,
          bitacora: reporte.bitacora.length,
        },
      });
    } catch (error) {
      console.error("[reports-project] export audit failed:", error);
    }

    return respuestaXlsx(buffer, `reporte-proyecto-${slugCodigoProyecto(proyecto.codigo)}-${reporte.corte}.xlsx`);
  },
);
