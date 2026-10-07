/**
 * Shared projection, permission and diff helpers of the v2 projects API
 * (S2.1b): the list/detail shape of a project (`ProjectItemV2`) and the pieces
 * the PATCH route composes — read scope, filters, join-set diffing and the
 * referential checks that turn a raw P2003 into a usable 400.
 *
 * Conventions reused from the existing modules, deliberately not reinvented:
 * `apiError` for the error envelope, `Decimal` values passed through untouched
 * (the same thing `src/lib/api/crm.ts` does for `valor_estimado_cop`; decimal.js
 * serializes them as strings), and pure permission predicates from
 * `src/lib/permissions.ts` (never a role list re-declared here).
 */

import { Prisma, type EstadoProyecto, type OrigenProyecto, type Usuario } from "@prisma/client";
import { canViewPortfolio, canViewProjectV2, type ProjectActor, type ProjectMembershipActor } from "@/lib/permissions";
import { duracionProyecto, isoDate, type LineaInput } from "@/lib/proyectos/proyecto-general";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { parseDate } from "@/lib/api/crm";

/**
 * Projection shared by GET /projects, GET /projects/:id and the PATCH
 * response, so every endpoint answers with the same `ProjectItemV2` object.
 * The N..N joins select the catalog row, not `linea_id`, because the response
 * wants `{id, codigo, nombre, principal}` and never a bare id.
 */
export const PROJECT_SELECT_V2 = {
  id: true,
  codigo: true,
  nombre: true,
  estado: true,
  origen: true,
  cliente: { select: { id: true, nombre: true } },
  responsable: { select: { id: true, nombre: true } },
  // Read (never returned) because the PATCH audit diffs the stored column.
  responsable_id: true,
  fecha_inicio: true,
  fecha_fin: true,
  valor_total: true,
  diferencia_valor_oportunidad: true,
  beneficiarios_meta: true,
  lineas: {
    select: { principal: true, linea: { select: { id: true, codigo: true, nombre: true } } },
  },
  municipios: {
    select: { municipio: { select: { id: true, nombre: true, departamento: true } } },
  },
} as const;

export type ProjectRowV2 = Prisma.ProyectoGetPayload<{ select: typeof PROJECT_SELECT_V2 }>;

export type ProjectItemV2 = {
  id: string;
  codigo: string;
  nombre: string;
  estado: EstadoProyecto;
  origen: OrigenProyecto | null;
  cliente: { id: string; nombre: string };
  responsable: { id: string; nombre: string } | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  duracion_semanas: number | null;
  valor_total: Prisma.Decimal | null;
  diferencia_valor_oportunidad: Prisma.Decimal | null;
  beneficiarios_meta: number | null;
  lineas: { id: string; codigo: string; nombre: string; principal: boolean }[];
  municipios: { id: string; nombre: string; departamento: string }[];
};

/**
 * Row -> JSON shape. `fecha_inicio`/`fecha_fin` are `@db.Date` columns, so the
 * domain value is a calendar date: they are handed back as `YYYY-MM-DD`
 * instead of the driver's midnight-UTC `Date`. `duracion_semanas` is derived on
 * every read (never stored) through `duracionProyecto`.
 */
export function toProjectItemV2(row: ProjectRowV2): ProjectItemV2 {
  return {
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    estado: row.estado,
    origen: row.origen,
    cliente: row.cliente,
    responsable: row.responsable,
    fecha_inicio: row.fecha_inicio ? isoDate(row.fecha_inicio) : null,
    fecha_fin: row.fecha_fin ? isoDate(row.fecha_fin) : null,
    duracion_semanas: duracionProyecto(row.fecha_inicio, row.fecha_fin),
    valor_total: row.valor_total,
    diferencia_valor_oportunidad: row.diferencia_valor_oportunidad,
    beneficiarios_meta: row.beneficiarios_meta,
    lineas: row.lineas.map((link) => ({
      id: link.linea.id,
      codigo: link.linea.codigo,
      nombre: link.linea.nombre,
      principal: link.principal,
    })),
    municipios: row.municipios.map((link) => ({
      id: link.municipio.id,
      nombre: link.municipio.nombre,
      departamento: link.municipio.departamento,
    })),
  };
}

