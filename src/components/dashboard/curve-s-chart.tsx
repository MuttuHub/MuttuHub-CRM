// Gráfica de Curva S para el Tablero de Control Gerencial
// Muestra el acumulado mensual de peso (planificado) vs gasto (ejecutado)
//
// gestion-proyectos-workspace, Phase 4 (design.md T6): `CurveSChart` is now
// exported (props only) and `CurveSChartContainer` reads
// `useProjectDashboard` instead of self-fetching. `CurveSChartContainer`
// keeps its exact default-export name and a zero-arg-compatible signature
// (F1.6: the standalone `/tablero-gerencial-client.tsx` that motivated it
// was removed, but nothing calls this with `projectId` and expects the
// per-project behavior to break — kept as-is, out of scope for that change);
// the Resumen tab reuses it with `projectId` set.

'use client';

import { EmptyState } from '@/components/ui/empty-state';
import { useProjectDashboard, type ProjectDashboard } from '@/hooks/projects';

type CurveSData = ProjectDashboard['curva_s'];

// D5 (resolved 2026-09-29): brand-colored series. Tokens only (no raw hex);
// both flip with the theme (rose-100 and ink-* are re-pinned in `.dark`).
const PLAN_BAR = 'bg-rose-100 border border-dashed border-rose-400';
const EXEC_BAR = 'bg-primary';

interface CurveSChartProps {
  data: CurveSData | null;
}

export function CurveSChart({ data }: CurveSChartProps) {
  if (!data || !data.meses.length) {
    return (
      <div className="bg-panel border border-ink-200 rounded-[20px] p-4">
        <h3 className="text-sm font-semibold">Curva S</h3>
        <EmptyState description="Sin datos disponibles" />
      </div>
    );
  }

  // Encontrar el valor máximo para escalar el eje Y
  const maxValor = Math.max(
    ...data.planificado,
    ...data.ejecutado,
    0
  );

  return (
    <div className="bg-panel border border-ink-200 rounded-[20px] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Curva S</h3>
        {/* D5: both series use brand tokens, never the semaforo colors. The
            plan is a tinted rose bar with a DASHED outline and the executed
            series is a SOLID primary bar, so the pair also differs without
            relying on color. Swatches mirror the bar classes exactly. */}
        <div className="flex items-center gap-3 text-xs text-ink-700">
          <span className="flex items-center gap-1.5">
            <span
              data-testid="curve-s-legend-planificado"
              aria-hidden="true"
              className={`size-3 rounded-sm ${PLAN_BAR}`}
            />
            <span>Planificado</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span
              data-testid="curve-s-legend-ejecutado"
              aria-hidden="true"
              className={`size-3 rounded-sm ${EXEC_BAR}`}
            />
            <span>Ejecutado</span>
          </span>
        </div>
      </div>

      {/* Gráfico de barras simple */}
      <div className="h-[200px] relative">
        {/* Eje Y - marcas de porcentaje
            Cada marca necesita un `top` explícito: sin él, un `position:
            absolute` cae en su "static position" y, al ser hermanas
            consecutivas sin altura en el flujo, las 5 colapsan en el mismo
            punto. 100% arriba (top: 0%) y 0% abajo (top: 100%): eje
            invertido respecto al valor. `translateY(-50%)` centra la línea
            sobre el punto exacto en vez de apoyar el borde superior ahí. */}
        {[0, 25, 50, 75, 100].map((pct) => (
          <div
            key={pct}
            data-testid={`y-axis-mark-${pct}`}
            className="absolute left-0 right-0"
            style={{ top: `${100 - pct}%`, transform: 'translateY(-50%)' }}
          >
            <div className="flex h-[1px] items-center justify-between">
              <div className="w-[80%] bg-ink-200" />
              <div className="text-[10px] text-ink-400">{pct}%</div>
            </div>
          </div>
        ))}

        {/* Barras de datos */}
        <div className="absolute inset-0 flex items-end justify-between px-4 pb-2">
          {data.meses.map((mes, index) => {
            const planPct = maxValor > 0 ? (data.planificado[index] / maxValor) * 100 : 0;
            const ejecPct = maxValor > 0 ? (data.ejecutado[index] / maxValor) * 100 : 0;
            return (
              <div key={index} className="flex flex-col items-center gap-1">
                <div className="flex items-end gap-0.5" style={{ height: '160px' }}>
                  <div
                    data-testid={`curve-s-bar-planificado-${index}`}
                    className={`w-[10px] rounded-t-sm ${PLAN_BAR}`}
                    style={{ height: `${planPct}%` }}
                  />
                  <div
                    data-testid={`curve-s-bar-ejecutado-${index}`}
                    className={`w-[10px] rounded-t-sm ${EXEC_BAR}`}
                    style={{ height: `${ejecPct}%` }}
                  />
                </div>
                <span className="text-[10px] text-ink-400">
                  {mes.substring(0, 3)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Container: `projectId` omitted (or `undefined`) keeps the org-wide
 * aggregate (used by `CaraGerencial`, the 5.ª cara — F1.6); a project id
 * scopes it to that project's Resumen tab (design.md T6). */
export default function CurveSChartContainer({ projectId }: { projectId?: string | null } = {}) {
  const query = useProjectDashboard(projectId ?? null);

  if (query.isLoading) {
    return <div className="flex h-[300px] items-center justify-center">Cargando curva S...</div>;
  }
  if (query.isError) {
    return (
      <div className="flex h-[300px] items-center justify-center text-destructivo">
        No se pudo cargar la curva S
      </div>
    );
  }

  return <CurveSChart data={query.data ? query.data.curva_s : null} />;
}