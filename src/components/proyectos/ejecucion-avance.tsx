// Progreso de una actividad dentro de "Ejecución técnica" (S4 U6/U7): barra de
// avance, insignia de estado y, por cada entregable, meta, cantidad contada, el
// contador de avances "pendiente de soporte", su historial de avances, el
// control de anulación (solo gestores) y el alta de un avance.

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ToneBadge } from "@/components/crm/shared";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { CaptureSurface } from "@/components/proyectos/capture-surface";
import { EjecucionAvanceForm } from "@/components/proyectos/ejecucion-avance-form";
import { AdjuntarArchivoControl, type AdjuntarArchivoMutation } from "@/components/proyectos/adjuntar-soporte";
import { SIN_SOPORTE_TEXT } from "@/components/proyectos/gasto-form";
import { ReporteActividadForm } from "@/components/proyectos/reporte-actividad-form";
import { VoidControl, errorMessage, plural } from "@/components/proyectos/estructura-ui";
import { CAPTURE_BUTTON, CAPTURE_CHOICE, CAPTURE_FIELD, InlineError } from "@/components/proyectos/ui";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import {
  useAttachAvanceMedio,
  useActivityReports,
  useAttachActivityReportMedio,
  useVoidActivityReport,
  useVoidAvance,
  type AvanceMedioInput,
  type EstadoActividad,
  type ProjectActivity,
  type ProjectActivityReport,
  type ProjectAvance,
  type ProjectDeliverable,
  type ProjectDeliverableProgress,
  type ProjectTechnicalActivity,
  type ProjectTechnicalActivityV6,
} from "@/hooks/projects";
import type { UiTone } from "@/lib/catalogs";

/** Mensaje de respaldo cuando `useAttachAvanceMedio` falla sin `Error.message` propio. */
const ADJUNTAR_MEDIO_ERROR = "No pudimos adjuntar el medio. Inténtalo de nuevo.";
/** Texto visible del botón "Adjuntar archivo" por reporte (mismo texto que AJ-06). */
const ADJUNTAR_ARCHIVO_LABEL = "Adjuntar archivo";

const ESTADO_META: Record<EstadoActividad, { tone: UiTone; label: string }> = {
  FINALIZADA: { tone: "exito", label: "Finalizada" },
  FINALIZADA_CON_RETRASO: { tone: "alerta", label: "Finalizada con retraso" },
  EN_CURSO: { tone: "info", label: "En curso" },
  NO_INICIADA: { tone: "neutro", label: "No iniciada" },
};

function formatNumero(value: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(value);
}

