// Sección "Gastos" de la ficha (S6 U6): lista de gastos con totales por estado, registro
// (gestores y COORDINADOR integrante, solo EN_EJECUCION), validación y soportes. El número de
// identificación del tercero y los soportes llegan SOLO si la API los envía (RNF-03): aquí se
// pintan si vienen y nunca se piden por otro camino. La API es la autoridad de cada permiso.

"use client";

import { CaptureSurface, useIsMobile } from "@/components/proyectos/capture-surface";
import { useState } from "react";
import { Paperclip, Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VoidControl, errorMessage } from "@/components/proyectos/estructura-ui";
import { EmptyBlock, InlineError, SectionHeader } from "@/components/proyectos/ui";
import { GastosKpis } from "@/components/proyectos/gastos-kpis";
import { GastoForm, TIPO_SOPORTE_LABELS } from "@/components/proyectos/gasto-form";
import { ValidacionControles } from "@/components/proyectos/gasto-acciones";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { useCurrentUser } from "@/hooks/kanban";
import {
  downloadExpenseSoporte,
  useProjectBudget,
  useProjectExpenses,
  useProjectMembers,
  useVoidExpense,
  type ProjectExpense,
  type ProjectExpenseEstado,
  type ProjectListRow,
} from "@/hooks/projects";
import type { UiTone } from "@/lib/catalogs";
import { canManageProjects } from "@/lib/permissions";
import { esObservado } from "@/lib/proyectos/gastos";
import { formatCOP, toCents } from "@/lib/proyectos/money";

export const ESTADO_GASTO_META: Record<ProjectExpenseEstado, { label: string; tone: UiTone }> = {
  REGISTRADO: { label: "Registrado", tone: "info" },
  VALIDADO: { label: "Validado", tone: "exito" },
  RECHAZADO: { label: "Rechazado", tone: "destructivo" },
  ANULADO: { label: "Anulado", tone: "neutro" },
};

type Filtro = "TODOS" | "REGISTRADO" | "VALIDADO" | "RECHAZADO" | "ANULADO" | "OBSERVADOS";

const FILTRO_LABEL: Record<Filtro, string> = {
  TODOS: "Todos",
  REGISTRADO: "Registrado",
  VALIDADO: "Validado",
  RECHAZADO: "Rechazado",
  ANULADO: "Anulado",
  OBSERVADOS: "Observados",
};

/** D5: el filtro "Observados" no es un estado; los demás coinciden con el estado del gasto. */
function coincide(gasto: ProjectExpense, filtro: Filtro): boolean {
  if (filtro === "TODOS") return true;
  if (filtro === "OBSERVADOS") return esObservado(gasto);
  return gasto.estado === filtro;
}

/** Chips de filtro sobre la lista ya cargada, con conteos. "Anulado" solo aparece si hay anulados. */
function FiltrosGasto({
  gastos,
  filtro,
  onChange,
}: {
  gastos: readonly ProjectExpense[];
  filtro: Filtro;
  onChange: (filtro: Filtro) => void;
}) {
  const filtros = (Object.keys(FILTRO_LABEL) as Filtro[]).filter(
    (f) => f !== "ANULADO" || gastos.some((gasto) => gasto.estado === "ANULADO"),
  );
  return (
    <div role="group" aria-label="Filtrar gastos" data-testid="gastos-filtros" className="flex flex-wrap gap-2">
      {filtros.map((f) => (
        <Button
          key={f}
          type="button"
          size="sm"
          variant={filtro === f ? "default" : "outline"}
          aria-pressed={filtro === f}
          className="rounded-full"
          onClick={() => onChange(f)}
        >
          {FILTRO_LABEL[f]}
          <span className="font-mono tabular-nums opacity-80">{gastos.filter((gasto) => coincide(gasto, f)).length}</span>
        </Button>
      ))}
    </div>
  );
}

