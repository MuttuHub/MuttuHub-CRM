// Progreso de una actividad dentro de "Ejecución técnica" (S4 U6/U7): barra de
// avance, insignia de estado y, por cada entregable, meta, cantidad contada, el
// contador de avances "pendiente de soporte", su historial de avances, el
// control de anulación (solo gestores) y el alta de un avance.

"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ToneBadge } from "@/components/crm/shared";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { EjecucionAvanceForm } from "@/components/proyectos/ejecucion-avance-form";
import { VoidControl, errorMessage, plural } from "@/components/proyectos/estructura-ui";
import { InlineError } from "@/components/proyectos/ui";
import {
  useVoidAvance,
  type EstadoActividad,
  type ProjectActivity,
  type ProjectAvance,
  type ProjectDeliverable,
  type ProjectDeliverableProgress,
  type ProjectTechnicalActivity,
} from "@/hooks/projects";
import type { UiTone } from "@/lib/catalogs";

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

export function EjecucionAvance({
  proyectoId,
  actividad,
  tecnico,
  entregables,
  progreso,
  canWrite,
  canVoid,
}: {
  proyectoId: string;
  actividad: ProjectActivity;
  tecnico: ProjectTechnicalActivity;
  entregables: ProjectDeliverable[];
  progreso: Map<string, ProjectDeliverableProgress>;
  canWrite: boolean;
  canVoid: boolean;
}) {
  const estado = ESTADO_META[tecnico.estado];

  return (
    <li
      data-testid="ejecucion-actividad"
      className="rounded-[12px] border border-ink-200 bg-panel p-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] text-ink-900">
          <span className="font-mono text-[11px] text-ink-500 tabular-nums">{actividad.codigo}</span>{" "}
          <span className="font-semibold">{actividad.nombre}</span>
        </p>
        <ToneBadge tone={estado.tone} label={estado.label} />
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <ProgressBar
          data-testid="ejecucion-progreso"
          aria-label={`Avance de la actividad ${actividad.codigo}`}
          value={tecnico.progreso}
        />
        <span className="shrink-0 text-[12px] text-ink-600 tabular-nums">
          {`${formatNumero(tecnico.progreso)} %`}
        </span>
      </div>

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
              avance={avance}
              unidad={entregable.unidad}
              canVoid={canVoid}
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
          <EjecucionAvanceForm
            projectId={proyectoId}
            entregable={entregable}
            meta={entregable.cantidad_meta}
            avances={avances}
            onDone={() => setAbierto(false)}
          />
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
  avance,
  unidad,
  canVoid,
  deleting,
  error,
  onVoid,
}: {
  avance: ProjectAvance;
  unidad: string;
  canVoid: boolean;
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

  return (
    <li
      data-testid="ejecucion-avance"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[8px] bg-panel px-2.5 py-1 text-[12px]"
    >
      <span className="text-ink-700">
        <span className="font-mono text-[11px] text-ink-500 tabular-nums">
          {formatFechaCalendario(avance.fecha)}
        </span>{" "}
        <span className={anulado ? "text-ink-500 line-through" : "font-semibold text-ink-900"}>
          {formatNumero(Number(avance.cantidad))} {unidad}
        </span>
        {avance.medios > 0 && <span className="text-ink-500"> · {plural(avance.medios, "medio", "medios")}</span>}
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
    </li>
  );
}