function formatMeta(meta: string): string {
  const n = Number(meta);
  return Number.isFinite(n) ? formatNumero(n) : meta;
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
  esResponsable = false,
  nombreUsuario = (id: string) => id,
  enfocar = false,
}: {
  proyectoId: string;
  actividad: ProjectActivity;
  tecnico: TecnicoFila;
  entregables: ProjectDeliverable[];
  progreso: Map<string, ProjectDeliverableProgress>;
  canWrite: boolean;
  canVoid: boolean;
  /** S9.5: solo el responsable de la actividad (o un override ADMINISTRADOR/GERENCIA) registra/anula sus avances. */
  esResponsable?: boolean;
  /** Resuelve un `registrado_por_id` a un nombre visible en el historial (S2: "...fecha, porcentaje, observación, usuario"). */
  nombreUsuario?: (id: string) => string;
  /** Scroll to this row and move the keyboard focus to it (the Tablero sends the user here). */
  enfocar?: boolean;
}) {
  const estado = ESTADO_META[tecnico.estado];
  const fila = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!enfocar) return;
    fila.current?.scrollIntoView?.({ block: "center" });
    fila.current?.focus({ preventScroll: true });
  }, [enfocar]);

  return (
    <li
      ref={fila}
      id={`actividad-${actividad.id}`}
      tabIndex={-1}
      data-testid="ejecucion-actividad"
      className="rounded-inner border border-border bg-panel p-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] text-ink-900">
          <span className="font-mono text-[11px] text-ink-500 tabular-nums">{actividad.codigo}</span>{" "}
          <span className="font-semibold">{actividad.nombre}</span>
        </p>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {tecnico.color && <SemaforoChip color={tecnico.color} />}
          <ToneBadge tone={estado.tone} label={estado.label} />
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <ProgressBar
          data-testid="ejecucion-progreso"
          aria-label={`Avance de la actividad ${actividad.codigo}`}
          value={tecnico.progreso}
        />
        <span className="shrink-0 text-[12px] text-ink-600 tabular-nums">
          {tecnico.programado === undefined
            ? `${formatNumero(tecnico.progreso)} %`
            : `${formatNumero(tecnico.progreso)} % real · ${formatNumero(tecnico.programado)} % plan`}
        </span>
      </div>
      {tecnico.dias !== undefined && (
        <p className="mt-1 text-[12px] text-ink-600">
          {plural(tecnico.dias, "día", "días")}
          {tecnico.al_corte !== undefined && ` · ${tecnico.al_corte} al corte`}
          {tecnico.sin_soporte !== undefined && ` · ${tecnico.sin_soporte ? "Sin soporte" : "Con soporte"}`}
        </p>
      )}

      <ActividadReportes
        proyectoId={proyectoId}
        actividad={actividad}
        canWrite={canWrite && esResponsable}
        nombreUsuario={nombreUsuario}
      />

      {entregables.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {entregables.map((entregable) => (
            <EntregableRow
              key={entregable.id}
              proyectoId={proyectoId}
              entregable={entregable}
              avances={progreso.get(entregable.id)?.avances ?? []}
              canWrite={canWrite}
              canVoid={canVoid}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * AJ-01 (S2/S3): historial de reportes de avance de la ACTIVIDAD (no confundir con los avances
 * por entregable de `EntregableRow`/`AvanceRow`, un nivel más abajo). `canWrite` ya trae
 * fusionado el gate de escritura general Y el de responsable (S9.5): el padre decide si se
 * muestra la acción, esta función solo dibuja.
 */
function ActividadReportes({
  proyectoId,
  actividad,
  canWrite,
  nombreUsuario,
}: {
  proyectoId: string;
  actividad: ProjectActivity;
  canWrite: boolean;
  nombreUsuario: (id: string) => string;
}) {
  const query = useActivityReports(proyectoId, actividad.id);
  const remove = useVoidActivityReport(proyectoId, actividad.id);
  const [abierto, setAbierto] = useState(false);

  const reportes = query.data?.reportes ?? [];
  const ultimoIndex = reportes.length - 1;

  return (
    <div className="mt-2">
      {query.isError ? (
        <InlineError message={errorMessage(query.error, "No pudimos cargar los avances. Inténtalo de nuevo.")} />
      ) : reportes.length > 0 ? (
        <ul data-testid="ejecucion-reportes" className="flex flex-col gap-1.5">
          {reportes.map((reporte, index) => (
            <ReporteRow
              key={reporte.id}
              proyectoId={proyectoId}
              actividad={actividad}
              reporte={reporte}
              nombreUsuario={nombreUsuario}
              canWrite={canWrite}
              esUltimo={index === ultimoIndex}
              deleting={remove.isPending && remove.variables?.id === reporte.id}
              error={
                remove.isError && remove.variables?.id === reporte.id
                  ? errorMessage(remove.error, "No pudimos anular el reporte.")
                  : null
              }
              onVoid={(motivo) => remove.mutate({ id: reporte.id, motivo })}
            />
          ))}
        </ul>
      ) : null}

      {canWrite &&
        (abierto ? (
          <CaptureSurface title="Registrar avance" onClose={() => setAbierto(false)}>
            <ReporteActividadForm
              projectId={proyectoId}
              actividad={actividad}
              onDone={() => setAbierto(false)}
            />
          </CaptureSurface>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Registrar avance ${actividad.codigo}`}
            className="mt-1.5"
            onClick={() => setAbierto(true)}
          >
            Registrar avance
          </Button>
        ))}
    </div>
  );
}

function ReporteRow({
  proyectoId,
  actividad,
  reporte,
  nombreUsuario,
  canWrite,
  esUltimo,
  deleting,
  error,
  onVoid,
}: {
  proyectoId: string;
  actividad: ProjectActivity;
  reporte: ProjectActivityReport;
  nombreUsuario: (id: string) => string;
  canWrite: boolean;
  esUltimo: boolean;
  deleting: boolean;
  error: string | null;
  onVoid: (motivo: string) => void;
}) {
  const anulado = reporte.anulado_at !== null;

  return (
    <li
      data-testid="ejecucion-reporte"
      className="rounded-[10px] bg-ink-100 px-2.5 py-1.5 text-[12.5px]"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-ink-700">
          <span className="font-mono text-[11px] text-ink-500 tabular-nums">
            {formatFechaCalendario(reporte.fecha)}
          </span>{" "}
          <span className={anulado ? "text-ink-500 line-through" : "font-semibold text-ink-900"}>
            {formatNumero(Number(reporte.porcentaje))} %
          </span>{" "}
          <span className="text-ink-600">· {nombreUsuario(reporte.registrado_por_id)}</span>
        </span>
        <span className="flex items-center gap-2">
          {anulado && <ToneBadge tone="neutro" label="Anulado" />}
          {error && <InlineError message={error} />}
          {canWrite && esUltimo && !anulado && (
            <VoidControl
              nombre={`avance del ${formatFechaCalendario(reporte.fecha)}`}
              pending={deleting}
              error={null}
              onConfirm={onVoid}
            />
          )}
        </span>
      </div>
      <p className={anulado ? "mt-1 text-ink-500 line-through" : "mt-1 text-ink-700"}>{reporte.observacion}</p>
      {canWrite && (
        <AdjuntarMedioReporte proyectoId={proyectoId} actividadId={actividad.id} reportId={reporte.id} />
      )}
    </li>
  );
}

/**
 * Adjuntar-después (S11). Deliberadamente autocontenido (nació cuando `AdjuntarArchivoControl`
 * (AJ-06, PR #108) aún no estaba fusionado): mismo flujo archivo/enlace. Unificarlo con el
 * control genérico ahora disponible es un follow-up, no parte de AJ-01.
 */
function AdjuntarMedioReporte({
  proyectoId,
  actividadId,
  reportId,
}: {
  proyectoId: string;
  actividadId: string;
  reportId: string;
}) {
  const adjuntar = useAttachActivityReportMedio(proyectoId, actividadId);
  const prefijo = useId();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<"archivo" | "enlace">("archivo");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [nombre, setNombre] = useState("");
  const [local, setLocal] = useState<string | null>(null);

  function cerrar() {
    setAbierto(false);
    setArchivo(null);
    setUrl("");
    setNombre("");
    setLocal(null);
    adjuntar.reset();
  }

  function enviar() {
    let soporte: AvanceMedioInput;
    if (tipo === "archivo") {
      if (!archivo) return setLocal(SIN_SOPORTE_TEXT);
      soporte = { tipo: "archivo", file: archivo };
    } else {
      if (url.trim() === "" || nombre.trim() === "") return setLocal(SIN_SOPORTE_TEXT);
      soporte = { tipo: "enlace", url_externa: url.trim(), nombre: nombre.trim() };
    }
    setLocal(null);
    adjuntar.mutate({ reportId, soporte }, { onSuccess: cerrar });
  }

  if (!abierto) {
    return (
      <Button type="button" variant="outline" size="sm" className="mt-1.5" onClick={() => setAbierto(true)}>
        <Paperclip />
        {ADJUNTAR_ARCHIVO_LABEL}
      </Button>
    );
  }

  return (
    <form
      aria-label={ADJUNTAR_ARCHIVO_LABEL}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        enviar();
      }}
      className="mt-1.5 flex min-w-[200px] flex-col gap-2"
    >
      <div className="flex flex-wrap items-center gap-3">
        {(
          [
            ["archivo", "Archivo"],
            ["enlace", "Enlace"],
          ] as const
        ).map(([valor, label]) => (
          <label key={valor} className={CAPTURE_CHOICE}>
            <input
              type="radio"
              name={`${prefijo}-medio`}
              value={valor}
              checked={tipo === valor}
              onChange={() => setTipo(valor)}
            />
            {label}
          </label>
        ))}
      </div>

      {tipo === "archivo" ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${prefijo}-archivo`} className="text-[12px] text-ink-600">
            Archivo del soporte
          </Label>
          <input
            id={`${prefijo}-archivo`}
            type="file"
            onChange={(event) => setArchivo(event.target.files?.[0] ?? null)}
            className="min-h-11 text-base md:min-h-0 md:text-[12.5px] text-ink-800"
          />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${prefijo}-url`} className="text-[12px] text-ink-600">
              URL
            </Label>
            <Input
              id={`${prefijo}-url`}
              type="url"
              placeholder="https://"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className={CAPTURE_FIELD}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${prefijo}-nombre`} className="text-[12px] text-ink-600">
              Nombre del enlace
            </Label>
            <Input
              id={`${prefijo}-nombre`}
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              className={CAPTURE_FIELD}
            />
          </div>
        </>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" className={CAPTURE_BUTTON} disabled={adjuntar.isPending}>
          Adjuntar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={CAPTURE_BUTTON}
          disabled={adjuntar.isPending}
          onClick={cerrar}
        >
          Cancelar
        </Button>
      </div>
      <InlineError message={local ?? (adjuntar.isError ? errorMessage(adjuntar.error, "No pudimos adjuntar el medio. Inténtalo de nuevo.") : null)} />
    </form>
  );
}

function EntregableRow({
  proyectoId,
  entregable,
  avances,
  canWrite,
  canVoid,
}: {
  proyectoId: string;
  entregable: ProjectDeliverable;
  avances: ProjectAvance[];
  canWrite: boolean;
  canVoid: boolean;
}) {
  const remove = useVoidAvance(proyectoId, entregable.id);
  const [abierto, setAbierto] = useState(false);

  const contado = avances
    .filter((avance) => avance.cuenta)
    .reduce((sum, avance) => sum + Number(avance.cantidad), 0);
  const pendientes = avances.filter((avance) => avance.anulado_at === null && !avance.cuenta).length;

  return (
    <li data-testid="ejecucion-entregable" className="rounded-[10px] bg-ink-100 px-2.5 py-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12.5px] text-ink-800">
        <span className="min-w-0">
          <span className="font-mono text-[11px] text-ink-500 tabular-nums">{entregable.codigo}</span>{" "}
          <span className="font-semibold">{entregable.descripcion}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-600">
          <span>
            Meta {formatMeta(entregable.cantidad_meta)} {entregable.unidad}
          </span>
          <span className="tabular-nums">
            Contado {formatNumero(contado)} {entregable.unidad}
          </span>
          {pendientes > 0 && (
            <span
              data-testid="ejecucion-pendiente-soporte"
              className="inline-flex items-center gap-1 font-semibold text-alerta"
            >
              <AlertTriangle className="size-3.5 shrink-0" strokeWidth={2} />
              {plural(pendientes, "pendiente", "pendientes")} de soporte
            </span>
          )}
        </span>
      </div>

      {avances.length > 0 && (
        <ul data-testid="ejecucion-avances" className="mt-1.5 flex flex-col gap-1">
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

      {canWrite &&
        (abierto ? (
          <CaptureSurface title="Registrar avance" onClose={() => setAbierto(false)}>
            <EjecucionAvanceForm
              projectId={proyectoId}
              entregable={entregable}
              meta={entregable.cantidad_meta}
              avances={avances}
              onDone={() => setAbierto(false)}
            />
          </CaptureSurface>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Registrar avance ${entregable.codigo}`}
            className="mt-1.5"
            onClick={() => setAbierto(true)}
          >
            Registrar avance
          </Button>
        ))}
    </li>
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
    mutate: (variables, options) =>
      adjuntarMedio.mutate({ avanceId: avance.id, soporte: variables.soporte }, options),
    isPending: adjuntarMedio.isPending,
    isError: adjuntarMedio.isError,
    error: adjuntarMedio.error,
    reset: () => adjuntarMedio.reset(),
  };
  const soportes = avance.soportes ?? [];

  return (
    <li
      data-testid="ejecucion-avance"
      className="flex flex-col gap-1 rounded-[8px] bg-panel px-2.5 py-1 text-[12px]"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-ink-700">
          <span className="font-mono text-[11px] text-ink-500 tabular-nums">
            {formatFechaCalendario(avance.fecha)}
          </span>{" "}
          <span className={anulado ? "text-ink-500 line-through" : "font-semibold text-ink-900"}>
            {formatNumero(Number(avance.cantidad))} {unidad}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <ToneBadge tone={badge.tone} label={badge.label} />
          {error && <InlineError message={error} />}
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

      {soportes.length > 0 && (
        <ul data-testid="ejecucion-avance-soportes" className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-ink-500">
          {soportes.map((soporte) => (
            <li key={soporte.id} className="max-w-[160px] truncate">
              {soporte.nombre}
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
