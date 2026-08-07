// GET /api/v1/clients — list with search + filters (PRD §4.5) and pagination.
// POST /api/v1/clients — create (PRD §4.3: minimum form = nombre, tipo,
// responsable; estado defaults to PROSPECTO).
//
// Permission model (v1 pragmatic, no team/area table): full roles see every
// client; COLABORADOR is scoped to clients where they are the responsable
// (their `responsable` filter param is forced to self so no foreign counts
// leak through).

import { NextResponse } from "next/server";
import type { Prisma, TipoCliente, EstadoCliente, PrioridadCliente, Usuario } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/supabase/server";
import { ENUM_VALUES } from "@/lib/catalogs";
import {
  catalogEnum,
  CLIENT_BASE_SELECT,
  CLIENT_FULL_SELECT,
  endOfDay,
  isFullAccess,
  OPEN_TASK_STATES,
  parseClientListFilters,
  parseDate,
  parsePagination,
  zodError,
} from "@/lib/api/crm";

export const dynamic = "force-dynamic";

export type ClientListRow = Prisma.ClienteGetPayload<{
  select: typeof CLIENT_BASE_SELECT;
}>;

const POST_CLIENT_SCHEMA = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio.")
    .max(200, "El nombre es muy largo."),
  tipo_cliente: catalogEnum(
    ENUM_VALUES.TipoCliente as readonly TipoCliente[],
    "Tipo de cliente no válido.",
  ),
  responsable_id: z.string().min(1, "El responsable es obligatorio."),
  empresa: z.string().optional(),
  tamano_org: z.string().optional(),
  ubicacion: z.string().optional(),
  canal_contacto_inicial: z.string().optional(),
  fecha_primer_contacto: z
    .string()
    .refine((v) => parseDate(v) !== null, "Fecha de primer contacto no válida.")
    .optional(),
  prioridad: catalogEnum(
    ENUM_VALUES.PrioridadCliente as readonly PrioridadCliente[],
    "Prioridad no válida.",
  )
    .nullable()
    .optional(),
  estado: catalogEnum(
    ENUM_VALUES.EstadoCliente as readonly EstadoCliente[],
    "Estado de cliente no válido.",
  ).optional(),
  prioridades_identificadas: z.string().optional(),
  riesgos_barreras: z.string().optional(),
  resumen_relacion: z.string().optional(),
});

/** Builds the shared list/export `where` including the COLABORADOR scope. */
export function buildClientWhere(
  filters: {
    q?: string;
    tipo?: string;
    estado?: string;
    prioridad?: string;
    responsable_id?: string;
    desde?: string;
    hasta?: string;
  },
  usuario: Usuario,
): Prisma.ClienteWhereInput {
  const where: Prisma.ClienteWhereInput = { deleted_at: null };
  if (filters.tipo) where.tipo_cliente = filters.tipo as TipoCliente;
  if (filters.estado) where.estado = filters.estado as EstadoCliente;
  if (filters.prioridad) where.prioridad = filters.prioridad as PrioridadCliente;
  if (filters.responsable_id) where.responsable_id = filters.responsable_id;

  const q = filters.q;
  if (q) {
    where.OR = [
      { nombre: { contains: q, mode: "insensitive" } },
      { empresa: { contains: q, mode: "insensitive" } },
      {
        contactos: {
          some: { deleted_at: null, nombre: { contains: q, mode: "insensitive" } },
        },
      },
      { bitacora: { some: { texto: { contains: q, mode: "insensitive" } } } },
    ];
  }
  if (filters.desde || filters.hasta) {
    const rango: Prisma.DateTimeNullableFilter = {};
    if (filters.desde) rango.gte = new Date(filters.desde);
    if (filters.hasta) rango.lte = endOfDay(new Date(filters.hasta));
    where.fecha_primer_contacto = rango;
  }
  if (!isFullAccess(usuario.rol)) where.responsable_id = usuario.id;
  return where;
}

/**
 * Enriches client rows with valor_potencial (sum of non-PERDIDA, non-deleted
 * opportunities), compromisos_abiertos and next_compromiso (earliest open
 * task with a due date). Bound to the given client ids — one grouped query
 * per metric instead of N+1.
 */
export async function enrichClients(
  ids: string[],
  rows: { id: string }[],
): Promise<
  {
    id: string;
    valor_potencial: number;
    compromisos_abiertos: number;
    next_compromiso: { id: string; titulo: string; fecha_entrega: Date } | null;
  }[]
