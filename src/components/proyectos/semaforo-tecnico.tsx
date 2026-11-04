// Semáforo técnico (S4 U6). De solo lectura: el COLOR llega calculado por el
// servidor (`colorTecnicoV2`) y aquí solo se pinta; el cliente JAMÁS lo
// recalcula. Muestra el avance real y programado, la desviación (real - plan)
// en puntos porcentuales, la fecha de corte y, mientras los umbrales no estén confirmados,
// la insignia "No confirmado".

"use client";

import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { AyudaBase, ETIQUETA_BASE, OpcionesBase, SemaforoProvisional, datosAl } from "@/components/proyectos/vocabulario-seguimiento";
import { formatDiferenciaPp, formatFechaCalendario } from "@/components/proyectos/project-display";
import type { ProjectBase, ProjectTechnicalStatus } from "@/hooks/projects";

function formatPct(value: number): string {
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(value)} %`;
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
      className="rounded-inner border border-border bg-panel p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SemaforoChip color={tecnico.color} prefix="Semáforo técnico" />
        {tecnico.umbrales.confirmado === false && <SemaforoProvisional />}
        <span className="text-[12px] text-ink-500">
          {datosAl(formatFechaCalendario(tecnico.corte))}
        </span>
        {onBaseChange && (
          <span className="ml-auto flex items-center gap-1">
          <label className="flex items-center gap-1.5 text-[12px] text-ink-600">
            {ETIQUETA_BASE}
            <select
              aria-label={ETIQUETA_BASE}
              value={tecnico.base}
              onChange={(event) => onBaseChange(event.target.value as ProjectBase)}
              className="h-10 rounded-12 border border-border-strong bg-input-bg px-2.5 text-base text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-[12.5px]"
            >
              <OpcionesBase />
            </select>
          </label>
          <AyudaBase />
          </span>
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
          <dd className="font-semibold text-ink-900 tabular-nums">{formatDiferenciaPp(tecnico.desviacion_pp)}</dd>
        </div>
      </dl>
    </div>
  );
}
