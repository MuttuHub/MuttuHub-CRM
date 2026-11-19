// B6 (odd/tasks/producto-pendientes-2026-11.md, S1, decision L7 «Bloquear») — a catalogue rubro switched
// off for ONE project (`proyecto_rubros_deshabilitados`).
//
// Rules:
// - Disabling is allowed only while every line of the rubro in the project is at $0 and the rubro has no
//   expenses there (header line or distribution row). Otherwise the request is refused with the reason.
// - Re-enabling is always allowed.
// - Both run in BORRADOR and EN_EJECUCION, under the project row lock, so a budget write, a template import
//   or a modification approval (which all lock that row) cannot add money between the check and the write.
// - Who may toggle: the budget-edit permission (`canEditProjectData`, as in `gatePresupuestoWrite`).
// - Each effective toggle writes one `EDITAR` / `rubro` audit row in the same transaction.
//
// The other writers (budget PUT, template import, expense create/import, modification requests) read the
// disabled set through `rubrosDeshabilitados` / `rubroDeshabilitado` and refuse to put money on a disabled
// rubro with `rubroDeshabilitadoMessage`.

import type { Prisma, Usuario } from "@prisma/client";
import { apiError, RespuestaAbortada } from "@/lib/api/errors";
import { canEditProjectData } from "@/lib/permissions";
import { loadProjectScoped, projectReadActor } from "@/lib/api/projects";
import type { GateResult } from "@/lib/api/estructura";
import { logChanges } from "@/lib/api/audit-cambios";
import { lineasTienenGastos } from "@/lib/api/lineas-con-gastos";
import { formatCOP, sumCents, toCents } from "@/lib/proyectos/money";
import { PROYECTO_NO_EXISTE, lockProyecto } from "@/lib/api/presupuesto";

const RUBROS_FORBIDDEN_MESSAGE = "No tienes permisos sobre este proyecto.";
const RUBRO_NO_EXISTE = "El rubro no existe.";
const RUBROS_ESTADO_MESSAGE =
  "Solo se pueden habilitar o deshabilitar rubros de un proyecto en Borrador o en ejecución.";

/** Estados where a rubro may be switched on or off for the project. */
const ESTADOS_PERMITIDOS = new Set(["BORRADOR", "EN_EJECUCION"]);

type RubroNombre = { codigo: string | null; nombre: string };

/** «R05 Viáticos», or the bare name of a legacy rubro without a code. */
const etiquetaRubro = (rubro: RubroNombre): string => (rubro.codigo ? `${rubro.codigo} ${rubro.nombre}` : rubro.nombre);

/** What every writer answers when asked to put money or an expense on a disabled rubro. */
export function rubroDeshabilitadoMessage(rubro: RubroNombre): string {
  return `El rubro ${etiquetaRubro(rubro)} está deshabilitado para este proyecto. Habilítalo en el presupuesto antes de asignarle dinero o registrarle gastos.`;
}

/**
 * B6: the one rule every budget writer applies (budget PUT, template validation and apply): a rubro disabled for
 * the project takes no money. Returns the refusal message, or null when the amount is allowed.
 */
export function rechazoPorRubroDeshabilitado(rubro: RubroNombre & { deshabilitado: boolean }, cents: bigint): string | null {
  return rubro.deshabilitado && cents > BigInt(0) ? rubroDeshabilitadoMessage(rubro) : null;
}

function rubroConAsignadoMessage(rubro: RubroNombre, asignado: string): string {
  return `No se puede deshabilitar el rubro ${etiquetaRubro(rubro)}: tiene ${asignado} asignados en este proyecto. Lleva sus líneas a $0 antes de deshabilitarlo.`;
}

function rubroConGastosMessage(rubro: RubroNombre): string {
  return `No se puede deshabilitar el rubro ${etiquetaRubro(rubro)}: tiene gastos registrados en este proyecto.`;
}

type LectorDeshabilitados = Pick<Prisma.TransactionClient, "proyectoRubroDeshabilitado">;

