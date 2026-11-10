// Entregables de una actividad (redesign T2, Interacciones-Actividades tabla 2): one table, Entregable ·
// Meta · Contado · Falta · Soportes, that turns into one block per entregable below `sm` (same DOM, so no
// control is ever duplicated). «N archivos» opens the quantities registered for that entregable with their
// soportes, «Anular» (managers) and «Adjuntar archivo»: the proposal does not draw them, so they live here.

"use client";

import { useId, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpHint } from "@/components/ui/help-hint";
import { StatusChip } from "@/components/ui/status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { CaptureSurface } from "@/components/proyectos/capture-surface";
import { EjecucionAvanceForm } from "@/components/proyectos/ejecucion-avance-form";
import { AdjuntarArchivoControl, type AdjuntarArchivoMutation } from "@/components/proyectos/adjuntar-soporte";
import { SIN_SOPORTE_TEXT } from "@/components/proyectos/gasto-form";
import { VoidControl, errorMessage, plural } from "@/components/proyectos/estructura-ui";
import { InlineError } from "@/components/proyectos/ui";
import {
  useAttachAvanceMedio,
  useDeliverableProgressState,
  useVoidAvance,
  type ProjectAvance,
  type ProjectDeliverable,
  type ProjectDeliverableProgress,
} from "@/hooks/projects";
import { cn } from "@/lib/utils";
import { AYUDA_ENTREGABLES, ENLACE_ACCION, formatNumero } from "./formato";

const ADJUNTAR_MEDIO_ERROR = "No pudimos adjuntar el medio. Inténtalo de nuevo.";

/** Counted quantity of one entregable: the live quantities the API says count (with soporte when required). */
function contadoDe(avances: ProjectAvance[]): number {
  return avances.filter((avance) => avance.cuenta).reduce((sum, avance) => sum + Number(avance.cantidad), 0);
}

export function entregableCompleto(entregable: ProjectDeliverable, avances: ProjectAvance[]): boolean {
  return contadoDe(avances) >= Number(entregable.cantidad_meta);
}

/** On phones every cell becomes a labelled line; from `sm` it is a normal table cell. */
const CELDA = "flex items-baseline justify-between gap-3 px-0 py-0.5 whitespace-normal sm:table-cell sm:px-2 sm:py-2";
const ETIQUETA_MOVIL = "text-[12.5px] text-ink-600 sm:hidden";

