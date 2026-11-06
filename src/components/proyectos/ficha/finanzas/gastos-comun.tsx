// Shared pieces of Finanzas (redesign T3): who may register or validate an expense, the plain-word notices of an
// expense («Supera lo asignado», «Cuenta en AAAA-MM», «Datos incompletos») with their ⓘ help, and the small
// formatting helpers that the Resumen list, the Gastos ledger and the «Validar gasto» panel all use. The API stays the
// authority on every permission; these gates only avoid offering what the API would refuse.

"use client";

import { StatusChip } from "@/components/ui/status-chip";
import { HelpHint } from "@/components/ui/help-hint";
import { useCurrentUser } from "@/hooks/kanban";
import { useProjectMembers, type ProjectExpense, type ProjectListRow } from "@/hooks/projects";
import { PROJECT_MEMBER_ROLES, canManageProjects } from "@/lib/permissions";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { cn } from "@/lib/utils";

export const SUPERA_ASIGNADO = "Supera lo asignado";
/** Validating over the rubro stays blocked (open PO question 1): the help says so instead of «Puedes validarlo igual». */
export const AYUDA_SUPERA =
  "Este gasto deja el rubro por encima de lo asignado. Por ahora no se puede validar: recházalo o pide un traslado entre rubros.";
export const AYUDA_CUENTA_EN = "El gasto cuenta en un mes distinto al de la fecha de su documento.";
export const AYUDA_DISPONIBLE = "Lo asignado al rubro menos lo ya ejecutado y validado.";

export function nombreRubro(rubro: { codigo: string | null; nombre: string }): string {
  return rubro.codigo ? `${rubro.codigo} · ${rubro.nombre}` : rubro.nombre;
}

/** «Sin IVA» when the IVA is 0, otherwise «{subtotal} + IVA {iva}». The budget always consumes the Total. */
export function textoIva(gasto: Pick<ProjectExpense, "iva" | "subtotal">): string {
  const iva = toCents(gasto.iva);
  return iva === BigInt(0) ? "Sin IVA" : `${formatCOP(toCents(gasto.subtotal))} + IVA ${formatCOP(iva)}`;
}

export const monto = (valor: string) => formatCOP(toCents(valor));

/**
 * Who may register (manager or team member, EN_EJECUCION) and who may validate (a manager, EN_EJECUCION, never on
 * their own expense). Also names the people who registered expenses, from the team list plus the current user:
 * the expenses API sends only the id, so an unknown registrant stays unnamed.
 */
export function usePermisosGastos(proyecto: ProjectListRow) {
  const userQuery = useCurrentUser();
  const membersQuery = useProjectMembers(proyecto.id);
  const usuario = userQuery.data ?? null;
  const esGestor = usuario ? canManageProjects({ id: usuario.id, rol: usuario.rol }) : false;
  // S6 (PO matrix 2026-10-19): membership, not the role, grants registering.
  const esMiembroDelEquipo = Boolean(
    usuario &&
      PROJECT_MEMBER_ROLES.includes(usuario.rol) &&
      (membersQuery.data ?? []).some((miembro) => miembro.usuario.id === usuario.id),
  );
  const enEjecucion = proyecto.estado === "EN_EJECUCION";
  const puedeRegistrar = (esGestor || esMiembroDelEquipo) && enEjecucion;
  const permisosResueltos = Boolean(usuario) && (esGestor || membersQuery.isSuccess || membersQuery.isError);
  const soloConsulta = permisosResueltos && !puedeRegistrar && enEjecucion;

  const nombres = new Map<string, string>();
  for (const miembro of membersQuery.data ?? []) nombres.set(miembro.usuario.id, miembro.usuario.nombre);
  if (usuario) nombres.set(usuario.id, usuario.nombre);

  return {
    usuarioId: usuario?.id ?? null,
    esGestor,
    puedeRegistrar,
    /** Validar / Rechazar: a manager while the project is EN_EJECUCION (the API also refuses the registrant). */
    puedeValidar: esGestor && enEjecucion,
    soloConsulta,
    nombreDe: (id: string) => nombres.get(id) ?? null,
  };
}

/** «FV-4007 · 02 nov 2026 · registró Laura Jiménez»; the registrant only when known. */
export function lineaRegistro(gasto: ProjectExpense, registro: string | null, fecha: string): string {
  return [gasto.numero_documento, fecha, registro ? `registró ${registro}` : null].filter(Boolean).join(" · ");
}

function AvisoConAyuda({ tone, texto, ayuda }: { tone: "destructivo" | "info"; texto: string; ayuda: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <StatusChip tone={tone}>{texto}</StatusChip>
      <HelpHint label={texto}>{ayuda}</HelpHint>
    </span>
  );
}

/**
 * The notices of an expense, each a labelled chip (never colour alone): «Supera lo asignado» (red, with help) while it
 * waits for validation, «Cuenta en AAAA-MM» (with help) when its period differs from its document month, and
 * «Datos incompletos» while the third party has no identification.
 */
export function AvisosGasto({
  gasto,
  conCuentaEn = true,
  className,
}: {
  gasto: ProjectExpense;
  /** The Gastos ledger keeps its own «Periodo modificado» line; the other surfaces show «Cuenta en». */
  conCuentaEn?: boolean;
  className?: string;
}) {
  const supera = gasto.estado === "REGISTRADO" && gasto.alerta_sobregasto;
  const cuentaEn = conCuentaEn && gasto.periodo_modificado;
  const incompleto = gasto.estado === "REGISTRADO" && gasto.datos_incompletos;
  if (!supera && !cuentaEn && !incompleto) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {supera && <AvisoConAyuda tone="destructivo" texto={SUPERA_ASIGNADO} ayuda={AYUDA_SUPERA} />}
      {cuentaEn && <AvisoConAyuda tone="info" texto={`Cuenta en ${gasto.periodo}`} ayuda={AYUDA_CUENTA_EN} />}
      {incompleto && <StatusChip tone="alerta">Datos incompletos</StatusChip>}
    </span>
  );
}