// ---------------------------------------------------------------------------
// Read scope (REQ-ACC-02)
// ---------------------------------------------------------------------------

/**
 * Resolves the two axes of the project read predicates. `es_miembro` arrives
 * resolved from `proyecto_miembros` by `loadProjectScoped` (S2.6), which keeps
 * the predicates in `src/lib/permissions.ts` pure and DB-free.
 * `puede_ver_tablero_gerencial` has no column or loader yet (S0.7 built the
 * predicates as pure functions) and stays pinned until its own slice (S9.2),
 * so a COLABORADOR without the flag still sees none (REQ-ACC-02).
 */
const UNRESOLVED_GERENCIAL_FLAG = false as const;

/**
 * Portfolio-scope actor: only `rol` and the gerencial flag. The portfolio
 * predicate has no per-project membership axis, so it does NOT go through
 * `projectReadActor` and never has to fabricate an `es_miembro` value.
 */
function projectPortfolioActor(usuario: Usuario): ProjectActor {
  return {
    id: usuario.id,
    rol: usuario.rol,
    puede_ver_tablero_gerencial: UNRESOLVED_GERENCIAL_FLAG,
  };
}

/**
 * Per-project actor. `es_miembro` is REQUIRED — there is no default that
 * silently denies — so the compiler forces every caller with a project in hand
 * to resolve the membership axis (`loadProjectScoped`) before deciding.
 */
export function projectReadActor(
  usuario: Usuario,
  es_miembro: boolean,
): ProjectMembershipActor {
  return { ...projectPortfolioActor(usuario), es_miembro };
}

/** P01 (portfolio list): `canViewPortfolio` is the target predicate. */
export function canReadProjectList(usuario: Usuario): boolean {
  return canViewPortfolio(projectPortfolioActor(usuario));
}

/**
 * P02 (single project ficha): `canViewProjectV2` is the target predicate.
 * `es_miembro` is required and must come from `loadProjectScoped` for the
 * project being decided.
 */
export function canReadProject(usuario: Usuario, es_miembro: boolean): boolean {
  return canViewProjectV2(projectReadActor(usuario, es_miembro));
}

/** Row shape of a scoped read: the caller's projection plus the membership probe. */
type ScopedProjectRow<S extends Prisma.ProyectoSelect> = Prisma.ProyectoGetPayload<{
  select: S;
}> & { miembros: { id: string }[] };

/**
 * Scoped existence read (REQ-ACC-02): reads the project with the actor's active
 * `proyecto_miembros` row projected alongside it in the same `findFirst`, so
 * every read path resolves `es_miembro` exactly once and from the database — a
 * request-supplied flag is never trusted. The `select` is the caller's
 * projection (the detail route wants the full `ProjectItemV2` row, a gate wants
 * `{ id }`); the membership probe itself is not the caller's to duplicate.
 *
 * `null` means "no readable project row" (missing or soft-deleted) and belongs
 * to the caller's 404 branch, which must run before the visibility decision.
 * `removed_at: null` is the soft-removal contract: a revoked membership stops
 * granting access immediately while its row stays stored.
 */
