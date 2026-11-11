// Sección "Gastos" de la ficha (S6 U6): lista de gastos con totales por estado, registro
// (gestores y COORDINADOR integrante, solo EN_EJECUCION) y soportes. El número de
// identificación del tercero y los soportes llegan SOLO si la API los envía (RNF-03): aquí se
// pintan si vienen y nunca se piden por otro camino. La API es la autoridad de cada permiso.
// AJ-08: no hay aprobación. Todo gasto registrado ya cuenta como ejecutado; los filtros se quedan con Todos,
// Registrado y Anulado, y la única acción es Anular (con motivo), que no borra la fila.

"use client";

import { CaptureSurface, useIsMobile } from "@/components/proyectos/capture-surface";
import { useState } from "react";
import { Paperclip, Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VoidControl, errorMessage } from "@/components/proyectos/estructura-ui";
import { AvisoSoloConsulta, EmptyBlock, InlineError, SectionHeader } from "@/components/proyectos/ui";
import { GASTOS_ERROR, GastosResumen } from "@/components/proyectos/gastos-kpis";
import { GastoForm, TIPO_SOPORTE_LABELS } from "@/components/proyectos/gasto-form";
import { GastosImportDialog } from "@/components/proyectos/gastos-import-dialog";
import { AdjuntarSoporte, MAX_SOPORTES_POR_GASTO } from "@/components/proyectos/gasto-soportes";
import {
  AvisosGasto,
  lineaRegistro,
  nombreRubro,
  textoIva,
  usePermisosGastos,
} from "@/components/proyectos/ficha/finanzas/gastos-comun";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import {
  downloadExpenseSoporte,
  useProjectBudget,
  useProjectExpenses,
  useVoidExpense,
  type ProjectExpense,
  type ProjectExpenseEstado,
  type ProjectListRow,
} from "@/hooks/projects";
import type { UiTone } from "@/lib/catalogs";
import { cuentaComoEjecutado, esObservado } from "@/lib/proyectos/gastos";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { FiltroChip } from "@/components/proyectos/ficha/filtro-chip";

// AJ-08: a legacy VALIDADO row reads «Registrado», because approval no longer exists on screen. RECHAZADO keeps its
// own label until the data task of D2 turns those rows into ANULADO.
const ESTADO_GASTO_META: Record<ProjectExpenseEstado, { label: string; tone: UiTone }> = {
  REGISTRADO: { label: "Registrado", tone: "info" },
  VALIDADO: { label: "Registrado", tone: "info" },
  RECHAZADO: { label: "Rechazado", tone: "destructivo" },
  ANULADO: { label: "Anulado", tone: "neutro" },
};

type Filtro = "TODOS" | "REGISTRADO" | "ANULADO";

const FILTRO_LABEL: Record<Filtro, string> = {
  TODOS: "Todos",
  REGISTRADO: "Registrado",
  ANULADO: "Anulado",
};

/** AJ-08: «Registrado» is every expense that counts as executed, legacy VALIDADO rows included. */
function coincide(gasto: ProjectExpense, filtro: Filtro): boolean {
  if (filtro === "TODOS") return true;
  if (filtro === "REGISTRADO") return cuentaComoEjecutado(gasto.estado);
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
        <FiltroChip key={f} activo={filtro === f} onClick={() => onChange(f)}>
          {FILTRO_LABEL[f]}
          <span className="font-mono tabular-nums opacity-80">{gastos.filter((gasto) => coincide(gasto, f)).length}</span>
        </FiltroChip>
      ))}
    </div>
  );
}

