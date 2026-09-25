// proyecto-financiero-tab, Phase 3 (design.md "Component Structure"):
// read-only Financiero tab — gauge, semáforo chip + legend, rubro table,
// alert card. Follows the exact `tabs/cronograma-tab.tsx` pattern: "use
// client", no Dialog/Card wrapper (the workspace's `<Tabs>` already supplies
// the chrome), three explicit states (loading/empty/populated).
//
// D1 (design.md): this component computes ZERO semáforo logic —
// `color_financiero`/`color_financiero_total` are rendered verbatim from
// `useBudget`'s response. The only client-side math here is display-only
// (percentage executed, diferencia = proyectado - ejecutado) — never a
// semáforo decision, per D3.

"use client";

import { formatCOP } from "@/hooks/crm";
import { cn } from "@/lib/utils";
import { useBudget, type Budget, type RubroBudget } from "@/hooks/projects";
import type { ColorSemaforo } from "@/lib/semaforo";

// Same verde/amarillo/rojo -> Tailwind token mapping already established by
// `tabs/gantt-tab.tsx` (BAR_COLOR) and `dashboard/tacometro.tsx` (BAND_STROKE).
const CHIP_BG: Record<ColorSemaforo, string> = {
  verde: "bg-exito",
  amarillo: "bg-alerta",
  rojo: "bg-destructivo",
};

const CHIP_TEXT: Record<ColorSemaforo, string> = {
  verde: "text-exito",
  amarillo: "text-alerta",
  rojo: "text-destructivo",
};

const SEMAFORO_LABEL: Record<ColorSemaforo, string> = {
  verde: "En rango",
  amarillo: "Atención",
  rojo: "Sub-sobreejecución",
};

// Static copy per color (design.md Assumptions Taken: the design brief's
// "acción sugerida" is copy, not a new backend field).
const ACCION_SUGERIDA: Partial<Record<ColorSemaforo, string>> = {
  amarillo: "Revisar el ritmo de ejecución de este rubro con el equipo responsable.",
  rojo: "Escalar este rubro a gerencia: la ejecución está fuera del rango esperado.",
};

function porcentajeEjecutado(ejecutado: number, proyectado: number): number {
  if (proyectado <= 0) return 0;
  return Math.round((ejecutado / proyectado) * 100);
}

function SemaforoChip({ color, testId }: { color: ColorSemaforo; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-white",
        CHIP_BG[color],
      )}
    >
      {SEMAFORO_LABEL[color]}
    </span>
  );
}

function RubroRow({ rubro }: { rubro: RubroBudget }) {
  const proyectado = rubro.monto_proyectado_cop;
  const ejecutado = rubro.monto_ejecutado_cop;
  const diferencia = proyectado - ejecutado;
  const pct = porcentajeEjecutado(ejecutado, proyectado);

  return (
    <tr className="border-b border-ink-100 last:border-0">
      <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-medium text-ink-950">
        {rubro.rubro_nombre}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] tabular-nums text-ink-800">
        {formatCOP(proyectado)}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] tabular-nums text-ink-800">
        {formatCOP(ejecutado)}
      </td>
      <td
        data-testid="rubro-diferencia"
        className={cn(
          "whitespace-nowrap px-3 py-2.5 text-[12.5px] font-medium tabular-nums",
          diferencia < 0 ? "text-destructivo" : "text-ink-800",
        )}
      >
        {formatCOP(diferencia)}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] font-semibold tabular-nums text-ink-800">
        {pct}%
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <SemaforoChip color={rubro.color_financiero} testId="rubro-semaforo-chip" />
      </td>
    </tr>
  );
}

function AlertaCard({ rubros }: { rubros: RubroBudget[] }) {
  const enAlerta = rubros.filter((r) => r.color_financiero !== "verde");
  if (enAlerta.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-14 border border-ink-200 bg-panel px-4 py-3">
      <p className="text-[12.5px] font-semibold text-ink-950">Rubros que requieren atención</p>
      <ul className="flex flex-col gap-2">
        {enAlerta.map((rubro) => (
          <li
            key={rubro.rubro_id}
            data-testid="financiero-alerta-item"
            className="flex flex-col gap-0.5 text-[12.5px]"
          >
            <span className={cn("font-medium", CHIP_TEXT[rubro.color_financiero])}>
              {rubro.rubro_nombre}
            </span>
            <span className="text-ink-600">{ACCION_SUGERIDA[rubro.color_financiero]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResumenGauge({ budget }: { budget: Budget }) {
  const pct = porcentajeEjecutado(budget.ejecutado_total, budget.proyectado_total);

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-14 border border-ink-200 bg-panel px-4 py-3">
      <div
        className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(var(--color-${budget.color_financiero_total === "verde" ? "exito" : budget.color_financiero_total === "amarillo" ? "alerta" : "destructivo"}) ${Math.min(pct, 100) * 3.6}deg, var(--color-ink-100) 0deg)`,
        }}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-panel text-[13px] font-bold text-ink-950">
          {pct}%
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <SemaforoChip color={budget.color_financiero_total} testId="financiero-total-chip" />
        <p className="text-[12px] text-ink-600">
          {formatCOP(budget.ejecutado_total)} ejecutados de {formatCOP(budget.proyectado_total)} proyectados
        </p>
      </div>
    </div>
  );
}

export function FinancieroTab({ projectId }: { projectId: string }) {
  const budgetQuery = useBudget(projectId);
  const budget = budgetQuery.data;

  if (budgetQuery.isLoading) {
    return <p className="text-[12.5px] text-ink-600">Cargando…</p>;
  }

  const rubros = budget?.rubros ?? [];
  if (rubros.length === 0) {
    return (
      <p className="text-[12.5px] text-ink-600">
        Este proyecto no tiene líneas presupuestales todavía.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ResumenGauge budget={budget!} />

      <div data-testid="financiero-tabla-scroll" className="overflow-x-auto rounded-14 border border-ink-200">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-600">
              <th className="px-3 py-2.5">Rubro</th>
              <th className="px-3 py-2.5">Asignado</th>
              <th className="px-3 py-2.5">Ejecutado</th>
              <th className="px-3 py-2.5">Diferencia</th>
              <th className="px-3 py-2.5">%</th>
              <th className="px-3 py-2.5">Semáforo</th>
            </tr>
          </thead>
          <tbody>
            {rubros.map((rubro) => (
              <RubroRow key={rubro.rubro_id} rubro={rubro} />
            ))}
          </tbody>
        </table>
      </div>

      <AlertaCard rubros={rubros} />
    </div>
  );
}