export async function loadProjectScoped<S extends Prisma.ProyectoSelect>(
  usuario: Usuario,
  proyectoId: string,
  select: S,
): Promise<{ row: Prisma.ProyectoGetPayload<{ select: S }>; es_miembro: boolean } | null> {
  // The membership sub-select makes Prisma's args type unify poorly with a
  // generic `S`, so the args are cast; the row is re-typed to the composed
  // shape (`S` plus the injected `miembros` probe).
  const scoped = (await db.proyecto.findFirst({
    where: { id: proyectoId, deleted_at: null },
    select: {
      ...select,
      miembros: {
        where: { usuario_id: usuario.id, removed_at: null },
        select: { id: true },
        take: 1,
      },
    },
  } as unknown as Prisma.ProyectoFindFirstArgs)) as unknown as ScopedProjectRow<S> | null;
  if (!scoped) return null;

  const { miembros, ...row } = scoped;
  return {
    row: row as unknown as Prisma.ProyectoGetPayload<{ select: S }>,
    es_miembro: miembros.length > 0,
  };
}

// ---------------------------------------------------------------------------
// List filters (E-02)
// ---------------------------------------------------------------------------

export type ProjectListFilters = {
  estado?: string;
  cliente_id?: string;
  linea_id?: string;
  municipio_id?: string;
  responsable_id?: string;
};

/**
 * `where` of GET /api/v1/projects. An actor outside the portfolio scope keeps
 * a valid query that matches only what they may read instead of a second code
 * path: a COORDINADOR is narrowed to an ACTIVE membership clause and every
 * other role to `id in []`. Both are data restrictions the caller cannot
 * widen — never a list of project ids resolved into memory, and never a branch
 * the route could skip.
 */
export function projectListWhere(
  usuario: Usuario,
  filters: ProjectListFilters,
): Prisma.ProyectoWhereInput {
  const where: Prisma.ProyectoWhereInput = { deleted_at: null };

  if (!canReadProjectList(usuario)) {
    if (usuario.rol !== "COORDINADOR") {
      where.id = { in: [] };
      return where;
    }
    where.miembros = { some: { usuario_id: usuario.id, removed_at: null } };
  }

  if (filters.estado) where.estado = filters.estado as EstadoProyecto;
  if (filters.cliente_id) where.cliente_id = filters.cliente_id;
  if (filters.responsable_id) where.responsable_id = filters.responsable_id;
  if (filters.linea_id) where.lineas = { some: { linea_id: filters.linea_id } };
  if (filters.municipio_id) where.municipios = { some: { municipio_id: filters.municipio_id } };

  return where;
}

// ---------------------------------------------------------------------------
// Audit (REQ-AUD-04)
// ---------------------------------------------------------------------------

/** Scalar fields whose change produces one audit row each. */
export const AUDITED_PROJECT_FIELDS = [
  "nombre",
  "origen",
  "fecha_inicio",
  "fecha_fin",
  "valor_total",
  "beneficiarios_meta",
  "responsable_id",
] as const;

export type ProjectLineaLink = { id: string; principal: boolean };
export type ProjectChangeEntry = { campo: string; valor_anterior: unknown; valor_nuevo: unknown };

/**
 * One entry per changed line link, with the same `campo` ("lineas") and a
 * before/after payload that names the line: add = null -> {id, principal},
 * remove = {id, principal} -> null, and a principal flip = {id,false} ->
 * {id,true}. A replacement that changes nothing writes no audit row.
 */
export function diffLineas(
  before: readonly ProjectLineaLink[],
  after: readonly ProjectLineaLink[],
): ProjectChangeEntry[] {
  const previous = new Map(before.map((link) => [link.id, link.principal]));
  const next = new Map(after.map((link) => [link.id, link.principal]));

  const cambios: ProjectChangeEntry[] = [];
  for (const id of new Set([...previous.keys(), ...next.keys()])) {
    const valorAnterior = previous.has(id) ? { id, principal: previous.get(id)! } : null;
    const valorNuevo = next.has(id) ? { id, principal: next.get(id)! } : null;
    if (JSON.stringify(valorAnterior) === JSON.stringify(valorNuevo)) continue;
    cambios.push({ campo: "lineas", valor_anterior: valorAnterior, valor_nuevo: valorNuevo });
  }
  return cambios;
}