export function ProjectGastos({ proyecto }: { proyecto: ProjectListRow }) {
  const query = useProjectExpenses(proyecto.id);
  const budgetQuery = useProjectBudget(proyecto.id);
  const permisos = usePermisosGastos(proyecto);
  const [registrando, setRegistrando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const { puedeRegistrar, soloConsulta } = permisos;

  const gastos = query.data?.gastos ?? [];
  const visibles = gastos.filter((gasto) => coincide(gasto, filtro));

  return (
    <section data-testid="gastos">
      <SectionHeader icon={<Receipt className="size-3.5" strokeWidth={2} />}>Gastos</SectionHeader>

      {query.isError ? (
        <InlineError className="mt-2" message={errorMessage(query.error, GASTOS_ERROR)} />
      ) : !query.data ? (
        <Skeleton className="mt-2 h-24 w-full rounded-[14px]" />
      ) : (
        <>
          <GastosResumen data={query.data} />
          {soloConsulta && <AvisoSoloConsulta className="mt-2" />}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {gastos.length > 0 ? <FiltrosGasto gastos={gastos} filtro={filtro} onChange={setFiltro} /> : <span />}
            {puedeRegistrar && !registrando && (
              <div className="flex flex-wrap items-center gap-2">
                <GastosImportDialog proyectoId={proyecto.id} />
                <Button type="button" variant="outline" size="sm" onClick={() => setRegistrando(true)}>
                  <Plus className="size-3.5" />
                  Registrar gasto
                </Button>
              </div>
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
              <GastosListado proyectoId={proyecto.id} gastos={visibles} permisos={permisos} />
            )}
          </div>
        </>
      )}
    </section>
  );
}

type Permisos = ReturnType<typeof usePermisosGastos>;

type FilaProps = {
  proyectoId: string;
  gasto: ProjectExpense;
  permisos: Permisos;
};

/** Debajo de `md` el libro se vuelve una lista de tarjetas (misma convención que el Portafolio). */
function GastosListado({
  proyectoId,
  gastos,
  permisos,
}: {
  proyectoId: string;
  gastos: readonly ProjectExpense[];
  permisos: Permisos;
}) {
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <ul data-testid="gastos-cards" className="flex flex-col gap-2">
        {gastos.map((gasto) => (
          <GastoTarjeta key={gasto.id} proyectoId={proyectoId} gasto={gasto} permisos={permisos} />
        ))}
      </ul>
    );
  }
  return (
    <div className="surface overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Gasto</TableHead>
            <TableHead>Rubro</TableHead>
            <TableHead>Periodo</TableHead>
            <TableHead numeric>Total</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Soporte</TableHead>
            {permisos.esGestor && <TableHead>Acción</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {gastos.map((gasto) => (
            <GastoFila key={gasto.id} proyectoId={proyectoId} gasto={gasto} permisos={permisos} />
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

/**
 * Anular (AJ-08): any expense that counts as executed (REGISTRADO or VALIDADO) can be annulled with a motivo, in
 * any project estado, only for whoever manages projects. RECHAZADO and ANULADO have nothing left to annul.
 */
function AccionesGasto({ proyectoId, gasto, permisos }: FilaProps) {
  const anular = useVoidExpense();
  if (!permisos.esGestor || !cuentaComoEjecutado(gasto.estado)) return null;
  return (
    <VoidControl
      nombre={`gasto ${gasto.numero_documento}`}
      pending={anular.isPending}
      error={anular.isError ? errorMessage(anular.error, "No pudimos anular el gasto. Inténtalo de nuevo.") : null}
      onConfirm={(motivo) => anular.mutate({ projectId: proyectoId, id: gasto.id, motivo })}
    />
  );
}

/** Un botón por soporte, o "Sin soporte"; sin acceso a soportes (RNF-03) no se dice nada. */
function SoporteGasto({
  proyectoId,
  gasto,
  permisos,
  onVer,
}: Pick<FilaProps, "proyectoId" | "gasto" | "permisos"> & { onVer: (soporteId: string) => void }) {
  if (!gasto.soportes) return <span className="text-ink-500">—</span>;
  // S2: el soporte de un gasto importado viene aparte; lo adjunta quien lo registró mientras sea editable.
  const puedeAdjuntar =
    permisos.puedeRegistrar &&
    gasto.registrado_por_id === permisos.usuarioId &&
    (gasto.estado === "REGISTRADO" || gasto.estado === "RECHAZADO") &&
    gasto.soportes.length < MAX_SOPORTES_POR_GASTO;
  return (
    <div className="flex flex-col items-start gap-1">
      {gasto.soportes.length === 0 && <StatusChip dot={false} tone="alerta">Sin soporte</StatusChip>}
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
      {puedeAdjuntar && <AdjuntarSoporte projectId={proyectoId} gastoId={gasto.id} />}
    </div>
  );
}

function EstadoGasto({ gasto }: { gasto: ProjectExpense }) {
  const meta = ESTADO_GASTO_META[gasto.estado];
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip dot={false} tone={meta.tone}>{meta.label}</StatusChip>
        <AvisosGasto gasto={gasto} conCuentaEn={false} />
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

/** AJ-05: the period was edited away from the month of the document date. The change is in the audit ledger. */
function PeriodoModificado({ gasto, className }: { gasto: ProjectExpense; className?: string }) {
  if (!gasto.periodo_modificado) return null;
  return (
    <span title={`Periodo ${gasto.periodo}`} className={`font-sans text-[11.5px] text-ink-600 ${className ?? ""}`}>
      Periodo modificado
    </span>
  );
}

function GastoFila(props: FilaProps) {
  const { proyectoId, gasto, permisos } = props;
  const { error, ver } = useVerSoporte(proyectoId, gasto.id);
  const identificacion = [gasto.tercero_tipo_id, gasto.tercero_numero_id].filter(Boolean).join(" ");
  return (
    <TableRow
      data-testid="gasto-fila"
      data-observado={esObservado(gasto) ? "true" : undefined}
      className={esObservado(gasto) ? "bg-alerta-bg/40" : undefined}
    >
      <TableCell className="min-w-[200px] align-top whitespace-normal">
        <p className="text-[13px] font-semibold text-ink-950">{gasto.tercero_nombre}</p>
        <p className="text-[12px] text-ink-600">
          <span title={formatFechaCalendario(gasto.fecha_documento)}>
            {lineaRegistro(gasto, permisos.nombreDe(gasto.registrado_por_id), fechaCorta(gasto.fecha_documento))}
          </span>
        </p>
        <p className="text-[12px] text-ink-600">
          {[TIPO_SOPORTE_LABELS[gasto.tipo_soporte], identificacion].filter(Boolean).join(" · ")}
        </p>
        <p className="text-[12px] text-ink-700">{gasto.descripcion}</p>
      </TableCell>
      <TableCell className="min-w-[120px] align-top whitespace-normal text-[13px] text-ink-900">
        {nombreRubro(gasto.rubro)}
      </TableCell>
      <TableCell className="align-top font-mono text-[12.5px] text-ink-700">
        <span title="Periodo contable">{gasto.periodo}</span>
        <PeriodoModificado gasto={gasto} className="block" />
      </TableCell>
      <TableCell numeric className="align-top font-mono text-[13px] font-semibold text-ink-900">
        <span>{formatCOP(toCents(gasto.valor))}</span>
        <span className="block text-[11.5px] font-normal text-ink-600">{textoIva(gasto)}</span>
      </TableCell>
      <TableCell className="min-w-[130px] align-top whitespace-normal">
        <EstadoGasto gasto={gasto} />
      </TableCell>
      <TableCell className="align-top whitespace-normal">
        <SoporteGasto proyectoId={proyectoId} gasto={gasto} permisos={permisos} onVer={(id) => void ver(id)} />
        <InlineError message={error} />
      </TableCell>
      {permisos.esGestor && (
        <TableCell className="align-top whitespace-normal">
          <AccionesGasto {...props} />
        </TableCell>
      )}
    </TableRow>
  );
}

function GastoTarjeta(props: FilaProps) {
  const { proyectoId, gasto, permisos } = props;
  const { error, ver } = useVerSoporte(proyectoId, gasto.id);
  const identificacion = [gasto.tercero_tipo_id, gasto.tercero_numero_id].filter(Boolean).join(" ");
  return (
    <li data-testid="gasto-fila" className="surface-inner flex flex-col gap-1.5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <EstadoGasto gasto={gasto} />
        <span className="flex flex-col items-end">
          <span className="font-mono text-[13px] font-semibold text-ink-900 tabular-nums">
            {formatCOP(toCents(gasto.valor))}
          </span>
          <span className="text-[11.5px] text-ink-600">{textoIva(gasto)}</span>
        </span>
      </div>
      <p className="text-[13px] text-ink-900">
        <span className="font-semibold">{nombreRubro(gasto.rubro)}</span>
        {" — "}
        {gasto.descripcion}
      </p>
      <p className="text-[12px] text-ink-600">
        {[
          gasto.tercero_nombre,
          identificacion,
          `${TIPO_SOPORTE_LABELS[gasto.tipo_soporte]} ${gasto.numero_documento}`,
          formatFechaCalendario(gasto.fecha_documento),
          `Periodo ${gasto.periodo}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <PeriodoModificado gasto={gasto} />
      <SoporteGasto proyectoId={proyectoId} gasto={gasto} permisos={permisos} onVer={(id) => void ver(id)} />
      <InlineError message={error} />
      <AccionesGasto {...props} />
    </li>
  );
}
