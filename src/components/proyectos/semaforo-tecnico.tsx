// Semáforo técnico (S4 U6). De solo lectura: el COLOR llega calculado por el
// servidor (`colorTecnicoV2`) y aquí solo se pinta; el cliente JAMÁS lo
// recalcula. Muestra el avance real y programado, la desviación en puntos
// porcentuales, la fecha de corte y, mientras los umbrales no estén confirmados,
// la insignia "No confirmado".

"use client";

import { ToneBadge } from "@/components/crm/shared";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import type { ProjectBase, ProjectTechnicalStatus } from "@/hooks/projects";

function formatPct(value: number): string {
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(value)} %`;
}

function formatPp(value: number): string {
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(value)} pp`;
}

export function SemaforoTecnico({
  tecnico,
  onBaseChange,
}: {
  tecnico: ProjectTechnicalStatus;
  /** Con el callback, el semáforo ofrece la base vigente/original (S8); sin él, es solo lectura. */
  onBaseChange?: (base: ProjectBase) => void;
}) {
  return (
    <div
      data-testid="semaforo-tecnico"
      data-color={tecnico.color}
      data-base={tecnico.base}
      className="rounded-[14px] border border-ink-200 bg-panel p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SemaforoChip color={tecnico.color} prefix="Semáforo técnico" />
        {tecnico.umbrales.confirmado === false && <ToneBadge tone="neutro" label="No confirmado" />}
        <span className="text-[12px] text-ink-500">
          Corte al {formatFechaCalendario(tecnico.corte)}
        </span>
        {onBaseChange && (
          <label className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-600">
            Base
            <select
              aria-label="Base"
              value={tecnico.base}
              onChange={(event) => onBaseChange(event.target.value as ProjectBase)}
              className="h-8 rounded-12 border border-ink-200 bg-panel px-2.5 text-[12.5px] text-ink-900"
            >
              <option value="vigente">Vigente</option>
              <option value="original">Original (v0)</option>
            </select>
          </label>
        )}
      </div>

      <dl className="mt-2.5 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-3">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[12px] text-ink-500">Avance real</dt>
          <dd className="font-semibold text-ink-900 tabular-nums">{formatPct(tecnico.avance_real)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[12px] text-ink-500">Avance programado</dt>
          <dd className="font-semibold text-ink-900 tabular-nums">
            {formatPct(tecnico.avance_programado)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[12px] text-ink-500">Desviación</dt>
          <dd className="font-semibold text-ink-900 tabular-nums">{formatPp(tecnico.desviacion_pp)}</dd>
        </div>
      </dl>
    </div>
  );
}