/** Same per-link diff for the municipio set (no attribute beyond membership). */
export function diffMunicipios(
  before: readonly string[],
  after: readonly string[],
): ProjectChangeEntry[] {
  const previous = new Set(before);
  const next = new Set(after);

  const cambios: ProjectChangeEntry[] = [];
  for (const id of new Set([...previous, ...next])) {
    const valorAnterior = previous.has(id) ? { id } : null;
    const valorNuevo = next.has(id) ? { id } : null;
    if (previous.has(id) === next.has(id)) continue;
    cambios.push({ campo: "municipios", valor_anterior: valorAnterior, valor_nuevo: valorNuevo });
  }
  return cambios;
}

// ---------------------------------------------------------------------------
// Referential checks (defense in depth)
// ---------------------------------------------------------------------------

/**
 * The composite primary keys of `proyecto_lineas` / `proyecto_municipios` and
 * the `responsable_id` FK are the real guarantees; these checks answer with the
 * envelope instead of letting a bare P2003/P2002 reach the client as a 500 —
 * the same role `checkOportunidadClienteConsistency` plays in crm.ts.
 *
 * `onlyActive` is the deliberate asymmetry between the two paths (REQ-CAT-02 vs
 * V-04):
 *   - PATCH (E-06) leaves it `false` (existence-only), so a suspended strategic
 *     line or municipio stays valid for the projects that already carry it.
 *   - Creation (E-03/E-05) passes `true`, because a suspended catalog row must
 *     not be offered to new projects.
 */
export type CatalogCheckOptions = { onlyActive?: boolean };

export async function checkLineasExisten(
  lineas: readonly LineaInput[],
  { onlyActive = false }: CatalogCheckOptions = {},
): Promise<Response | null> {
  if (lineas.length === 0) return null;
  const ids = [...new Set(lineas.map((linea) => linea.id))];
  const found = await db.lineaEstrategicaCatalogo.findMany({
    where: onlyActive ? { id: { in: ids }, activo: true } : { id: { in: ids } },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    return apiError(
      onlyActive
        ? "Alguna de las líneas estratégicas no existe o está suspendida."
        : "Alguna de las líneas estratégicas no existe.",
      400,
      "VALIDATION_ERROR",
    );
  }
  return null;
}

export async function checkMunicipiosExisten(
  ids: readonly string[],
  { onlyActive = false }: CatalogCheckOptions = {},
): Promise<Response | null> {
  if (ids.length === 0) return null;
  const requested = [...new Set(ids)];
  const found = await db.municipio.findMany({
    where: onlyActive ? { id: { in: requested }, activo: true } : { id: { in: requested } },
    select: { id: true },
  });
  if (found.length !== requested.length) {
    return apiError(
      onlyActive
        ? "Algún municipio no existe o está suspendido."
        : "Algún municipio no existe.",
      400,
      "VALIDATION_ERROR",
    );
  }
  return null;
}

/** Same copy as the clients PATCH when a responsable is missing or inactive. */
export async function checkResponsableActivo(id: string): Promise<Response | null> {
  const usuario = await db.usuario.findFirst({ where: { id, activo: true }, select: { id: true } });
  if (!usuario) {
    return apiError("El responsable no existe o está inactivo.", 400, "VALIDATION_ERROR");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Creation helpers (E-03 / E-05)
// ---------------------------------------------------------------------------

/**
 * `@db.Date` stores the calendar day: keep the UTC midnight the column reads
 * back. Shared by the creation routes (E-03/E-05) and the PATCH route so a
 * created and an edited date land on the same instant.
 */
export function normalizeProjectDate(value: string): Date {
  const date = parseDate(value)!;
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/**
 * `@db.Decimal(15,2)` rounding: the audited/returned value must equal the one
 * the record ends up holding. A null is preserved.
 */
export function toProjectDecimal(value: number | null): Prisma.Decimal | null {
  return value === null ? null : new Prisma.Decimal(value).toDecimalPlaces(2);
}
