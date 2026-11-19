// GET /api/v1/clients/map — V5 (odd/tasks/producto-pendientes-2026-11.md, S3, decision L8): the
// coverage map of aliados by departamento, aggregated on the server.
//
// Same visibility and filters as GET /clients: it parses the list's own query params
// (`parseClientListFilters`: q, tipo, estado, prioridad, responsable, desde, hasta, valorMin,
// valorMax, sinGestion, plus `etiqueta`) and builds the list's own `where` (`buildClientWhere`),
// so a client the list does not show is never counted here. Only clients with a departamento count
// for a tile; the rest form «sin departamento». The free-text `ubicacion` is never read to place a
// client («sin datos inventados»).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { ENUM_VALUES } from "@/lib/catalogs";
import { parseClientListFilters, sinGestionDesde } from "@/lib/api/crm";
import { buildClientWhere, enrichClients } from "@/app/api/v1/clients/route";
import { agregarPorDepartamento, listarDepartamentos } from "@/lib/api/mapa-aliados";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(
  "clients",
  "No pudimos cargar el mapa de aliados. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const filters = parseClientListFilters(
      url,
      ENUM_VALUES.TipoCliente,
      ENUM_VALUES.EstadoCliente,
      ENUM_VALUES.PrioridadCliente,
    );
    if (!filters.ok) return filters.response;
    const etiqueta = url.searchParams.get("etiqueta")?.trim() || undefined;
    const where = buildClientWhere({ ...filters.filters, etiqueta }, auth.usuario);

    const [rows, catalogo] = await Promise.all([
      db.cliente.findMany({
        where,
        select: {
          id: true,
          nombre: true,
          estado: true,
          departamento: true,
          ubicacion: true,
          responsable: { select: { nombre: true } },
          _count: { select: { proyectos: { where: { deleted_at: null } } } },
        },
      }),
      listarDepartamentos(),
    ]);

    // The list's per-client aggregate filters, applied the same way and only when asked for.
    const { valor_min, valor_max, sin_gestion } = filters.filters;
    let visibles = rows;
    if (valor_min !== undefined || valor_max !== undefined || sin_gestion !== undefined) {
      const enriched = await enrichClients(rows.map((r) => r.id), rows);
      const keep = new Set(
        enriched
          .filter(
            (e) =>
              (valor_min === undefined || e.valor_potencial >= valor_min) &&
              (valor_max === undefined || e.valor_potencial <= valor_max) &&
              sinGestionDesde(e.dias_sin_gestion, sin_gestion),
          )
          .map((e) => e.id),
      );
      visibles = rows.filter((r) => keep.has(r.id));
    }

    const data = agregarPorDepartamento(
      visibles.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        estado: r.estado,
        departamento: r.departamento,
        ubicacion: r.ubicacion,
        responsable_nombre: r.responsable.nombre,
        proyectos: r._count.proyectos,
      })),
      catalogo,
    );
    return NextResponse.json({ data });
  },
);
