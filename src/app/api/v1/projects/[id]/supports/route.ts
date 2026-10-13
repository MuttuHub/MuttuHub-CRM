// GET /api/v1/projects/:id/supports — read-only list of every live soporte of the project (v7 "Soportes" tab).
//
// Metadata only: the storage key is never exposed and downloads keep going through the signed-URL routes of
// each origin (avance attachments, expense attachments). Read access follows the ficha (404 -> 403). Supports
// attached to expenses are financial (RNF-03): they are omitted for actors who cannot view them. Measurement
// supports have no download route yet, so they are listed with `url_externa` only when they are links.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { gateGastoRead } from "@/lib/api/gastos";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export type SoporteOrigen = "avance" | "indicador" | "gasto" | "proyecto";

export type SoporteListView = {
  id: string;
  nombre: string;
  tipo: "archivo" | "enlace";
  tipo_mime: string | null;
  tamano_bytes: number | null;
  origen: SoporteOrigen;
  /** Id of the avance or expense that owns the soporte (the download routes need it); null otherwise. */
  origen_id: string | null;
  /** Human label of what the soporte backs (activity/deliverable, indicator, expense document). */
  vinculo: string | null;
  /** Only for link supports that are not financial. */
  url_externa: string | null;
  subido_por: string | null;
  created_at: string;
};

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los soportes. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateGastoRead(auth.usuario, id);
    if (!gate.ok) return gate.response;
    const { puedeVerSoportes } = gate.value;

    const rows = await db.soporteProyecto.findMany({
      where: {
        proyecto_id: id,
        deleted_at: null,
        ...(puedeVerSoportes ? {} : { gasto_id: null }),
      },
      orderBy: [{ created_at: "desc" }, { id: "asc" }],
      include: {
        avance: { select: { entregable: { select: { codigo: true, descripcion: true } } } },
        medicion: { select: { indicador: { select: { codigo: true, nombre: true } } } },
        gasto: { select: { numero_documento: true, descripcion: true } },
      },
    });

    const autores = await db.usuario.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.subido_por_id))] } },
      select: { id: true, nombre: true },
    });
    const nombrePorId = new Map(autores.map((autor) => [autor.id, autor.nombre]));

    const soportes: SoporteListView[] = rows.map((row) => {
      const origen: SoporteOrigen = row.avance_id
        ? "avance"
        : row.medicion_id
          ? "indicador"
          : row.gasto_id
            ? "gasto"
            : "proyecto";
      const vinculo = row.avance
        ? `${row.avance.entregable.codigo} · ${row.avance.entregable.descripcion}`
        : row.medicion
          ? `${row.medicion.indicador.codigo} · ${row.medicion.indicador.nombre}`
          : row.gasto
            ? `Gasto ${row.gasto.numero_documento} · ${row.gasto.descripcion}`
            : null;
      return {
        id: row.id,
        nombre: row.nombre,
        tipo: row.storage_path ? "archivo" : "enlace",
        tipo_mime: row.tipo_mime,
        tamano_bytes: row.tamano_bytes,
        origen,
        origen_id: row.avance_id ?? row.gasto_id ?? null,
        vinculo,
        url_externa: origen === "gasto" ? null : row.url_externa,
        subido_por: nombrePorId.get(row.subido_por_id) ?? null,
        created_at: row.created_at.toISOString(),
      };
    });

    return NextResponse.json({ soportes });
  },
);
