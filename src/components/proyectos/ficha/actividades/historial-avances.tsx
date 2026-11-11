// Historial de avances de una actividad (redesign T2, Interacciones-Actividades tabla 3): a timeline,
// newest first. Each live entry says whether it has a soporte; «Adjuntar soporte» only where it is
// missing and «Anular» only on the latest live report (the void route's rule). A voided entry stays
// visible, not struck through, with its motivo. The query lives in the card; this only draws.

"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusChip } from "@/components/ui/status-chip";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { SIN_SOPORTE_TEXT } from "@/components/proyectos/gasto-form";
import { SelectorArchivo } from "@/components/proyectos/selector-archivo";
import { VoidControl, errorMessage } from "@/components/proyectos/estructura-ui";
import { CAPTURE_BUTTON, CAPTURE_CHOICE, CAPTURE_FIELD, InlineError } from "@/components/proyectos/ui";
import {
  useAttachActivityReportMedio,
  useVoidActivityReport,
  type AvanceMedioInput,
  type ProjectActivity,
  type ProjectActivityReport,
} from "@/hooks/projects";
import { cn } from "@/lib/utils";
import { ENLACE_ACCION, formatNumero, porReciente, ultimoVigente } from "./formato";

const ADJUNTAR_SOPORTE_LABEL = "Adjuntar soporte";
const ADJUNTAR_ERROR = "No pudimos adjuntar el medio. Inténtalo de nuevo.";

export function HistorialAvances({
  proyectoId,
  actividad,
  reportes,
  error,
  canWrite,
  nuevos,
}: {
  proyectoId: string;
  actividad: ProjectActivity;
  reportes: ProjectActivityReport[];
  error: unknown;
  canWrite: boolean;
  /** Reports created in this visit: they carry the «Nuevo» pill. */
  nuevos: ReadonlySet<string>;
}) {
  const remove = useVoidActivityReport(proyectoId, actividad.id);

  if (error) {
    return <InlineError message={errorMessage(error, "No pudimos cargar los avances. Inténtalo de nuevo.")} />;
  }
  if (reportes.length === 0) return null;

  const ultimoId = ultimoVigente(reportes)?.id;
  const ordenados = [...reportes].sort(porReciente);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">Historial de avances</p>
      <ol data-testid="ejecucion-reportes" className="flex min-w-0 flex-col">
        {ordenados.map((reporte, index) => (
          <ReporteRow
            key={reporte.id}
            proyectoId={proyectoId}
            actividad={actividad}
            reporte={reporte}
            canWrite={canWrite}
            esUltimo={reporte.id === ultimoId}
            ultimaFila={index === ordenados.length - 1}
            nuevo={nuevos.has(reporte.id)}
            deleting={remove.isPending && remove.variables?.id === reporte.id}
            error={
              remove.isError && remove.variables?.id === reporte.id
                ? errorMessage(remove.error, "No pudimos anular el reporte.")
                : null
            }
            onVoid={(motivo) => remove.mutate({ id: reporte.id, motivo })}
          />
        ))}
      </ol>
    </div>
  );
}