> {
  const [sums, openCounts, nextTasks] = await Promise.all([
    db.oportunidad.groupBy({
      by: ["cliente_id"],
      where: { deleted_at: null, estado: { not: "PERDIDA" }, cliente_id: { in: ids } },
      _sum: { valor_estimado_cop: true },
    }),
    db.tarea.groupBy({
      by: ["cliente_id"],
      where: { deleted_at: null, cliente_id: { in: ids }, estado: OPEN_TASK_STATES },
      _count: { _all: true },
    }),
    db.tarea.findMany({
      where: {
        deleted_at: null,
        cliente_id: { in: ids },
        estado: OPEN_TASK_STATES,
        fecha_entrega: { not: null },
      },
      orderBy: { fecha_entrega: "asc" },
      select: { id: true, titulo: true, fecha_entrega: true, cliente_id: true },
      take: ids.length,
    }),
  ]);

  const valorByClient = new Map(sums.map((s) => [s.cliente_id, Number(s._sum.valor_estimado_cop ?? 0)]));
  const countByClient = new Map(
    openCounts.map((c) => {
      const count = typeof c._count === "object" ? (c._count._all ?? 0) : 0;
      return [c.cliente_id, count] as const;
    }),
  );
  const nextByClient = new Map<string, { id: string; titulo: string; fecha_entrega: Date }>();
  for (const t of nextTasks) {
    if (t.cliente_id && !nextByClient.has(t.cliente_id) && t.fecha_entrega) {
      nextByClient.set(t.cliente_id, { id: t.id, titulo: t.titulo, fecha_entrega: t.fecha_entrega });
    }
  }

  return rows.map((r) => ({
    id: r.id,
    valor_potencial: valorByClient.get(r.id) ?? 0,
    compromisos_abiertos: countByClient.get(r.id) ?? 0,
    next_compromiso: nextByClient.get(r.id) ?? null,
  }));
}

export async function GET(request: Request) {
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
  const pagination = parsePagination(url.searchParams);
  if (!pagination.ok) return pagination.response;

  try {
    const where = buildClientWhere(filters.filters, auth.usuario);

    // Value range filters are applied in JS because valor_potencial is a
    // per-client aggregation; fetching base fields first keeps the query light.
    const rows = await db.cliente.findMany({
      where,
      select: CLIENT_BASE_SELECT,
      orderBy: { updated_at: "desc" },
    });

    const enriched = await enrichClients(rows.map((r) => r.id), rows);
    const filtered = enriched.filter(
      (e) =>
        (filters.filters.valor_min === undefined || e.valor_potencial >= filters.filters.valor_min) &&
        (filters.filters.valor_max === undefined || e.valor_potencial <= filters.filters.valor_max),
    );

    const total = filtered.length;
    const start = (pagination.page - 1) * pagination.limit;
    const pageIds = new Set(filtered.slice(start, start + pagination.limit).map((e) => e.id));

    const items = rows
      .filter((r) => pageIds.has(r.id))
      .map((r) => {
        const e = enriched.find((x) => x.id === r.id)!;
        return {
          id: r.id,
          nombre: r.nombre,
          empresa: r.empresa,
          tipo_cliente: r.tipo_cliente,
          estado: r.estado,
          prioridad: r.prioridad,
          ubicacion: r.ubicacion,
          responsable_id: r.responsable_id,
          responsable_nombre: r.responsable.nombre,
          valor_potencial: e.valor_potencial,
          compromisos_abiertos: e.compromisos_abiertos,
          next_compromiso: e.next_compromiso,
          updated_at: r.updated_at,
        };
      });

    return NextResponse.json({ page: pagination.page, limit: pagination.limit, total, items });
  } catch (err) {
    console.error("[clients] list failed:", err);
    return apiError("No pudimos cargar los clientes. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody<unknown>(request);
  if (body === null) {
    return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
  }
  const parsed = POST_CLIENT_SCHEMA.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  // COLABORADOR can only create clients they will be the responsable of.
  const responsable_id =
    auth.usuario.rol === "COLABORADOR" ? auth.usuario.id : parsed.data.responsable_id;

  try {
    const responsable = await db.usuario.findFirst({
      where: { id: responsable_id, activo: true },
      select: { id: true, nombre: true },
    });
    if (!responsable) {
      return apiError("El responsable no existe o está inactivo.", 400, "VALIDATION_ERROR");
    }

    const cliente = await db.cliente.create({
      data: {
        nombre: parsed.data.nombre,
        tipo_cliente: parsed.data.tipo_cliente,
        responsable_id,
        empresa: parsed.data.empresa,
        tamano_org: parsed.data.tamano_org,
        ubicacion: parsed.data.ubicacion,
        canal_contacto_inicial: parsed.data.canal_contacto_inicial,
        fecha_primer_contacto: parsed.data.fecha_primer_contacto
          ? parseDate(parsed.data.fecha_primer_contacto)
          : undefined,
        prioridad: parsed.data.prioridad,
        estado: parsed.data.estado ?? "PROSPECTO",
        prioridades_identificadas: parsed.data.prioridades_identificadas,
        riesgos_barreras: parsed.data.riesgos_barreras,
        resumen_relacion: parsed.data.resumen_relacion,
      },
      select: CLIENT_FULL_SELECT,
    });
    return NextResponse.json(
      { cliente: { ...cliente, responsable_nombre: cliente.responsable.nombre } },
      { status: 201 },
    );
  } catch (err) {
    console.error("[clients] create failed:", err);
    return apiError("No pudimos guardar el cliente. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}