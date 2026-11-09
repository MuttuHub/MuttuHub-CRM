// Tarjeta de una actividad en la Lista de Actividades (redesign T2, Actividades-propuesta e
// Interacciones-Actividades tablas 2-4). One main action per card: «Registrar avance» while the activity
// takes reports, «Solicitar modificación» once it is finished. Header: código, nombre, semáforo in words,
// estado («Vencida el …» when its last day passed unfinished) and responsable · días. Then the progress
// line (against the tope when overdue, against the plan otherwise), the entregables (folded unless the
// activity is overdue) and the historial de avances. A finished activity at 100 % shows as one compact
// row until «Ver historial». The «Registrar avance» form opens inline (a bottom sheet on phones).

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { HelpHint } from "@/components/ui/help-hint";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusChip } from "@/components/ui/status-chip";
import { CaptureSurface } from "@/components/proyectos/capture-surface";
import { ReporteActividadForm, SOPORTE_FALLIDO_TEXT } from "@/components/proyectos/reporte-actividad-form";
import { plural } from "@/components/proyectos/estructura-ui";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { EntregablesActividad, entregableCompleto } from "@/components/proyectos/ficha/actividades/entregables-actividad";
import { HistorialAvances } from "@/components/proyectos/ficha/actividades/historial-avances";
import {
  AYUDA_PROGRAMADO,
  ENLACE_ACCION,
  ayudaTope,
  esFinalizada,
  fechaCorta,
  formatNumero,
  ultimoVigente,
} from "@/components/proyectos/ficha/actividades/formato";
import {
  useActivityReports,
  type ProjectActivity,
  type ProjectDeliverable,
  type ProjectDeliverableProgress,
  type ProjectTechnicalActivity,
  type ProjectTechnicalActivityV6,
} from "@/hooks/projects";
import { vencidaSinTerminar } from "@/lib/proyectos/estado-actividad";
import { todayInBogota } from "@/lib/proyectos/weeks";
import { cn } from "@/lib/utils";

/** Replaces «Registrar avance» once the activity is finished: it takes no more reports. */
export const ACTIVIDAD_FINALIZADA_TEXT =
  "Ya no recibe avances. Para corregir, anula el último avance o solicita una modificación.";

/** `tope_en_curso` default when the technical status does not say (90 %, still to be confirmed). */
export const TOPE_POR_DEFECTO = 90;

/**
 * Highest % an activity's reports may reach: 100 once all its deliverables are counted in full, else the
 * project's `tope_en_curso`. Shared by the activity card and the header's «Registrar avance» dialog.
 */
export function topeDeActividad(
  entregables: ProjectDeliverable[],
  progreso: Map<string, ProjectDeliverableProgress>,
  tope: number = TOPE_POR_DEFECTO,
): number {
  const completos =
    entregables.length > 0 &&
    entregables.every((entregable) => entregableCompleto(entregable, progreso.get(entregable.id)?.avances ?? []));
  return completos ? 100 : tope;
}

/** The v6 enrichment (plan, days, support, colour) is optional: callers that only have the base row keep working. */
type TecnicoFila = ProjectTechnicalActivity &
  Partial<Pick<ProjectTechnicalActivityV6, "programado" | "dias" | "al_corte" | "color" | "sin_soporte">>;

