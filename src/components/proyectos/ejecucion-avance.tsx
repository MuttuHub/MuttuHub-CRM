// Progreso de una actividad dentro de "Ejecución técnica" (S4 U6): barra de
// avance, insignia de estado y, por cada entregable, meta, cantidad contada y
// el contador de avances "pendiente de soporte" (registrados sin medio vivo).

"use client";

import { AlertTriangle } from "lucide-react";
import { ToneBadge } from "@/components/crm/shared";
import { plural } from "@/components/proyectos/estructura-ui";
import type {
  EstadoActividad,
  ProjectActivity,
  ProjectDeliverable,
  ProjectDeliverableProgress,
  ProjectTechnicalActivity,
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
  actividad,
  tecnico,
  entregables,
  progreso,
}: {
  actividad: ProjectActivity;
  tecnico: ProjectTechnicalActivity;
  entregables: ProjectDeliverable[];
  progreso: Map<string, ProjectDeliverableProgress>;
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
        <progress
          data-testid="ejecucion-progreso"
          value={tecnico.progreso}
          max={100}
          className="h-2 w-full overflow-hidden rounded-full accent-rose-600"
        />
        <span className="shrink-0 text-[12px] text-ink-600 tabular-nums">
          {`${formatNumero(tecnico.progreso)} %`}
        </span>
      </div>

      {entregables.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {entregables.map((entregable) => {
            const avances = progreso.get(entregable.id)?.avances ?? [];
            const contado = avances
              .filter((avance) => avance.cuenta)
              .reduce((sum, avance) => sum + Number(avance.cantidad), 0);
            const pendientes = avances.filter(
              (avance) => avance.anulado_at === null && !avance.cuenta,
            ).length;

            return (
              <li
                key={entregable.id}
                data-testid="ejecucion-entregable"
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[10px] bg-ink-100 px-2.5 py-1.5 text-[12.5px] text-ink-800"
              >
                <span className="min-w-0">
                  <span className="font-mono text-[11px] text-ink-500 tabular-nums">
                    {entregable.codigo}
                  </span>{" "}
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
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
