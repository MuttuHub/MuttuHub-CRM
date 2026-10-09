// GET /api/v1/dashboard/portfolio/export?formato=xlsx&corte&linea_id&cliente_id&responsable_id&estado&municipio_id
// (S9 U5): the portfolio table as an Excel workbook, with the same scope, filters and numbers as
// `GET dashboard/portfolio` (they share `cargarPortafolio`). Capped at 500 projects like the clients
// export; aggregates only (P04: no gasto, tercero or soporte columns for any role). `formato=pdf` is a 400
// until N-23 is decided. Every download writes an `EXPORTAR` audit row, best-effort.

import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { apiError } from "@/lib/api/errors";
import { logChange } from "@/lib/api/audit-cambios";
import { PORTAFOLIO_FORBIDDEN_MESSAGE, cargarPortafolio, puedeVerPortafolio } from "@/lib/api/portafolio";
import { respuestaXlsx, validarFormato } from "@/lib/api/export-http";
import { xlsxPortafolio, type PortafolioXlsx } from "@/lib/proyectos/export-xlsx";

export const dynamic = "force-dynamic";

const EXPORT_MAX_ROWS = 500;

const FILTROS = ["linea_id", "cliente_id", "responsable_id", "estado", "municipio_id"] as const;

export const GET = withApiErrorHandling(
  "dashboard-portfolio",
  "No pudimos generar el archivo. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const url = new URL(request.url);
    // 403 first: a caller outside the dashboard learns nothing about its formats.
    if (!puedeVerPortafolio(auth.usuario)) return apiError(PORTAFOLIO_FORBIDDEN_MESSAGE, 403, "FORBIDDEN");
    const formato = validarFormato(url.searchParams.get("formato"));
    if (formato) return formato;

    const result = await cargarPortafolio(auth.usuario, url);
    if (!result.ok) return result.response;
    const data = result.value;

    const truncado = data.proyectos.length > EXPORT_MAX_ROWS;
    const proyectos = data.proyectos.slice(0, EXPORT_MAX_ROWS);
    const payload: PortafolioXlsx = {
      corte: data.corte,
      confirmado: data.confirmado,
      truncado,
      proyectos: proyectos.map((p) => ({
        codigo: p.codigo,
        nombre: p.nombre,
        cliente: p.cliente.nombre,
        estado: p.estado,
        responsable: p.responsable?.nombre ?? null,
        linea_principal: p.linea_principal ? `${p.linea_principal.codigo} ${p.linea_principal.nombre}` : null,
        semaforo_tecnico: p.semaforo_tecnico,
        semaforo_financiero: p.semaforo_financiero,
        alerta_retraso: p.alerta_retraso,
        kpis: p.kpis,
      })),
      agregado: data.agregado,
      por_estado: data.por_estado,
    };
    const buffer = await xlsxPortafolio(payload);

    try {
      await logChange(db, {
        usuario_id: auth.usuario.id,
        accion: "EXPORTAR",
        entidad: "proyecto",
        entidad_id: "portafolio",
        proyecto_id: null,
        campo: "portafolio",
        valor_nuevo: {
          formato: "xlsx",
          corte: data.corte,
          filas: proyectos.length,
          truncado,
          filtros: Object.fromEntries(FILTROS.flatMap((f) => (url.searchParams.get(f) ? [[f, url.searchParams.get(f)]] : []))),
        },
      });
    } catch (error) {
      console.error("[dashboard-portfolio] export audit failed:", error);
    }

    return respuestaXlsx(buffer, `portafolio-${data.corte}.xlsx`);
  },
);
