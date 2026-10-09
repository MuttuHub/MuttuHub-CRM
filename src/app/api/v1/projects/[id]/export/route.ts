// GET /api/v1/projects/:id/export?formato=xlsx&ficha=proyecto|financiera&corte&base — E-29 (S9 U5).
//
// Excel of the project ficha (general data, structure counts, KPIs) or of the financial ficha (rubro rows and
// the total row of `computeFicha`). Whoever can read the project can export it: 404 -> 403 -> 409 (no dates)
// -> 400 (`formato` other than xlsx, `ficha`, corte, base). Both workbooks carry aggregates only: no gasto,
// tercero or soporte data for any role (P04, REQ-ACC-05). `formato=pdf` is a 400 until N-23 is decided.
// Every download writes an `EXPORTAR` audit row, best-effort: an audit hiccup never fails it.

import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { EJECUCION_FORBIDDEN_MESSAGE, PROYECTO_NO_EXISTE } from "@/lib/api/ejecucion";
import { respuestaXlsx, validarFormato } from "@/lib/api/export-http";
import { calcularFichaFinanciera } from "@/lib/api/financial-sheet";
import { SIN_FECHAS_MESSAGE, calcularKpisProyecto } from "@/lib/api/kpis-proyecto";
import { serializeKpis } from "@/lib/api/kpis-http";
import { PROJECT_SELECT_V2, canReadProject, loadProjectScoped, toProjectItemV2 } from "@/lib/api/projects";
import { xlsxFichaFinanciera, xlsxFichaProyecto, type FichaProyectoXlsx } from "@/lib/proyectos/export-xlsx";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const FICHA_INVALIDA_MESSAGE = "La ficha no es válida. Usa proyecto o financiera.";

const FICHAS = ["proyecto", "financiera"] as const;
type Ficha = (typeof FICHAS)[number];

const vivos = { where: { deleted_at: null } } as const;
const EXPORT_SELECT = {
  ...PROJECT_SELECT_V2,
  _count: { select: { objetivos: vivos, actividades: vivos, entregables: vivos, indicadores: vivos } },
} as const;

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos generar el archivo. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const scoped = await loadProjectScoped(auth.usuario, id, EXPORT_SELECT);
    if (!scoped) return apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND");
    if (!canReadProject(auth.usuario, scoped.es_miembro)) return apiError(EJECUCION_FORBIDDEN_MESSAGE, 403, "FORBIDDEN");
    const row = scoped.row;
    if (!row.fecha_inicio || !row.fecha_fin) return apiError(SIN_FECHAS_MESSAGE, 409, "INVALID_STATE");

    const params = new URL(request.url).searchParams;
    const formato = validarFormato(params.get("formato"));
    if (formato) return formato;
    const fichaParam = params.get("ficha") ?? "proyecto";
    if (!(FICHAS as readonly string[]).includes(fichaParam)) return apiError(FICHA_INVALIDA_MESSAGE, 400, "VALIDATION_ERROR");
    const ficha = fichaParam as Ficha;
    const corteParam = params.get("corte");
    const baseParam = params.get("base");

    let buffer: Buffer;
    let corte: string;
    let base: string;
    if (ficha === "financiera") {
      const sheet = await calcularFichaFinanciera({
        id,
        estado: row.estado,
        fecha_inicio: row.fecha_inicio,
        fecha_fin: row.fecha_fin,
        baseParam,
        corteParam,
      });
      if (!sheet.ok) return sheet.response;
      buffer = await xlsxFichaFinanciera(sheet.value, { codigo: row.codigo, nombre: row.nombre });
      ({ corte, base } = sheet.value);
    } else {
      const result = await calcularKpisProyecto({
        proyecto: { id, estado: row.estado, fecha_inicio: row.fecha_inicio, fecha_fin: row.fecha_fin, beneficiarios_meta: row.beneficiarios_meta },
        corteParam,
        baseParam,
      });
      if (!result.ok) return result.response;
      const item = toProjectItemV2(row);
      const payload: FichaProyectoXlsx = {
        codigo: item.codigo,
        nombre: item.nombre,
        cliente: item.cliente.nombre,
        estado: item.estado,
        responsable: item.responsable?.nombre ?? null,
        fecha_inicio: item.fecha_inicio,
        fecha_fin: item.fecha_fin,
        duracion_semanas: item.duracion_semanas,
        valor_total: item.valor_total === null ? null : item.valor_total.toString(),
        beneficiarios_meta: item.beneficiarios_meta,
        lineas: item.lineas.map((l) => `${l.codigo} ${l.nombre}${l.principal ? " (principal)" : ""}`),
        municipios: item.municipios.map((m) => `${m.nombre} (${m.departamento})`),
        conteos: row._count,
        base: result.value.base,
        kpis: serializeKpis(result.value.kpis),
      };
      buffer = await xlsxFichaProyecto(payload);
      corte = result.value.kpis.corte;
      base = result.value.base;
    }

    try {
      await logChange(db, {
        usuario_id: auth.usuario.id,
        accion: "EXPORTAR",
        entidad: "proyecto",
        entidad_id: id,
        proyecto_id: id,
        campo: `ficha_${ficha}`,
        valor_nuevo: { formato: "xlsx", ficha, corte, base },
      });
    } catch (error) {
      console.error("[projects] export audit failed:", error);
    }

    return respuestaXlsx(buffer, `${row.codigo}-${ficha}.xlsx`);
  },
);
