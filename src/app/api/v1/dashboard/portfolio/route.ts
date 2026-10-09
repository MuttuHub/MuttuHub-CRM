// GET /api/v1/dashboard/portfolio?corte&linea_id&cliente_id&responsable_id&estado&municipio_id — E-28 (S9 U4).
//
// Portfolio KPIs over the projects the caller may read: ADMINISTRADOR/GERENCIA and a user flagged
// `puede_ver_tablero_gerencial` see all of them, a COORDINADOR only those they are an active member of
// (the rows come from `projectListWhere`, the same scope as the list), every other caller gets 403.
// The KPIs come from the batched loader (one query per table, whatever the number of projects) and
// are always `base=vigente`. Totals A/P/E are aggregates, never per-gasto or support data (P04).
// There is deliberately NO per-territory breakdown: municipio is only a filter. The path is
// `dashboard/portfolio`, not the SDD's `dashboard/projects` (already used on the v6 branches).

import { NextResponse } from "next/server";
import { EstadoProyecto } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { canReadProjectList, projectListWhere, type ProjectListFilters } from "@/lib/api/projects";
import { loadKpisPortafolio } from "@/lib/api/kpis-portafolio";
import { parseCorteFecha, serializeAgregado, serializeKpis } from "@/lib/api/kpis-http";
import { getSemaforoParametrosV2 } from "@/lib/settings";
import { isoDate } from "@/lib/proyectos/proyecto-general";
import { kpisPortafolio } from "@/lib/proyectos/kpis";

export const dynamic = "force-dynamic";

export const PORTAFOLIO_FORBIDDEN_MESSAGE = "No tienes permisos para ver el tablero de proyectos.";

const ESTADOS = Object.values(EstadoProyecto);

export const PORTAFOLIO_SELECT = {
  id: true,
  codigo: true,
  nombre: true,
  estado: true,
  fecha_inicio: true,
  fecha_fin: true,
  beneficiarios_meta: true,
  cliente: { select: { id: true, nombre: true } },
  responsable: { select: { id: true, nombre: true } },
  lineas: { select: { principal: true, linea: { select: { id: true, codigo: true, nombre: true } } } },
} as const;

/** Filters of E-28; an unknown `estado` is a 400 instead of an empty portfolio. */
export function parsePortafolioFilters(url: URL): { ok: true; filters: ProjectListFilters } | { ok: false; response: Response } {
  const sp = url.searchParams;
  const estado = sp.get("estado") ?? undefined;
  if (estado && !ESTADOS.includes(estado as EstadoProyecto)) {
    return { ok: false, response: apiError("Estado de proyecto no válido.", 400, "VALIDATION_ERROR") };
  }
  return {
    ok: true,
    filters: {
      estado,
      cliente_id: sp.get("cliente_id") ?? undefined,
      linea_id: sp.get("linea_id") ?? undefined,
      municipio_id: sp.get("municipio_id") ?? undefined,
      responsable_id: sp.get("responsable_id") ?? undefined,
    },
  };
}

export const GET = withApiErrorHandling(
  "dashboard-portfolio",
  "No pudimos cargar el tablero de proyectos. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { usuario } = auth;
    if (!canReadProjectList(usuario) && usuario.rol !== "COORDINADOR") {
      return apiError(PORTAFOLIO_FORBIDDEN_MESSAGE, 403, "FORBIDDEN");
    }

    const url = new URL(request.url);
    const filters = parsePortafolioFilters(url);
    if (!filters.ok) return filters.response;
    const corteResult = parseCorteFecha(url.searchParams.get("corte"));
    if (!corteResult.ok) return corteResult.response;
    const { corte } = corteResult;

    const rows = await db.proyecto.findMany({
      where: projectListWhere(usuario, filters.filters),
      orderBy: { codigo: "asc" },
      select: PORTAFOLIO_SELECT,
    });
    const parametros = await getSemaforoParametrosV2();
    const kpis = await loadKpisPortafolio({ proyectos: rows, corte, parametros });

    const proyectos = rows.map((row) => {
      const k = kpis.get(row.id) as NonNullable<ReturnType<typeof kpis.get>>;
      const principal = row.lineas.find((l) => l.principal)?.linea ?? null;
      return {
        id: row.id,
        codigo: row.codigo,
        nombre: row.nombre,
        estado: row.estado,
        cliente: row.cliente,
        responsable: row.responsable,
        linea_principal: principal,
        fecha_inicio: row.fecha_inicio ? isoDate(row.fecha_inicio) : null,
        fecha_fin: row.fecha_fin ? isoDate(row.fecha_fin) : null,
        semaforo_tecnico: k.tecnico?.color ?? null,
        semaforo_financiero: k.financiero?.color ?? null,
        alerta_retraso: k.financiero?.alerta_retraso ?? null,
        kpis: serializeKpis(k),
      };
    });

    const agregado = kpisPortafolio([...kpis.values()], corte);
    return NextResponse.json({
      base: "vigente",
      corte,
      confirmado: [parametros.umbral1, parametros.umbral2, parametros.tolerancia, parametros.retraso].every((p) => p.confirmado),
      proyectos,
      agregado: serializeAgregado(agregado),
      por_estado: agregado.por_estado,
    });
  },
);
