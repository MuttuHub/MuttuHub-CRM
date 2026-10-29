// GET /api/v1/reports/weekly/export?semana=AAAA-MM-DD&formato=xlsx — el reporte semanal (S5) en Excel, con el
// mismo alcance y los mismos números que `GET /api/v1/reports/weekly` (comparten `cargarReporteSemanal`).
// Solo agregados (P04): ninguna hoja trae gastos, terceros ni soportes individuales. `formato=pdf` es un 400
// (la versión imprimible es /print/reportes/semanal). Cada descarga deja una fila `EXPORTAR` de auditoría,
// sin bloquear la descarga si falla.

import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { apiError } from "@/lib/api/errors";
import { logChange } from "@/lib/api/audit-cambios";
import { PORTAFOLIO_FORBIDDEN_MESSAGE, puedeVerPortafolio } from "@/lib/api/portafolio";
import { respuestaXlsx, validarFormato } from "@/lib/api/export-http";
import { cargarReporteSemanal } from "@/lib/reportes/semanal";
import { xlsxReporteSemanal } from "@/lib/reportes/semanal-xlsx";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(
  "reports-weekly",
  "No pudimos generar el archivo. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const url = new URL(request.url);
    // 403 primero: quien no ve el tablero no aprende nada de los formatos.
    if (!puedeVerPortafolio(auth.usuario)) return apiError(PORTAFOLIO_FORBIDDEN_MESSAGE, 403, "FORBIDDEN");
    const formato = validarFormato(url.searchParams.get("formato"));
    if (formato) return formato;

    const result = await cargarReporteSemanal(auth.usuario, url);
    if (!result.ok) return result.response;
    const reporte = result.value;
    const buffer = await xlsxReporteSemanal(reporte);

    try {
      await logChange(db, {
        usuario_id: auth.usuario.id,
        accion: "EXPORTAR",
        entidad: "proyecto",
        entidad_id: "reporte-semanal",
        proyecto_id: null,
        campo: "reporte_semanal",
        valor_nuevo: { formato: "xlsx", semana: reporte.semana, corte: reporte.corte, proyectos: reporte.portafolio.proyectos.length },
      });
    } catch (error) {
      console.error("[reports-weekly] export audit failed:", error);
    }

    return respuestaXlsx(buffer, `reporte-semanal-${reporte.semana.desde}.xlsx`);
  },
);