/** The rubro (code and name, for the message) when it is disabled in this project; null otherwise. */
export async function rubroDeshabilitado(
  client: LectorDeshabilitados,
  proyectoId: string,
  rubroId: string,
): Promise<RubroNombre | null> {
  const fila = await client.proyectoRubroDeshabilitado.findUnique({
    where: { proyecto_id_rubro_id: { proyecto_id: proyectoId, rubro_id: rubroId } },
    select: { rubro: { select: { codigo: true, nombre: true } } },
  });
  return fila?.rubro ?? null;
}

/** 404 -> 403 for a toggle; the estado is checked under the lock inside the write. */
export async function gateRubrosProyecto(usuario: Usuario, proyectoId: string): Promise<GateResult<{ id: string }>> {
  const scoped = await loadProjectScoped(usuario, proyectoId, { id: true });
  if (!scoped) return { ok: false, response: apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND") };
  if (!canEditProjectData(projectReadActor(usuario, scoped.es_miembro))) {
    return { ok: false, response: apiError(RUBROS_FORBIDDEN_MESSAGE, 403, "FORBIDDEN") };
  }
  return { ok: true, value: scoped.row };
}

type HabilitacionRubro = { rubro_id: string; habilitado: boolean };

type CambiarArgs = { proyectoId: string; rubroId: string; habilitado: boolean; usuarioId: string };

const abortar = (message: string, status: number, code: "NOT_FOUND" | "INVALID_STATE" | "CONFLICT"): never => {
  throw new RespuestaAbortada(apiError(message, status, code));
};

/**
 * Switches a rubro on or off for one project, inside the caller's transaction. Asking for the state the rubro
 * is already in changes nothing and writes no audit row.
 */
export async function cambiarHabilitacionRubro(
  tx: Prisma.TransactionClient,
  { proyectoId, rubroId, habilitado, usuarioId }: CambiarArgs,
): Promise<HabilitacionRubro> {
  const proyecto = await lockProyecto(tx, proyectoId);
  if (!ESTADOS_PERMITIDOS.has(proyecto.estado)) abortar(RUBROS_ESTADO_MESSAGE, 409, "INVALID_STATE");

  const rubro = await tx.rubro.findUnique({ where: { id: rubroId }, select: { id: true, codigo: true, nombre: true } });
  if (!rubro) return abortar(RUBRO_NO_EXISTE, 404, "NOT_FOUND");

  const yaDeshabilitado = (await rubroDeshabilitado(tx, proyectoId, rubroId)) !== null;
  if (yaDeshabilitado === !habilitado) return { rubro_id: rubroId, habilitado };

  if (!habilitado) {
    const lineas = await tx.lineaPresupuestal.findMany({
      where: { proyecto_id: proyectoId, rubro_id: rubroId },
      select: { id: true, monto_proyectado_cop: true },
    });
    const asignado = sumCents(lineas.map((linea) => toCents(linea.monto_proyectado_cop)));
    if (asignado > BigInt(0)) abortar(rubroConAsignadoMessage(rubro, formatCOP(asignado)), 409, "CONFLICT");
    if (await lineasTienenGastos(tx, proyectoId, lineas.map((linea) => linea.id))) {
      abortar(rubroConGastosMessage(rubro), 409, "CONFLICT");
    }
    await tx.proyectoRubroDeshabilitado.create({
      data: { proyecto_id: proyectoId, rubro_id: rubroId, created_by_id: usuarioId },
    });
  } else {
    await tx.proyectoRubroDeshabilitado.delete({
      where: { proyecto_id_rubro_id: { proyecto_id: proyectoId, rubro_id: rubroId } },
    });
  }

  await logChanges(tx, [
    {
      usuario_id: usuarioId,
      accion: "EDITAR",
      entidad: "rubro",
      entidad_id: rubroId,
      proyecto_id: proyectoId,
      campo: "habilitado",
      valor_anterior: !habilitado,
      valor_nuevo: habilitado,
    },
  ]);
  return { rubro_id: rubroId, habilitado };
}