function ReporteRow({
  proyectoId,
  actividad,
  reporte,
  canWrite,
  esUltimo,
  ultimaFila,
  nuevo,
  deleting,
  error,
  onVoid,
}: {
  proyectoId: string;
  actividad: ProjectActivity;
  reporte: ProjectActivityReport;
  canWrite: boolean;
  esUltimo: boolean;
  ultimaFila: boolean;
  nuevo: boolean;
  deleting: boolean;
  error: string | null;
  onVoid: (motivo: string) => void;
}) {
  const anulado = reporte.anulado_at !== null;
  const conSoporte = reporte.medios > 0;
  const [adjuntando, setAdjuntando] = useState(false);

  return (
    <li data-testid="ejecucion-reporte" className="flex min-w-0 gap-3">
      <span aria-hidden="true" className="flex flex-col items-center">
        <span
          className={cn(
            "mt-1.5 size-2.5 shrink-0 rounded-full",
            anulado ? "border-2 border-ink-300" : conSoporte ? "bg-exito" : "bg-alerta",
          )}
        />
        {!ultimaFila && <span className="w-0.5 flex-1 bg-border" />}
      </span>
      <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", !ultimaFila && "pb-3")}>
        <p className={cn("text-[13.5px] break-words", anulado ? "text-ink-500" : "text-ink-900")}>
          <span className="font-semibold tabular-nums">{formatNumero(Number(reporte.porcentaje))} %</span>
          {" · "}
          {reporte.registrado_por_nombre ?? "Usuario desconocido"}
          {!anulado && ` · ${formatFechaCalendario(reporte.fecha)}`}
          {nuevo && (
            <StatusChip dot={false} tone="info" className="ml-1.5 align-middle">
              Nuevo
            </StatusChip>
          )}
        </p>
        {!anulado && <p className="text-[12.5px] break-words text-ink-700">{reporte.observacion}</p>}
        {anulado && reporte.motivo_anulacion && (
          <p className="text-[12.5px] break-words text-ink-600">Motivo: {reporte.motivo_anulacion}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-600">
          {anulado ? (
            <span>Anulado</span>
          ) : (
            <>
              <span>{conSoporte ? "Con soporte" : "Sin soporte"}</span>
              {canWrite && !conSoporte && !adjuntando && (
                <>
                  <span aria-hidden="true">·</span>
                  <button type="button" className={ENLACE_ACCION} onClick={() => setAdjuntando(true)}>
                    {ADJUNTAR_SOPORTE_LABEL}
                  </button>
                </>
              )}
              {canWrite && esUltimo && (
                <>
                  <span aria-hidden="true">·</span>
                  <VoidControl
                    nombre={`avance del ${formatFechaCalendario(reporte.fecha)}`}
                    pending={deleting}
                    error={null}
                    onConfirm={onVoid}
                  />
                </>
              )}
            </>
          )}
        </div>
        {error && <InlineError message={error} />}
        {adjuntando && (
          <AdjuntarSoporteReporte
            proyectoId={proyectoId}
            actividadId={actividad.id}
            reportId={reporte.id}
            onClose={() => setAdjuntando(false)}
          />
        )}
      </div>
    </li>
  );
}

/** Adjuntar-después (S11): archivo o enlace on a report that has no soporte yet. */
function AdjuntarSoporteReporte({
  proyectoId,
  actividadId,
  reportId,
  onClose,
}: {
  proyectoId: string;
  actividadId: string;
  reportId: string;
  onClose: () => void;
}) {
  const adjuntar = useAttachActivityReportMedio(proyectoId, actividadId);
  const prefijo = useId();
  const [tipo, setTipo] = useState<"archivo" | "enlace">("archivo");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [nombre, setNombre] = useState("");
  const [local, setLocal] = useState<string | null>(null);

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
    adjuntar.mutate({ reportId, soporte }, { onSuccess: onClose });
  }

  return (
    <form
      aria-label={ADJUNTAR_SOPORTE_LABEL}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        enviar();
      }}
      className="mt-1.5 flex min-w-0 flex-col gap-2"
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
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={`${prefijo}-archivo`} className="text-[12px] text-ink-600">
            Archivo del soporte
          </Label>
          <SelectorArchivo id={`${prefijo}-archivo`} onChange={setArchivo} />
        </div>
      ) : (
        <>
          <div className="flex min-w-0 flex-col gap-1">
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
          <div className="flex min-w-0 flex-col gap-1">
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

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" className={CAPTURE_BUTTON} disabled={adjuntar.isPending}>
          Adjuntar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={CAPTURE_BUTTON}
          disabled={adjuntar.isPending}
          onClick={onClose}
        >
          Cancelar
        </Button>
      </div>
      <InlineError message={local ?? (adjuntar.isError ? errorMessage(adjuntar.error, ADJUNTAR_ERROR) : null)} />
    </form>
  );
}
