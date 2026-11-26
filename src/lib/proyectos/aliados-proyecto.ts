// S9: allies of a posición propia project (`ProyectoCliente`). Shared by the creation route
// (initial allies, S13) and the `/projects/:id/allies` endpoints, so both validate, store and
// project an ally the same way.

import { EstadoAliado, Prisma, RolAliado, type Usuario } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { canEditProjectData } from "@/lib/permissions";
import { loadProjectScoped, projectReadActor } from "@/lib/api/projects";
import { estaCongelado } from "@/lib/proyectos/transiciones-estado";

export const POSICION_PROPIA = "POSICION_PROPIA" as const;

export const ALIADOS_SOLO_POSICION_PROPIA_MESSAGE =
  "Solo los proyectos de posición propia tienen aliados.";
export const ALIADO_DUPLICADO_MESSAGE =
  "Este cliente ya es aliado del proyecto.";
const ALIADOS_CONGELADOS_MESSAGE =
  "No se pueden cambiar los aliados de un proyecto suspendido, cerrado o cancelado.";
export const ALIADO_NO_EXISTE_MESSAGE = "El aliado no existe.";
export const ORIGEN_POSICION_PROPIA_FIJO_MESSAGE =
  "Un proyecto no puede pasar a posición propia ni dejar de serlo después de creado.";

/** `@db.Decimal(15,2)` upper bound, so a bigger amount is a 400 and not a Postgres overflow. */
const APORTE_MAX = 9_999_999_999_999.99;

const APORTE_SCHEMA = z
  .number({ error: "El aporte no es válido." })
  .min(0, "El aporte no puede ser negativo.")
  .max(APORTE_MAX, "El aporte es demasiado alto.")
  .nullable();

const ROL_SCHEMA = z.enum(RolAliado, {
  error: "El rol del aliado no es válido.",
});
const ESTADO_SCHEMA = z.enum(EstadoAliado, {
  error: "El estado del aliado no es válido.",
});

/** One ally as POST bodies send it: the client, its role and, optionally, state and contribution. */
export const ALIADO_CREATE_SCHEMA = z.object({
  cliente_id: z.string().min(1, "El cliente no es válido."),
  rol: ROL_SCHEMA,
  estado: ESTADO_SCHEMA.optional(),
  aporte_cop: APORTE_SCHEMA.optional(),
});

/** The client is the row's identity; only the role, state and contribution change. */
export const ALIADO_PATCH_SCHEMA = z.strictObject(
  {
    rol: ROL_SCHEMA.optional(),
    estado: ESTADO_SCHEMA.optional(),
    aporte_cop: APORTE_SCHEMA.optional(),
  },
  { error: "Solo se pueden cambiar el rol, el estado y el aporte del aliado." },
);

/** The initial allies of a new project: a client appears once. */
export const ALIADOS_INICIALES_SCHEMA = z
  .array(ALIADO_CREATE_SCHEMA)
  .max(200, "Demasiados aliados.")
  .refine(
    (aliados) =>
      new Set(aliados.map((a) => a.cliente_id)).size === aliados.length,
    "No repitas el mismo cliente como aliado.",
  );


export const PROYECTO_CLIENTE_SELECT = {
  id: true,
  rol: true,
  estado: true,
  aporte_cop: true,
  created_at: true,
  updated_at: true,
  cliente: { select: { id: true, nombre: true } },
} satisfies Prisma.ProyectoClienteSelect;

type ProyectoClienteRow = Prisma.ProyectoClienteGetPayload<{
  select: typeof PROYECTO_CLIENTE_SELECT;
}>;

export type AliadoItem = {
  id: string;
  cliente: { id: string; nombre: string };
  rol: RolAliado;
  estado: EstadoAliado;
  aporte_cop: number | null;
  created_at: string;
  updated_at: string;
};

export function toAliadoItem(row: ProyectoClienteRow): AliadoItem {
  return {
    id: row.id,
    cliente: row.cliente,
    rol: row.rol,
    estado: row.estado,
    aporte_cop: row.aporte_cop === null ? null : Number(row.aporte_cop),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/** Rounds like the column, so the audited value equals the stored one. A null is preserved. */
export function toAporteDecimal(
  value: number | null | undefined,
): Prisma.Decimal | null {
  return value === null || value === undefined
    ? null
    : new Prisma.Decimal(value).toDecimalPlaces(2);
}

/** The audit payload of one ally row. */
export function aliadoAuditValue(row: {
  cliente_id: string;
  rol: RolAliado;
  estado: EstadoAliado;
  aporte_cop: Prisma.Decimal | null;
}) {
  return {
    cliente_id: row.cliente_id,
    rol: row.rol,
    estado: row.estado,
    aporte_cop: row.aporte_cop === null ? null : row.aporte_cop.toFixed(2),
  };
}

/** 404 when any of the clients is missing or soft-deleted; `null` when all exist. */
export async function checkClientesAliadosExisten(
  clienteIds: readonly string[],
): Promise<Response | null> {
  if (clienteIds.length === 0) return null;
  const unicos = [...new Set(clienteIds)];
  const encontrados = await db.cliente.findMany({
    where: { id: { in: unicos }, deleted_at: null },
    select: { id: true },
  });
  if (encontrados.length !== unicos.length) {
    return apiError("El cliente aliado no existe.", 404, "NOT_FOUND");
  }
  return null;
}

/** True when a P2002 comes from the `(proyecto_id, cliente_id)` unique of `proyecto_clientes`. */
export function esAliadoDuplicado(err: unknown): boolean {
  if (
    !(err instanceof Prisma.PrismaClientKnownRequestError) ||
    err.code !== "P2002"
  ) {
    return false;
  }
  const meta = JSON.stringify(err.meta ?? {});
  return (
    meta.includes("proyecto_clientes") ||
    (meta.includes("proyecto_id") && meta.includes("cliente_id"))
  );
}

/**
 * The gate every allies write goes through, in the order the other project routes use: 404 for a
 * missing project, 403 without `canEditProjectData` (S14 default until D3), then 409 when the
 * project is not posición propia or is frozen (suspended, closed, cancelled).
 */
export async function gateEscrituraAliados(
  usuario: Usuario,
  proyectoId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const scoped = await loadProjectScoped(usuario, proyectoId, {
    id: true,
    origen: true,
    estado: true,
  });
  if (!scoped) {
    return { ok: false, response: apiError("El proyecto no existe.", 404, "NOT_FOUND") };
  }
  if (!canEditProjectData(projectReadActor(usuario, scoped.es_miembro))) {
    return {
      ok: false,
      response: apiError("No tienes permisos sobre este proyecto.", 403, "FORBIDDEN"),
    };
  }
  if (scoped.row.origen !== POSICION_PROPIA) {
    return {
      ok: false,
      response: apiError(ALIADOS_SOLO_POSICION_PROPIA_MESSAGE, 409, "INVALID_STATE"),
    };
  }
  if (estaCongelado(scoped.row.estado)) {
    return { ok: false, response: apiError(ALIADOS_CONGELADOS_MESSAGE, 409, "INVALID_STATE") };
  }
  return { ok: true };
}