export function EntregablesActividad({
  proyectoId,
  entregables,
  progreso,
  canWrite,
  canVoid,
  puedeRegistrarCantidad,
}: {
  proyectoId: string;
  entregables: ProjectDeliverable[];
  progreso: Map<string, ProjectDeliverableProgress>;
  canWrite: boolean;
  canVoid: boolean;
  /** «Registrar cantidad» is gone once the activity is finished (the proposal hides it). */
  puedeRegistrarCantidad: boolean;
}) {
  // A missing entry means the progress has not arrived (still loading, or failed): never read it as zero.
  // A failed read says so in its row, with «Reintentar».
  const todosCargados = entregables.every((entregable) => progreso.has(entregable.id));
  const completos = entregables.filter((entregable) =>
    entregableCompleto(entregable, progreso.get(entregable.id)?.avances ?? []),
  ).length;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
          {todosCargados ? `Entregables · ${completos} de ${entregables.length} completos` : "Entregables"}
        </p>
        <HelpHint label="Entregables" className="after:-inset-3">
          {AYUDA_ENTREGABLES}
        </HelpHint>
      </div>
      <div className="min-w-0 overflow-hidden rounded-12 border border-border">
        <Table className="block sm:table">
          <TableHeader className="hidden bg-muted sm:table-header-group">
            <TableRow className="hover:bg-transparent">
              <TableHead>Entregable</TableHead>
              <TableHead numeric>Meta</TableHead>
              <TableHead numeric>Contado</TableHead>
              <TableHead numeric>Falta</TableHead>
              <TableHead>Soportes</TableHead>
              <TableHead>
                <span className="sr-only">Acción</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="block sm:table-row-group">
            {entregables.map((entregable) => (
              <EntregableRow
                key={entregable.id}
                proyectoId={proyectoId}
                entregable={entregable}
                avances={progreso.get(entregable.id)?.avances}
                canWrite={canWrite}
                canVoid={canVoid}
                puedeRegistrarCantidad={puedeRegistrarCantidad}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EntregableRow({
  proyectoId,
  entregable,
  avances: avancesCargados,
  canWrite,
  canVoid,
  puedeRegistrarCantidad,
}: {
  proyectoId: string;
  entregable: ProjectDeliverable;
  /** Undefined until the entregable's progress arrives: its cells show «—», not zeros. */
  avances: ProjectAvance[] | undefined;
  canWrite: boolean;
  canVoid: boolean;
  puedeRegistrarCantidad: boolean;
}) {
  const remove = useVoidAvance(proyectoId, entregable.id);
  const lectura = useDeliverableProgressState(proyectoId, entregable.id);
  const [registrando, setRegistrando] = useState(false);
  const [verCantidades, setVerCantidades] = useState(false);
  const panelId = useId();

  const cargado = avancesCargados !== undefined;
  const avances = avancesCargados ?? [];
  const meta = Number(entregable.cantidad_meta);
  const contado = contadoDe(avances);
  const falta = Math.max(0, meta - contado);
  const pendientes = avances.filter((avance) => avance.anulado_at === null && !avance.cuenta).length;
  const archivos = avances
    .filter((avance) => avance.anulado_at === null)
    .reduce((sum, avance) => sum + avance.medios, 0);
  const metaTexto = Number.isFinite(meta) ? formatNumero(meta) : entregable.cantidad_meta;

  return (
    <>
      <TableRow
        data-testid="ejecucion-entregable"
        className="flex h-auto flex-col gap-1 border-b px-3 py-2.5 hover:bg-transparent sm:table-row sm:h-11 sm:px-0 sm:py-0"
      >
        <TableCell className="block px-0 py-0 text-[13.5px] whitespace-normal text-ink-900 sm:table-cell sm:px-2 sm:py-2">
          <span className="font-mono text-[12px] text-ink-500">{entregable.codigo}</span>{" "}
          <span className="font-semibold sm:font-normal">{entregable.descripcion}</span>
        </TableCell>
        <TableCell numeric className={CELDA}>
          <span className={ETIQUETA_MOVIL}>Meta</span>
          <span>
            {metaTexto} {entregable.unidad}
          </span>
        </TableCell>
        <TableCell numeric className={CELDA}>
          <span className={ETIQUETA_MOVIL}>Contado</span>
          {cargado ? (
            <span className="flex flex-col items-end">
              <span>{formatNumero(contado)}</span>
              {contado > meta && (
                <span className="text-[11.5px] text-ink-600">+{formatNumero(contado - meta)} sobre la meta</span>
              )}
              {pendientes > 0 && (
                <span
                  data-testid="ejecucion-pendiente-soporte"
                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-alerta"
                >
                  <AlertTriangle className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                  {plural(pendientes, "pendiente", "pendientes")} de soporte
                </span>
              )}
            </span>
          ) : (
            <SinDato />
          )}
        </TableCell>
        <TableCell numeric className={CELDA}>
          <span className={ETIQUETA_MOVIL}>Falta</span>
          {cargado ? <span className="font-semibold text-ink-900">{formatNumero(falta)}</span> : <SinDato />}
        </TableCell>
        <TableCell className={cn(CELDA, "justify-start")}>
          {cargado ? (
            <button
              type="button"
              aria-expanded={verCantidades}
              aria-controls={panelId}
              className={ENLACE_ACCION}
              onClick={() => setVerCantidades((value) => !value)}
            >
              {plural(archivos, "archivo", "archivos")}
            </button>
          ) : lectura.isError ? (
            <span className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-ink-700">
              No se pudo cargar.
              <button
                type="button"
                className={ENLACE_ACCION}
                disabled={lectura.isFetching}
                onClick={() => void lectura.refetch()}
              >
                Reintentar
              </button>
            </span>
          ) : (
            <SinDato />
          )}
        </TableCell>
        <TableCell className="block px-0 py-0 sm:table-cell sm:px-2 sm:py-2 sm:text-right">
          {canWrite && puedeRegistrarCantidad && cargado && !registrando && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Registrar cantidad ${entregable.codigo}`}
              className="h-11 w-full sm:h-10 sm:w-auto"
              onClick={() => setRegistrando(true)}
            >
              Registrar cantidad
            </Button>
          )}
        </TableCell>
      </TableRow>

      {canWrite && puedeRegistrarCantidad && registrando && (
        <TableRow className="block h-auto border-b hover:bg-transparent sm:table-row">
          <TableCell colSpan={6} className="block px-3 py-2 whitespace-normal sm:table-cell">
            <CaptureSurface title={`Registrar cantidad ${entregable.codigo}`} onClose={() => setRegistrando(false)}>
              <EjecucionAvanceForm
                projectId={proyectoId}
                entregable={entregable}
                meta={entregable.cantidad_meta}
                avances={avances}
                onDone={() => setRegistrando(false)}
              />
            </CaptureSurface>
          </TableCell>
        </TableRow>
      )}

      {verCantidades && (
        <TableRow id={panelId} className="block h-auto border-b bg-muted/40 hover:bg-muted/40 sm:table-row">
          <TableCell colSpan={6} className="block px-3 py-2 whitespace-normal sm:table-cell">
            <p className="mb-1 text-[12.5px] font-semibold text-ink-700">Cantidades registradas</p>
            {avances.length === 0 ? (
              <p className="text-[12.5px] text-ink-600">Este entregable aún no tiene cantidades registradas.</p>
            ) : (
              <ul data-testid="ejecucion-avances" className="flex flex-col gap-1">
                {avances.map((avance) => (
                  <AvanceRow
                    key={avance.id}
                    proyectoId={proyectoId}
                    deliverableId={entregable.id}
                    avance={avance}
                    unidad={entregable.unidad}
                    canVoid={canVoid}
                    canWrite={canWrite}
                    deleting={remove.isPending && remove.variables?.id === avance.id}
                    error={
                      remove.isError && remove.variables?.id === avance.id
                        ? errorMessage(remove.error, "No pudimos anular el avance.")
                        : null
                    }
                    onVoid={(motivo) => remove.mutate({ id: avance.id, motivo })}
                  />
                ))}
              </ul>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/** Placeholder for a figure whose data has not arrived: «—» on screen, a plain phrase for screen readers. */
function SinDato() {
  return (
    <span className="text-ink-500">
      <span aria-hidden="true">—</span>
      <span className="sr-only">Sin datos todavía</span>
    </span>
  );
}

function AvanceRow({
  proyectoId,
  deliverableId,
  avance,
  unidad,
  canVoid,
  canWrite,
  deleting,
  error,
  onVoid,
}: {
  proyectoId: string;
  deliverableId: string;
  avance: ProjectAvance;
  unidad: string;
  canVoid: boolean;
  canWrite: boolean;
  deleting: boolean;
  error: string | null;
  onVoid: (motivo: string) => void;
}) {
  const anulado = avance.anulado_at !== null;
  const badge = anulado
    ? { tone: "neutro" as const, label: "Anulado" }
    : avance.cuenta
      ? { tone: "exito" as const, label: "Cuenta" }
      : { tone: "alerta" as const, label: "Pendiente de soporte" };

  const adjuntarMedio = useAttachAvanceMedio(proyectoId, deliverableId);
  const adjuntar: AdjuntarArchivoMutation = {
    mutate: (variables, options) => adjuntarMedio.mutate({ avanceId: avance.id, soporte: variables.soporte }, options),
    isPending: adjuntarMedio.isPending,
    isError: adjuntarMedio.isError,
    error: adjuntarMedio.error,
    reset: () => adjuntarMedio.reset(),
  };
  const soportes = avance.soportes ?? [];

  return (
    <li data-testid="ejecucion-avance" className="flex min-w-0 flex-col gap-1 rounded-[8px] bg-panel px-2.5 py-1.5 text-[12.5px]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-ink-700">
          {formatFechaCalendario(avance.fecha)} ·{" "}
          <span className={anulado ? "text-ink-500" : "font-semibold text-ink-900"}>
            {formatNumero(Number(avance.cantidad))} {unidad}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <StatusChip dot={false} tone={badge.tone}>{badge.label}</StatusChip>
          {canVoid && !anulado && (
            <VoidControl
              nombre={`avance ${formatFechaCalendario(avance.fecha)}`}
              pending={deleting}
              error={null}
              onConfirm={onVoid}
            />
          )}
        </span>
      </div>
      {error && <InlineError message={error} />}
      {anulado && avance.motivo_anulacion && <p className="text-ink-600">Motivo: {avance.motivo_anulacion}</p>}

      {soportes.length > 0 && (
        <ul data-testid="ejecucion-avance-soportes" className="flex flex-col gap-0.5 text-[12px] text-ink-700">
          {soportes.map((soporte) => (
            <li key={soporte.id} className="min-w-0 break-words">
              {soporte.tipo === "enlace" && soporte.url_externa ? (
                <a href={soporte.url_externa} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                  {soporte.nombre}
                </a>
              ) : (
                soporte.nombre
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite && !anulado && (
        <AdjuntarArchivoControl adjuntar={adjuntar} errorFallback={ADJUNTAR_MEDIO_ERROR} sinSoporteText={SIN_SOPORTE_TEXT} />
      )}
    </li>
  );
}