export function ProjectGastos({ proyecto }: { proyecto: ProjectListRow }) {
  const query = useProjectExpenses(proyecto.id);
  const budgetQuery = useProjectBudget(proyecto.id);
  const userQuery = useCurrentUser();
  const membersQuery = useProjectMembers(proyecto.id);
  const [registrando, setRegistrando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("TODOS");

  const usuario = userQuery.data;
  const esGestor = usuario ? canManageProjects({ id: usuario.id, rol: usuario.rol }) : false;
  const esMiembroCoordinador = Boolean(
    usuario &&
      usuario.rol === "COORDINADOR" &&
      (membersQuery.data ?? []).some((miembro) => miembro.usuario.id === usuario.id),
  );
  // Registrar: gestor o COORDINADOR integrante, y solo con el proyecto en ejecución.
  const puedeRegistrar = (esGestor || esMiembroCoordinador) && proyecto.estado === "EN_EJECUCION";

  const gastos = query.data?.gastos ?? [];
  const visibles = gastos.filter((gasto) => coincide(gasto, filtro));

  return (
    <section data-testid="gastos">
      <SectionHeader icon={<Receipt className="size-3.5" strokeWidth={2} />}>Gastos</SectionHeader>

      <div className="mt-2">
        <GastosKpis data={query.data} isLoading={query.isLoading} isError={query.isError} error={query.error} />
      </div>

      {query.data && (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {gastos.length > 0 ? <FiltrosGasto gastos={gastos} filtro={filtro} onChange={setFiltro} /> : <span />}
            {puedeRegistrar && !registrando && (
              <Button type="button" variant="outline" size="sm" onClick={() => setRegistrando(true)}>
                <Plus className="size-3.5" />
                Registrar gasto
              </Button>
            )}
          </div>

          {puedeRegistrar && registrando && (
            <CaptureSurface title="Registrar gasto" onClose={() => setRegistrando(false)}>
              <GastoForm
                proyecto={proyecto}
                rubros={budgetQuery.data?.rubros ?? []}
                onDone={() => setRegistrando(false)}
              />
            </CaptureSurface>
          )}

          <div data-testid="gastos-lista" className="mt-2">
            {gastos.length === 0 ? (
              <EmptyBlock>Aún no hay gastos registrados.</EmptyBlock>
            ) : visibles.length === 0 ? (
              <EmptyBlock>No hay gastos con este filtro.</EmptyBlock>
            ) : (
              <GastosListado
                proyectoId={proyecto.id}
                gastos={visibles}
                usuarioId={usuario?.id ?? null}
                esGestor={esGestor}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}

type FilaProps = {
  proyectoId: string;
  gasto: ProjectExpense;
  usuarioId: string | null;
  esGestor: boolean;
};

/** Debajo de `md` el libro se vuelve una lista de tarjetas (misma convención que el Portafolio). */
function GastosListado({
  proyectoId,
  gastos,
  usuarioId,
  esGestor,
}: {
  proyectoId: string;
  gastos: readonly ProjectExpense[];
  usuarioId: string | null;
  esGestor: boolean;
}) {
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <ul data-testid="gastos-cards" className="flex flex-col gap-2">
        {gastos.map((gasto) => (
          <GastoTarjeta key={gasto.id} proyectoId={proyectoId} gasto={gasto} usuarioId={usuarioId} esGestor={esGestor} />
        ))}
      </ul>
    );
  }
  return (
    <div className="surface overflow-hidden">
      <Table className="min-w-[920px]">
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Rubro</TableHead>
            <TableHead>Tercero</TableHead>
            <TableHead>Documento</TableHead>
            <TableHead numeric>Monto</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Soporte</TableHead>
            {esGestor && <TableHead>Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {gastos.map((gasto) => (
            <GastoFila key={gasto.id} proyectoId={proyectoId} gasto={gasto} usuarioId={usuarioId} esGestor={esGestor} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Descarga de un soporte por URL firmada; el error se muestra en línea. */
function useVerSoporte(proyectoId: string, gastoId: string) {
  const [error, setError] = useState<string | null>(null);
  async function ver(soporteId: string) {
    setError(null);
    try {
      await downloadExpenseSoporte(proyectoId, gastoId, soporteId);
    } catch (e) {
      setError(errorMessage(e, "No pudimos abrir el soporte. Inténtalo de nuevo."));
    }
  }
  return { error, ver };
}

/** `2026-10-09` -> `09/10/26` (compacto para la tabla; la fecha completa va en el `title`). */
function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.slice(0, 10).split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio.slice(2)}` : iso;
}

function nombreRubro(gasto: ProjectExpense): string {
  return gasto.rubro.codigo ? `${gasto.rubro.codigo} · ${gasto.rubro.nombre}` : gasto.rubro.nombre;
}

/** Validar / Rechazar (REGISTRADO) o Anular (VALIDADO), solo para quien gestiona proyectos. */
function AccionesGasto({ proyectoId, gasto, usuarioId, esGestor }: FilaProps) {
  const anular = useVoidExpense();
  if (esGestor && gasto.estado === "REGISTRADO") {
    return (
      <ValidacionControles
        projectId={proyectoId}
        gastoId={gasto.id}
        propio={gasto.registrado_por_id === usuarioId}
        datosIncompletos={gasto.datos_incompletos}
      />
    );
  }
  if (esGestor && gasto.estado === "VALIDADO") {
    return (
      <VoidControl
        nombre={`gasto ${gasto.numero_documento}`}
        pending={anular.isPending}
        error={anular.isError ? errorMessage(anular.error, "No pudimos anular el gasto. Inténtalo de nuevo.") : null}
        onConfirm={(motivo) => anular.mutate({ projectId: proyectoId, id: gasto.id, motivo })}
      />
    );
  }
  return null;
}

/** Un botón por soporte, o "Sin soporte"; sin acceso a soportes (RNF-03) no se dice nada. */
function SoporteGasto({ gasto, onVer }: { gasto: ProjectExpense; onVer: (soporteId: string) => void }) {
  if (!gasto.soportes) return <span className="text-ink-500">—</span>;
  if (gasto.soportes.length === 0) return <StatusChip tone="alerta">Sin soporte</StatusChip>;
  return (
    <div className="flex flex-col items-start gap-1">
      {gasto.soportes.map((soporte) => (
        <Button
          key={soporte.id}
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Ver soporte ${soporte.nombre}`}
          onClick={() => onVer(soporte.id)}
        >
          <Paperclip />
          <span className="max-w-[96px] truncate">{soporte.nombre}</span>
        </Button>
      ))}
    </div>
  );
}

function EstadoGasto({ gasto }: { gasto: ProjectExpense }) {
  const meta = ESTADO_GASTO_META[gasto.estado];
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
        {gasto.alerta_sobregasto && <StatusChip tone="destructivo">Supera el asignado</StatusChip>}
        {gasto.datos_incompletos && <StatusChip tone="alerta">Datos incompletos</StatusChip>}
      </div>
      {gasto.estado === "RECHAZADO" && gasto.motivo_rechazo && (
        <p className="text-[12px] text-destructivo">Rechazado: {gasto.motivo_rechazo}</p>
      )}
      {gasto.estado === "ANULADO" && gasto.motivo_anulacion && (
        <p className="text-[12px] text-ink-600">Anulado: {gasto.motivo_anulacion}</p>
      )}
    </div>
  );
}

function GastoFila(props: FilaProps) {
  const { proyectoId, gasto, esGestor } = props;
  const { error, ver } = useVerSoporte(proyectoId, gasto.id);
  const identificacion = [gasto.tercero_tipo_id, gasto.tercero_numero_id].filter(Boolean).join(" ");
  return (
    <TableRow
      data-testid="gasto-fila"
      data-observado={esObservado(gasto) ? "true" : undefined}
      className={esObservado(gasto) ? "bg-alerta-bg/40" : undefined}
    >
      <TableCell className="align-top font-mono text-[12.5px] text-ink-700">
        <span title={formatFechaCalendario(gasto.fecha_documento)}>{fechaCorta(gasto.fecha_documento)}</span>
      </TableCell>
      <TableCell className="min-w-[150px] max-w-[240px] align-top whitespace-normal">
        <p className="text-[13px] font-semibold text-ink-950">{nombreRubro(gasto)}</p>
        <p className="text-[12px] text-ink-600">{gasto.descripcion}</p>
      </TableCell>
      <TableCell className="min-w-[130px] max-w-[200px] align-top whitespace-normal">
        <p className="text-[13px] text-ink-900">{gasto.tercero_nombre}</p>
        {identificacion && <p className="font-mono text-[12px] text-ink-600">{identificacion}</p>}
      </TableCell>
      <TableCell className="max-w-[160px] align-top whitespace-normal">
        <p className="font-mono text-[13px] break-all text-ink-900">{gasto.numero_documento}</p>
        <p className="text-[12px] text-ink-600">{TIPO_SOPORTE_LABELS[gasto.tipo_soporte]}</p>
      </TableCell>
      <TableCell numeric className="align-top font-mono text-[13px] font-semibold text-ink-900">
        {formatCOP(toCents(gasto.valor))}
      </TableCell>
      <TableCell className="max-w-[200px] align-top whitespace-normal">
        <EstadoGasto gasto={gasto} />
      </TableCell>
      <TableCell className="align-top whitespace-normal">
        <SoporteGasto gasto={gasto} onVer={(id) => void ver(id)} />
        <InlineError message={error} />
      </TableCell>
      {esGestor && (
        <TableCell className="min-w-[180px] align-top whitespace-normal">
          <AccionesGasto {...props} />
        </TableCell>
      )}
    </TableRow>
  );
}

function GastoTarjeta(props: FilaProps) {
  const { proyectoId, gasto } = props;
  const { error, ver } = useVerSoporte(proyectoId, gasto.id);
  const identificacion = [gasto.tercero_tipo_id, gasto.tercero_numero_id].filter(Boolean).join(" ");
  return (
    <li data-testid="gasto-fila" className="surface-inner flex flex-col gap-1.5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <EstadoGasto gasto={gasto} />
        <span className="font-mono text-[13px] font-semibold text-ink-900 tabular-nums">
          {formatCOP(toCents(gasto.valor))}
        </span>
      </div>
      <p className="text-[13px] text-ink-900">
        <span className="font-semibold">{nombreRubro(gasto)}</span>
        {" — "}
        {gasto.descripcion}
      </p>
      <p className="text-[12px] text-ink-600">
        {[
          gasto.tercero_nombre,
          identificacion,
          `${TIPO_SOPORTE_LABELS[gasto.tipo_soporte]} ${gasto.numero_documento}`,
          formatFechaCalendario(gasto.fecha_documento),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <SoporteGasto gasto={gasto} onVer={(id) => void ver(id)} />
      <InlineError message={error} />
      <AccionesGasto {...props} />
    </li>
  );
}
