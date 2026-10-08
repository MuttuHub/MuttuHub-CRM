// Semáforo técnico (S4 U6). De solo lectura: el COLOR llega calculado por el
// servidor (`colorTecnicoV2`) y aquí solo se pinta; el cliente JAMÁS lo
// recalcula. Muestra el avance real y programado, la desviación en puntos
// porcentuales, la fecha de corte y, mientras los umbrales no estén confirmados,
// la insignia "No confirmado".

"use client";

import { ToneBadge } from "@/components/crm/shared";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import type { ColorSemaforo, ProjectTechnicalStatus } from "@/hooks/projects";
import type { UiTone } from "@/lib/catalogs";

const COLOR_META: Record<ColorSemaforo, { tone: UiTone; label: string }> = {
  verde: { tone: "exito", label: "Verde" },
  amarillo: { tone: "alerta", label: "Amarillo" },
  rojo: { tone: "riesgo", label: "Rojo" },
};

function formatPct(value: number): string {
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(value)} %`;
}

function formatPp(value: number): string {
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(value)} pp`;
}

export function SemaforoTecnico({ tecnico }: { tecnico: ProjectTechnicalStatus }) {
  const meta = COLOR_META[tecnico.color];

  return (
    <div
      data-testid="semaforo-tecnico"
      data-color={tecnico.color}
      className="rounded-[14px] border border-ink-200 bg-panel p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <ToneBadge tone={meta.tone} label={`Semáforo técnico: ${meta.label}`} />
        {tecnico.umbrales.confirmado === false && <ToneBadge tone="neutro" label="No confirmado" />}
        <span className="text-[12px] text-ink-500">
          Corte al {formatFechaCalendario(tecnico.corte)}
        </span>
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