export function EjecucionAvance({
  proyectoId,
  actividad,
  tecnico,
  entregables,
  progreso,
  canWrite,
  canVoid,
  enfocar = false,
  tope = TOPE_POR_DEFECTO,
  corte,
  responsable = null,
  onSolicitarModificacion,
}: {
  proyectoId: string;
  actividad: ProjectActivity;
  tecnico: TecnicoFila;
  entregables: ProjectDeliverable[];
  progreso: Map<string, ProjectDeliverableProgress>;
  canWrite: boolean;
  canVoid: boolean;
  /**
   * Scroll to this card and move the keyboard focus to it (the Tablero card or the header's «Registrar avance»).
   * A new number asks again, so a repeated click still lands here. A compact card opens.
   */
  enfocar?: boolean | number;
  /** `tope_en_curso` (%): the highest progress reports reach while the deliverables are incomplete. */
  tope?: number;
  /** The server's «today» (`YYYY-MM-DD`); Bogotá's today when absent. */
  corte?: string;
  /** Name of the activity's responsable, when known. */
  responsable?: string | null;
  /** «Solicitar modificación» on a finished activity; only passed when the person may ask for one. */
  onSolicitarModificacion?: () => void;
}) {
  const finalizada = esFinalizada(tecnico.estado);
  const hoy = (corte ?? todayInBogota()).slice(0, 10);
  const fin = actividad.fecha_fin?.slice(0, 10) ?? null;
  const vencida = fin !== null && vencidaSinTerminar({ fin, corte: hoy, terminada: finalizada });

  const reportesQuery = useActivityReports(proyectoId, actividad.id);
  const reportes = reportesQuery.data?.reportes ?? [];
  const ultimo = ultimoVigente(reportes);

  const topeVigente = topeDeActividad(entregables, progreso, tope);

  const [abierta, setAbierta] = useState(!(finalizada && tecnico.progreso >= 100));
  const [verEntregables, setVerEntregables] = useState(vencida);
  const [registrando, setRegistrando] = useState(false);
  const [nuevos, setNuevos] = useState<ReadonlySet<string>>(new Set());
  const [aviso, setAviso] = useState("");
  const entregablesId = useId();

  // A focus request opens a compact card (render-time, once per request).
  const [enfoqueVisto, setEnfoqueVisto] = useState<boolean | number>(false);
  if (enfocar && enfocar !== enfoqueVisto) {
    setEnfoqueVisto(enfocar);
    if (!abierta) setAbierta(true);
  }

  const fila = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!enfocar) return;
    fila.current?.scrollIntoView?.({ block: "center" });
    fila.current?.focus({ preventScroll: true });
  }, [enfocar]);

  // Closing the form gives the focus back to «Registrar avance» (the button mounts again).
  const devolverFoco = useRef(false);
  const botonAvanceRef = (boton: HTMLButtonElement | null) => {
    if (boton && devolverFoco.current) {
      devolverFoco.current = false;
      boton.focus();
    }
  };
  // Opening or folding a finished card keeps the focus on its toggle (the other one mounts in its place).
  const focoAlternar = useRef(false);
  const alternarRef = (boton: HTMLButtonElement | null) => {
    if (boton && focoAlternar.current) {
      focoAlternar.current = false;
      boton.focus();
    }
  };
  function alternarHistorial(valor: boolean) {
    focoAlternar.current = true;
    setAbierta(valor);
  }
  function cerrarFormulario() {
    devolverFoco.current = true;
    setRegistrando(false);
  }

  const puedeAvance = canWrite && !finalizada;

  if (finalizada && !abierta) {
    return (
      <li
        ref={fila}
        id={`actividad-${actividad.id}`}
        tabIndex={-1}
        data-testid="ejecucion-actividad"
        className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-inner border border-border bg-muted/60 px-3.5 py-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-[18px]"
      >
        <span className="font-mono text-[12px] text-ink-500">{actividad.codigo}</span>
        <h3 className="min-w-0 text-[15px] font-semibold break-words text-ink-900">{actividad.nombre}</h3>
        <EstadoChip estado={tecnico.estado} />
        <button
          ref={alternarRef}
          type="button"
          aria-expanded={false}
          className={cn(ENLACE_ACCION, "ml-auto")}
          onClick={() => alternarHistorial(true)}
        >
          Ver historial
        </button>
      </li>
    );
  }

  const plazo =
    tecnico.dias === undefined
      ? null
      : tecnico.estado === "EN_CURSO" && !vencida && tecnico.al_corte !== undefined && tecnico.al_corte > 0
        ? `${plural(tecnico.dias, "día", "días")}, día ${tecnico.al_corte}`
        : plural(tecnico.dias, "día", "días");
  const detalle = [responsable ? `Responsable: ${responsable}` : null, plazo].filter(Boolean).join(" · ");

  const accionPrincipal = puedeAvance ? (
    registrando ? null : (
      <Button
        ref={botonAvanceRef}
        type="button"
        aria-label={`Registrar avance ${actividad.codigo}`}
        className="w-full px-4 sm:w-auto"
        onClick={() => {
          setAviso("");
          setRegistrando(true);
        }}
      >
        Registrar avance
      </Button>
    )
  ) : finalizada && onSolicitarModificacion ? (
    <Button type="button" variant="outline" className="w-full px-4 sm:w-auto" onClick={onSolicitarModificacion}>
      Solicitar modificación
    </Button>
  ) : null;

  return (
    <li
      ref={fila}
      id={`actividad-${actividad.id}`}
      tabIndex={-1}
      data-testid="ejecucion-actividad"
      className={cn(
        "grid min-w-0 grid-cols-1 gap-3 rounded-inner border border-border p-3.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-4 sm:p-[18px]",
        finalizada ? "bg-muted/60" : "bg-panel",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-mono text-[12px] text-ink-500">{actividad.codigo}</span>
          <h3 className="min-w-0 text-[16px] leading-snug font-semibold break-words text-ink-900">{actividad.nombre}</h3>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-600">
          {!finalizada && tecnico.color && <SemaforoChip color={tecnico.color} />}
          {vencida && fin ? (
            <StatusChip dot={false} tone="destructivo">Vencida el {fechaCorta(fin)}</StatusChip>
          ) : (
            <EstadoChip estado={tecnico.estado} />
          )}
          {finalizada
            ? canWrite && <span className="min-w-0">{ACTIVIDAD_FINALIZADA_TEXT}</span>
            : detalle && <span className="min-w-0 break-words">{detalle}</span>}
        </div>
      </div>

      <div className="order-last flex min-w-0 flex-col gap-2 sm:order-none sm:items-end">
        {accionPrincipal}
        {finalizada && (
          <button
            ref={alternarRef}
            type="button"
            aria-expanded
            className={ENLACE_ACCION}
            onClick={() => alternarHistorial(false)}
          >
            Ocultar historial
          </button>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-3 sm:col-span-2">
        {!finalizada && (
          <BarraAvance
            codigo={actividad.codigo}
            progreso={tecnico.progreso}
            color={tecnico.color}
            programado={vencida ? undefined : tecnico.programado}
            tope={vencida && topeVigente < 100 ? topeVigente : undefined}
          />
        )}

        {registrando && puedeAvance && (
          <CaptureSurface
            title={`Registrar avance ${actividad.codigo} · ${actividad.nombre}`}
            onClose={cerrarFormulario}
          >
            <ReporteActividadForm
              projectId={proyectoId}
              actividad={actividad}
              actual={tecnico.progreso}
              tope={topeVigente}
              ultimo={ultimo ? Number(ultimo.porcentaje) : null}
              onDone={cerrarFormulario}
              onSaved={({ reporteId, porcentaje, soporteFallido }) => {
                setNuevos((actuales) => new Set(actuales).add(reporteId));
                setAviso(
                  `Avance registrado: la ${actividad.codigo} queda en ${formatNumero(porcentaje)} %.` +
                    (soporteFallido ? ` ${SOPORTE_FALLIDO_TEXT}` : ""),
                );
              }}
            />
          </CaptureSurface>
        )}
        <p role="status" className={aviso ? "text-[13px] font-medium text-exito" : "sr-only"}>
          {aviso}
        </p>

        {entregables.length > 0 && (
          <div className="flex min-w-0 flex-col gap-2">
            <button
              type="button"
              aria-expanded={verEntregables}
              aria-controls={entregablesId}
              className={cn(ENLACE_ACCION, "self-start")}
              onClick={() => setVerEntregables((value) => !value)}
            >
              {verEntregables
                ? "Ocultar entregables"
                : `Ver ${plural(entregables.length, "entregable", "entregables")}`}
            </button>
            {verEntregables && (
              <div id={entregablesId} className="min-w-0">
                <EntregablesActividad
                  proyectoId={proyectoId}
                  entregables={entregables}
                  progreso={progreso}
                  canWrite={canWrite}
                  canVoid={canVoid}
                  puedeRegistrarCantidad={!finalizada}
                />
              </div>
            )}
          </div>
        )}

        <HistorialAvances
          proyectoId={proyectoId}
          actividad={actividad}
          reportes={reportes}
          error={reportesQuery.error}
          canWrite={canWrite}
          nuevos={nuevos}
        />
      </div>
    </li>
  );
}

function EstadoChip({ estado }: { estado: ProjectTechnicalActivity["estado"] }) {
  if (estado === "FINALIZADA") return <StatusChip dot={false} tone="exito">Finalizada</StatusChip>;
  if (estado === "FINALIZADA_CON_RETRASO") return <StatusChip dot={false} tone="alerta">Finalizada con retraso</StatusChip>;
  return <span>{estado === "EN_CURSO" ? "En curso" : "No iniciada"}</span>;
}

/**
 * «50 % registrado · tope 90 %» (overdue, deliverables incomplete) or «0 % registrado · debería ir en 67,9 %»
 * (plan known). The fill is the server's semáforo; the mark is the tope or the plan.
 */
function BarraAvance({
  codigo,
  progreso,
  color,
  programado,
  tope,
}: {
  codigo: string;
  progreso: number;
  color: TecnicoFila["color"];
  programado: number | undefined;
  tope: number | undefined;
}) {
  const marca = tope ?? programado;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1">
      <div className="relative min-w-32 flex-1">
        <ProgressBar
          data-testid="ejecucion-progreso"
          aria-label={`Avance de la actividad ${codigo}`}
          value={progreso}
          band={color}
          className="h-2.5"
        />
        {marca !== undefined && (
          <span
            aria-hidden="true"
            className="absolute -top-1 h-[18px] w-0.5 bg-ink-900"
            style={{ left: `${Math.min(100, Math.max(0, marca))}%` }}
          />
        )}
      </div>
      <span className="flex items-center gap-1.5 text-[13px] text-ink-700">
        <span>
          <span className="font-semibold text-ink-900 tabular-nums">{formatNumero(progreso)} %</span> registrado
          {tope !== undefined
            ? ` · tope ${formatNumero(tope)} %`
            : programado !== undefined && ` · debería ir en ${formatNumero(programado)} %`}
        </span>
        {tope !== undefined ? (
          <HelpHint label="Tope del avance" className="after:-inset-3">
            {ayudaTope(tope)}
          </HelpHint>
        ) : (
          programado !== undefined && (
            <HelpHint label="Real y programado" className="after:-inset-3">
              {AYUDA_PROGRAMADO}
            </HelpHint>
          )
        )}
      </span>
    </div>
  );
}
