// GET /api/v1/projects/:id/template — the official Excel template (S7 U5, E-23).
//
// Manager-only and BORRADOR-only, like every structure write (404 -> 403 -> 409),
// and the project needs its dates first: the programming sheet has one column per
// month. The workbook is prefilled with the project's current structure, budget
// and programming, so download -> edit -> import is the edit loop. The download
// writes an `EXPORTAR` audit row, best-effort: an audit hiccup never fails it.

import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { gateEstructuraWrite } from "@/lib/api/estructura";
import { RespuestaAbortada } from "@/lib/api/presupuesto";
import { cargarPlantillaInput } from "@/lib/api/plantilla-import";
import { generarPlantilla } from "@/lib/proyectos/plantilla/generate";
import { PLANTILLA_VERSION } from "@/lib/proyectos/plantilla/columns";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const PLANTILLA_STATE_MESSAGE = "Solo se puede descargar la plantilla de un proyecto en Borrador.";
export const PLANTILLA_SIN_FECHAS_MESSAGE = "Define las fechas del proyecto antes de descargar la plantilla.";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos generar la plantilla. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEstructuraWrite(auth.usuario, id, PLANTILLA_STATE_MESSAGE);
    if (!gate.ok) return gate.response;
    if (!gate.value.fecha_inicio || !gate.value.fecha_fin) {
      return apiError(PLANTILLA_SIN_FECHAS_MESSAGE, 409, "INVALID_STATE");
    }

    try {
      const input = await cargarPlantillaInput(db, id);
      const buffer = await generarPlantilla(input);

      try {
        await logChange(db, {
          usuario_id: auth.usuario.id,
          accion: "EXPORTAR",
          entidad: "proyecto",
          entidad_id: id,
          proyecto_id: id,
          campo: "plantilla",
          valor_nuevo: { version: PLANTILLA_VERSION },
        });
      } catch (error) {
        console.error("[projects] template export audit failed:", error);
      }

      const nombre = input.proyecto.codigo.replace(/[^A-Za-z0-9._-]/g, "_");
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": XLSX_MIME,
          "Content-Disposition": `attachment; filename="${nombre}-plantilla.xlsx"`,
        },
      });
    } catch (error) {
      if (error instanceof RespuestaAbortada) return error.response;
      throw error;
    }
  },
);
